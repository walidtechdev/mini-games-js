"""PixelForge HTTP API."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.comfy_client import ComfyClient, ComfyOfflineError, gpu_summary
from app.config import COMFY_OFFLINE_MESSAGE
from app.jobs import job_manager
from app.pixel_ops import blank_image, dumps_sheet, open_rgba, pack_spritesheet, png_bytes
from app.repository import (
    ANIMATION_PHRASES,
    ANIMATIONS,
    DIRECTION_PHRASES,
    DIRECTIONS_8,
    abs_from_storage,
    add_reference,
    apply_style,
    create_asset,
    create_category,
    create_job,
    create_project,
    create_style,
    delete_asset,
    delete_project,
    delete_reference,
    delete_style,
    delete_version,
    duplicate_version,
    effective_settings,
    ensure_png,
    get_asset,
    get_asset_detail,
    get_job,
    get_project,
    get_reference,
    get_style,
    get_version,
    list_assets,
    list_categories,
    list_jobs,
    list_logs,
    list_project_animations,
    list_projects,
    list_styles,
    list_versions,
    log_event,
    new_id,
    read_version_bytes,
    reorder_frames,
    resolve_seed,
    save_settings,
    save_version_png,
    set_approved,
    set_primary,
    update_asset,
    update_style,
    update_version_meta,
)
from app.workflows import get_adapter, list_workflows

router = APIRouter()

DURATION_DEFAULTS = {"idle": 150, "walk": 120, "run": 80, "attack": 100, "hurt": 120, "death": 160}


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    asset_type: str = "object"


class AssetCreate(BaseModel):
    project_id: str
    category_id: str
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    style_id: str | None = None
    asset_type: str | None = None


class AssetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    style_id: str | None = None
    metadata: dict[str, Any] | None = None


class StyleBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    prompt_prefix: str = ""
    negative_prompt: str = ""
    model: str = ""
    lora: str = ""
    lora_strength: float = 0.8
    steps: int = 20
    cfg: float = 7
    width: int = 512
    height: int = 512
    preferred_workflow: str = "txt2sprite"
    params: dict[str, Any] = {}


class GenerateBody(BaseModel):
    asset_id: str
    workflow_id: str
    inputs: dict[str, Any] = {}
    style_id: str | None = None


class DirectionsBody(BaseModel):
    asset_id: str
    inputs: dict[str, Any] = {}
    directions: list[str] = Field(min_length=1)
    style_id: str | None = None
    workflow_id: str = "directions"


class AnimationBody(BaseModel):
    asset_id: str
    inputs: dict[str, Any] = {}
    animation: str
    directions: list[str] = Field(min_length=1)
    frame_count: int = Field(ge=1, le=24)
    style_id: str | None = None
    workflow_id: str = "animation"
    duration_ms: int | None = None


class BlankFramesBody(BaseModel):
    animation: str
    direction: str = "front"
    count: int = Field(ge=1, le=24)
    width: int = Field(default=32, ge=1, le=512)
    height: int = Field(default=32, ge=1, le=512)
    duration_ms: int = 120


class ReorderBody(BaseModel):
    animation: str
    direction: str
    version_ids: list[str]


class VersionMetaBody(BaseModel):
    duration_ms: int | None = None
    frame_index: int | None = None


class SpriteSheetBody(BaseModel):
    version_ids: list[str] = Field(min_length=1)
    columns: int = Field(ge=1, le=64)
    rows: int = Field(ge=1, le=64)
    padding: int = Field(default=0, ge=0, le=64)
    cell_width: int = Field(default=32, ge=1, le=1024)
    cell_height: int = Field(default=32, ge=1, le=1024)
    background: str = "#00000000"


class SettingsBody(BaseModel):
    comfyui_url: str | None = None
    storage_dir: str | None = None
    default_workflow: str | None = None
    default_model: str | None = None
    default_lora: str | None = None
    default_width: int | None = None
    default_height: int | None = None
    default_steps: int | None = None
    default_cfg: float | None = None
    default_project_id: str | None = None


def _missing(exc: Exception) -> HTTPException:
    return HTTPException(status_code=404, detail="That record was not found.")


def _asset_or_404(asset_id: str) -> dict[str, Any]:
    try:
        return get_asset(asset_id)
    except KeyError as exc:
        raise _missing(exc) from exc


def _prepare_inputs(asset: dict[str, Any], inputs: dict[str, Any], style_id: str | None) -> dict[str, Any]:
    settings = effective_settings()
    merged = apply_style(dict(inputs), style_id)
    merged = resolve_seed(merged)
    if not merged.get("model"):
        merged["model"] = settings["default_model"]
    if not merged.get("width"):
        merged["width"] = settings["default_width"]
    if not merged.get("height"):
        merged["height"] = settings["default_height"]
    if not merged.get("steps"):
        merged["steps"] = settings["default_steps"]
    if not merged.get("cfg"):
        merged["cfg"] = settings["default_cfg"]
    merged["asset_id"] = asset["id"]
    merged["asset_slug"] = asset["slug"]
    merged["project_id"] = asset["project_id"]
    return merged


def _validate_workflow(workflow_id: str, inputs: dict[str, Any]) -> None:
    try:
        adapter = get_adapter(workflow_id)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Unknown workflow '{workflow_id}'.") from exc
    for spec in adapter.inputs_schema():
        if not spec.get("required"):
            continue
        value = inputs.get(spec["key"])
        if spec["type"] == "image":
            if not value:
                raise HTTPException(status_code=400, detail=f"{spec['label']} is required.")
            continue
        if value is None or value == "":
            raise HTTPException(status_code=400, detail=f"{spec['label']} is required.")


async def _enqueue(workflow_id: str, asset: dict[str, Any], inputs: dict[str, Any], label: str, batch_id: str = "") -> dict[str, Any]:
    _validate_workflow(workflow_id, inputs)
    job = create_job(
        workflow_id=workflow_id,
        params=inputs,
        asset_id=asset["id"],
        project_id=asset["project_id"],
        label=label,
        batch_id=batch_id,
    )
    await job_manager.enqueue(job["id"])
    return job


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": "PixelForge Studio"}


@router.get("/workflows")
def workflows() -> list[dict[str, Any]]:
    return list_workflows()


@router.get("/projects")
def projects() -> list[dict[str, Any]]:
    return list_projects()


@router.post("/projects")
def post_project(body: ProjectCreate) -> dict[str, Any]:
    project = create_project(body.name, body.description)
    categories = list_categories(project["id"])
    return {**project, "categories": categories}


@router.get("/projects/{project_id}")
def project_detail(project_id: str) -> dict[str, Any]:
    try:
        project = get_project(project_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    return {**project, "categories": list_categories(project_id)}


@router.delete("/projects/{project_id}")
def remove_project(project_id: str) -> dict[str, bool]:
    try:
        delete_project(project_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    return {"ok": True}


@router.post("/projects/{project_id}/categories")
def post_category(project_id: str, body: CategoryCreate) -> dict[str, Any]:
    try:
        return create_category(project_id, body.name, body.asset_type)
    except KeyError as exc:
        raise _missing(exc) from exc


@router.get("/projects/{project_id}/animations")
def project_animations(project_id: str) -> list[dict[str, Any]]:
    try:
        get_project(project_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    return list_project_animations(project_id)


@router.get("/assets")
def assets(project_id: str, category_id: str | None = None) -> list[dict[str, Any]]:
    return list_assets(project_id, category_id)


@router.post("/assets")
def post_asset(body: AssetCreate) -> dict[str, Any]:
    try:
        return create_asset(
            body.project_id,
            body.category_id,
            body.name,
            body.description,
            body.style_id,
            body.asset_type,
        )
    except KeyError as exc:
        raise _missing(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/assets/{asset_id}")
def asset_detail(asset_id: str) -> dict[str, Any]:
    try:
        return get_asset_detail(asset_id)
    except KeyError as exc:
        raise _missing(exc) from exc


@router.patch("/assets/{asset_id}")
def patch_asset(asset_id: str, body: AssetUpdate) -> dict[str, Any]:
    _asset_or_404(asset_id)
    fields = body.model_dump(exclude_unset=True)
    return update_asset(asset_id, fields)


@router.delete("/assets/{asset_id}")
def remove_asset(asset_id: str) -> dict[str, bool]:
    try:
        delete_asset(asset_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    return {"ok": True}


@router.post("/assets/{asset_id}/references")
async def post_reference(
    asset_id: str,
    file: UploadFile = File(...),
    label: str = Form("concept"),
) -> dict[str, Any]:
    _asset_or_404(asset_id)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The reference file is empty.")
    try:
        return add_reference(asset_id, label, data, file.filename or "reference.png")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/references/{reference_id}")
def remove_reference(reference_id: str) -> dict[str, bool]:
    try:
        delete_reference(reference_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    return {"ok": True}


@router.post("/assets/{asset_id}/versions/upload")
async def upload_version(
    asset_id: str,
    file: UploadFile = File(...),
    kind: str = Form("edit"),
    prompt: str = Form(""),
    direction: str = Form(""),
    animation_name: str = Form(""),
    frame_index: int | None = Form(None),
    duration_ms: int = Form(100),
    parent_version_id: str | None = Form(None),
) -> dict[str, Any]:
    _asset_or_404(asset_id)
    data = await file.read()
    try:
        png = ensure_png(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return save_version_png(
        asset_id,
        png,
        kind=kind or "edit",
        prompt=prompt,
        workflow_id="editor" if kind == "edit" else kind,
        parent_version_id=parent_version_id,
        direction=direction,
        animation_name=animation_name,
        frame_index=frame_index,
        duration_ms=duration_ms,
        parameters={"source": "pixel-editor"},
    )


@router.post("/assets/{asset_id}/frames")
def post_blank_frames(asset_id: str, body: BlankFramesBody) -> list[dict[str, Any]]:
    _asset_or_404(asset_id)
    if body.animation not in ANIMATIONS:
        raise HTTPException(status_code=400, detail="Unknown animation.")
    if body.direction not in DIRECTIONS_8:
        raise HTTPException(status_code=400, detail="Unknown direction.")
    existing = [
        v
        for v in list_versions(asset_id)
        if v["animation_name"] == body.animation and v["direction"] == body.direction and v["frame_index"] is not None
    ]
    start = max((int(v["frame_index"]) for v in existing), default=-1) + 1
    png = png_bytes(blank_image(body.width, body.height))
    created = []
    for offset in range(body.count):
        created.append(
            save_version_png(
                asset_id,
                png,
                kind="animation",
                workflow_id="editor",
                animation_name=body.animation,
                direction=body.direction,
                frame_index=start + offset,
                duration_ms=body.duration_ms,
                parameters={"source": "blank-frame"},
                prompt=f"Blank {body.animation} frame",
            )
        )
    return created


@router.post("/assets/{asset_id}/animations/reorder")
def post_reorder(asset_id: str, body: ReorderBody) -> list[dict[str, Any]]:
    _asset_or_404(asset_id)
    return reorder_frames(asset_id, body.animation, body.direction, body.version_ids)


@router.post("/assets/{asset_id}/spritesheet")
def post_spritesheet(asset_id: str, body: SpriteSheetBody) -> dict[str, Any]:
    asset = _asset_or_404(asset_id)
    frames = []
    for version_id in body.version_ids:
        try:
            version = get_version(version_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="A selected frame was not found.") from exc
        if version["asset_id"] != asset["id"]:
            raise HTTPException(status_code=400, detail="Frames must belong to this asset.")
        data, _name = read_version_bytes(version_id)
        frames.append(
            (
                open_rgba(data),
                {
                    "frame": version["frame_index"] if version["frame_index"] is not None else len(frames),
                    "duration": version["duration_ms"],
                    "animation": version["animation_name"],
                    "direction": version["direction"],
                },
            )
        )
    try:
        sheet, document = pack_spritesheet(
            frames,
            columns=body.columns,
            rows=body.rows,
            padding=body.padding,
            cell_width=body.cell_width,
            cell_height=body.cell_height,
            background=body.background,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    version = save_version_png(
        asset_id,
        png_bytes(sheet),
        kind="spritesheet",
        workflow_id="spritesheet",
        parameters=body.model_dump(),
        sheet_json=dumps_sheet(document),
        subdir="animations/sheets",
        prompt="Spritesheet export",
    )
    version["sheet"] = document
    version["json_url"] = f"/api/versions/{version['id']}/sheet.json"
    return version


@router.get("/versions/{version_id}/sheet.json")
def sheet_json(version_id: str) -> Response:
    try:
        version = get_version(version_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    if not version["sheet_json_path"]:
        raise HTTPException(status_code=404, detail="This version has no spritesheet JSON.")
    payload = abs_from_storage(version["sheet_json_path"]).read_text(encoding="utf-8")
    return Response(content=payload, media_type="application/json")


@router.post("/versions/{version_id}/primary")
def primary(version_id: str) -> dict[str, Any]:
    try:
        return set_primary(version_id)
    except KeyError as exc:
        raise _missing(exc) from exc


@router.post("/versions/{version_id}/approve")
def approve(version_id: str, approved: bool = True) -> dict[str, Any]:
    try:
        return set_approved(version_id, approved)
    except KeyError as exc:
        raise _missing(exc) from exc


@router.post("/versions/{version_id}/save")
def save_copy(version_id: str) -> dict[str, Any]:
    try:
        return duplicate_version(version_id)
    except KeyError as exc:
        raise _missing(exc) from exc


@router.patch("/versions/{version_id}")
def patch_version(version_id: str, body: VersionMetaBody) -> dict[str, Any]:
    try:
        return update_version_meta(version_id, body.duration_ms, body.frame_index)
    except KeyError as exc:
        raise _missing(exc) from exc


@router.delete("/versions/{version_id}")
def remove_version(version_id: str) -> dict[str, bool]:
    try:
        delete_version(version_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    return {"ok": True}


@router.post("/versions/{version_id}/reproduce")
async def reproduce(version_id: str) -> dict[str, Any]:
    try:
        version = get_version(version_id)
        asset = get_asset(version["asset_id"])
    except KeyError as exc:
        raise _missing(exc) from exc
    if not version["workflow_id"] or version["workflow_id"] in {"editor", "spritesheet"}:
        raise HTTPException(status_code=400, detail="This version has no ComfyUI workflow to reproduce.")
    params = json.loads(version["parameters_json"] or "{}")
    params.pop("comfy_image", None)
    params["asset_slug"] = asset["slug"]
    label = f"Reproduce #{int(version['number']):03d}"
    return await _enqueue(version["workflow_id"], asset, params, label)


@router.post("/generate")
async def generate(body: GenerateBody) -> dict[str, Any]:
    asset = _asset_or_404(body.asset_id)
    inputs = _prepare_inputs(asset, body.inputs, body.style_id)
    return await _enqueue(body.workflow_id, asset, inputs, "Generate")


@router.post("/directions")
async def directions(body: DirectionsBody) -> list[dict[str, Any]]:
    asset = _asset_or_404(body.asset_id)
    unknown = [item for item in body.directions if item not in DIRECTIONS_8]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown direction: {unknown[0]}")
    base = _prepare_inputs(asset, body.inputs, body.style_id)
    batch = new_id()
    jobs = []
    for facing in body.directions:
        params = dict(base)
        phrase = DIRECTION_PHRASES[facing]
        params["prompt"] = f"{params.get('prompt') or ''}, {phrase}".strip(", ")
        params["direction"] = facing
        params["seed"] = int(params["seed"]) + DIRECTIONS_8.index(facing)
        jobs.append(await _enqueue(body.workflow_id, asset, params, f"Direction {facing}", batch))
    return jobs


@router.post("/animation")
async def animation(body: AnimationBody) -> list[dict[str, Any]]:
    asset = _asset_or_404(body.asset_id)
    if body.animation not in ANIMATIONS:
        raise HTTPException(status_code=400, detail="Unknown animation.")
    unknown = [item for item in body.directions if item not in DIRECTIONS_8]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown direction: {unknown[0]}")
    base = _prepare_inputs(asset, body.inputs, body.style_id)
    duration = body.duration_ms or DURATION_DEFAULTS.get(body.animation, 100)
    batch = new_id()
    jobs = []
    for facing in body.directions:
        for frame in range(body.frame_count):
            params = dict(base)
            phrase = (
                f"{ANIMATION_PHRASES[body.animation]}, frame {frame + 1} of {body.frame_count}, "
                f"{DIRECTION_PHRASES[facing]}"
            )
            params["prompt"] = f"{params.get('prompt') or ''}, {phrase}".strip(", ")
            params["animation_name"] = body.animation
            params["direction"] = facing
            params["frame_index"] = frame
            params["duration_ms"] = duration
            params["seed"] = int(params["seed"]) + frame + DIRECTIONS_8.index(facing) * 100
            label = f"{body.animation} {facing} frame {frame + 1}"
            jobs.append(await _enqueue(body.workflow_id, asset, params, label, batch))
    return jobs


@router.get("/jobs")
def jobs() -> list[dict[str, Any]]:
    return list_jobs(100)


@router.get("/jobs/{job_id}")
def job_detail(job_id: str) -> dict[str, Any]:
    try:
        return get_job(job_id)
    except KeyError as exc:
        raise _missing(exc) from exc


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict[str, Any]:
    try:
        return await job_manager.cancel(job_id)
    except KeyError as exc:
        raise _missing(exc) from exc


@router.get("/styles")
def styles() -> list[dict[str, Any]]:
    return list_styles()


@router.post("/styles")
def post_style(body: StyleBody) -> dict[str, Any]:
    try:
        return create_style(body.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not create that style. The name may already exist.") from exc


@router.put("/styles/{style_id}")
def put_style(style_id: str, body: StyleBody) -> dict[str, Any]:
    try:
        get_style(style_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    return update_style(style_id, body.model_dump())


@router.delete("/styles/{style_id}")
def remove_style(style_id: str) -> dict[str, bool]:
    try:
        delete_style(style_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/settings")
def get_settings_route() -> dict[str, Any]:
    return effective_settings()


@router.put("/settings")
def put_settings(body: SettingsBody) -> dict[str, Any]:
    return save_settings(body.model_dump(exclude_unset=True))


@router.post("/settings/test-comfy")
async def test_comfy() -> dict[str, Any]:
    settings = effective_settings()
    client = ComfyClient(settings["comfyui_url"], settings["comfy_client_id"])
    try:
        stats = await client.system_stats()
    except ComfyOfflineError as exc:
        log_event("error", exc.user_message, exc.raw)
        return {"ok": False, "status": "Offline", "message": COMFY_OFFLINE_MESSAGE, "gpu": None}
    summary = gpu_summary(stats)
    log_event("info", "ComfyUI connected.", str(summary))
    return {"ok": True, "status": "Connected", "message": "Connected", "gpu": summary}


@router.get("/logs")
def logs() -> list[dict[str, Any]]:
    return list_logs(200)


@router.get("/media/versions/{version_id}")
def media_version(version_id: str) -> FileResponse:
    try:
        version = get_version(version_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    path = abs_from_storage(version["file_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="The image file is missing from storage.")
    return FileResponse(path, media_type="image/png", filename=path.name)


@router.get("/media/references/{reference_id}")
def media_reference(reference_id: str) -> FileResponse:
    try:
        ref = get_reference(reference_id)
    except KeyError as exc:
        raise _missing(exc) from exc
    path = abs_from_storage(ref["file_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="The reference file is missing from storage.")
    return FileResponse(path, filename=path.name)


@router.websocket("/ws")
async def jobs_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    await job_manager.subscribe(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        job_manager.unsubscribe(websocket)
