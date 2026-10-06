"""Single-user job queue. Local pixel ops run here; AI jobs talk to ComfyUI."""

from __future__ import annotations

import asyncio
import json
import logging
import traceback
from typing import Any

from fastapi import WebSocket
from PIL import Image

from app.comfy_client import (
    ComfyClient,
    ComfyOfflineError,
    ComfyWorkflowError,
    JobCancelled,
)
from app.pixel_ops import open_rgba, png_bytes
from app.repository import (
    effective_settings,
    get_asset,
    get_job,
    jobs_by_status,
    list_jobs,
    log_event,
    save_version_png,
    storage_root,
    update_job,
)
from app.workflows import get_adapter

logger = logging.getLogger("pixelforge.jobs")

KIND_FOR_WORKFLOW = {
    "txt2sprite": "generation",
    "image_edit": "edit",
    "directions": "direction",
    "animation": "animation",
    "upscale": "upscale",
    "background_removal": "background_removal",
    "pixelize": "pixelize",
}


class JobManager:
    def __init__(self) -> None:
        self.queue: asyncio.Queue[str] | None = None
        self.task: asyncio.Task[None] | None = None
        self.subscribers: set[WebSocket] = set()
        self.cancel_flags: set[str] = set()
        self.current_job_id: str | None = None
        self.current_prompt_id: str | None = None

    async def start(self) -> None:
        self.queue = asyncio.Queue()
        for job in jobs_by_status(["running"]):
            update_job(
                job["id"],
                status="failed",
                error="PixelForge restarted while this job was running.",
                message="Failed",
                progress=0,
            )
            log_event("error", "Job interrupted by restart.", job["id"])
        for job in jobs_by_status(["queued"]):
            self.queue.put_nowait(job["id"])
        self.task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self.task is not None:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass

    async def enqueue(self, job_id: str) -> None:
        if self.queue is None:
            raise RuntimeError("Job runner is not started")
        self.queue.put_nowait(job_id)
        await self.broadcast()

    async def cancel(self, job_id: str) -> dict[str, Any]:
        job = get_job(job_id)
        if job["status"] in {"completed", "failed", "cancelled"}:
            return job
        self.cancel_flags.add(job_id)
        if job["status"] == "running" and self.current_job_id == job_id and self.current_prompt_id:
            settings = effective_settings()
            client = ComfyClient(settings["comfyui_url"], settings["comfy_client_id"])
            await client.interrupt()
            await client.delete_queue_item(self.current_prompt_id)
        if job["status"] == "queued":
            update_job(job_id, status="cancelled", message="Cancelled", error="", progress=0)
        await self.broadcast()
        return get_job(job_id)

    async def subscribe(self, websocket: WebSocket) -> None:
        self.subscribers.add(websocket)
        await websocket.send_text(json.dumps({"type": "jobs", "jobs": list_jobs(80)}))

    def unsubscribe(self, websocket: WebSocket) -> None:
        self.subscribers.discard(websocket)

    async def broadcast(self) -> None:
        payload = json.dumps({"type": "jobs", "jobs": list_jobs(80)})
        dead: list[WebSocket] = []
        for websocket in list(self.subscribers):
            try:
                await websocket.send_text(payload)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            self.subscribers.discard(websocket)

    async def _loop(self) -> None:
        assert self.queue is not None
        while True:
            job_id = await self.queue.get()
            try:
                await self._run(job_id)
            except Exception:
                logger.exception("Unhandled job failure %s", job_id)
                log_event("error", "Unhandled job failure.", traceback.format_exc())
                try:
                    update_job(
                        job_id,
                        status="failed",
                        error="Something went wrong while running this job.",
                        raw_log=traceback.format_exc(),
                        message="Failed",
                    )
                except Exception:
                    logger.exception("Could not record job failure")
            finally:
                self.current_job_id = None
                self.current_prompt_id = None
                self.queue.task_done()
                await self.broadcast()

    async def _run(self, job_id: str) -> None:
        job = get_job(job_id)
        if job_id in self.cancel_flags or job["status"] == "cancelled":
            update_job(job_id, status="cancelled", message="Cancelled", progress=0)
            return
        self.current_job_id = job_id
        update_job(job_id, status="running", message="Starting", progress=1)
        await self.broadcast()
        params = dict(job_params(job))
        adapter = get_adapter(job["workflow_id"])
        image = _load_source(params)
        try:
            if adapter.is_local(params):
                if image is None:
                    raise ValueError("Choose an image first.")
                if job_id in self.cancel_flags:
                    raise JobCancelled()
                update_job(job_id, message="Pixelizing", progress=40)
                await self.broadcast()
                result = adapter.execute_local(params, image)
                _store_results(job, params, [png_bytes(result)])
                update_job(job_id, status="completed", message="Completed", progress=100, error="")
                return

            settings = effective_settings()
            client = ComfyClient(settings["comfyui_url"], settings["comfy_client_id"])
            if image is not None:
                params["source_width"], params["source_height"] = image.size
                tmp_dir = storage_root() / "tmp"
                tmp_dir.mkdir(parents=True, exist_ok=True)
                tmp_path = tmp_dir / f"{job_id}.png"
                image.save(tmp_path, format="PNG")
                update_job(job_id, message="Uploading image to ComfyUI", progress=8)
                await self.broadcast()
                params["comfy_image"] = await client.upload_image(tmp_path, tmp_path.name)
            workflow = adapter.build_workflow(params, settings)
            update_job(job_id, message="Queued in ComfyUI", progress=12, raw_log=json.dumps(workflow)[:20000])
            await self.broadcast()
            prompt_id = await client.queue_prompt(workflow)
            self.current_prompt_id = prompt_id
            update_job(job_id, prompt_id=prompt_id, message="Running in ComfyUI", progress=15)

            async def on_progress(fraction: float, message: str) -> None:
                if job_id in self.cancel_flags:
                    return
                if fraction >= 0:
                    progress = max(15.0, min(95.0, 15 + fraction * 80))
                    update_job(job_id, progress=progress, message=message or "Running")
                elif message:
                    update_job(job_id, message=message)
                await self.broadcast()

            images = await client.wait_for_images(prompt_id, on_progress, lambda: job_id in self.cancel_flags)
            if job_id in self.cancel_flags:
                raise JobCancelled()
            pngs: list[bytes] = []
            for info in images:
                pngs.append(await client.view_image(info["filename"], info["subfolder"], info["type"]))
            if not pngs:
                raise ComfyWorkflowError("ComfyUI finished without returning an image.", prompt_id)
            _store_results(job, params, pngs)
            update_job(job_id, status="completed", message="Completed", progress=100, error="")
        except JobCancelled:
            update_job(job_id, status="cancelled", message="Cancelled", error="", progress=0)
            log_event("info", "Job cancelled.", job_id)
        except ComfyOfflineError as exc:
            update_job(job_id, status="failed", message="Failed", error=exc.user_message, raw_log=exc.raw)
            log_event("error", exc.user_message, exc.raw)
        except ComfyWorkflowError as exc:
            update_job(job_id, status="failed", message="Failed", error=exc.user_message, raw_log=exc.raw)
            log_event("error", exc.user_message, exc.raw)
        except Exception as exc:
            raw = traceback.format_exc()
            message = str(exc).strip() or "Something went wrong while running this job."
            if len(message) > 240:
                message = "Something went wrong while running this job."
            update_job(job_id, status="failed", message="Failed", error=message, raw_log=raw)
            log_event("error", message, raw)
        finally:
            tmp = storage_root() / "tmp" / f"{job_id}.png"
            if tmp.exists():
                tmp.unlink()


def job_params(job: dict[str, Any]) -> dict[str, Any]:
    raw = job.get("params_json")
    if isinstance(raw, str):
        return json.loads(raw or "{}")
    # list_jobs already returns parsed jobs without params. Read from the stored column via a side channel.
    from app.db import get_db

    row = get_db().query_one("SELECT params_json FROM jobs WHERE id = ?", (job["id"],))
    if not row:
        return {}
    return json.loads(row["params_json"] or "{}")


def _load_source(params: dict[str, Any]) -> Image.Image | None:
    image_ref = params.get("image")
    if not image_ref:
        return None
    from app.repository import ensure_png, load_image_ref

    data, _name, _ident = load_image_ref(str(image_ref))
    return open_rgba(ensure_png(data))


def _store_results(job: dict[str, Any], params: dict[str, Any], pngs: list[bytes]) -> None:
    asset_id = job.get("asset_id")
    if not asset_id:
        raise ValueError("This job is not attached to an asset.")
    asset = get_asset(asset_id)
    kind = KIND_FOR_WORKFLOW.get(job["workflow_id"], "generation")
    parent = None
    image_ref = str(params.get("image") or "")
    if image_ref.startswith("version:"):
        parent = image_ref.split(":", 1)[1]
    frame_index = params.get("frame_index")
    if frame_index is not None:
        frame_index = int(frame_index)
    for png in pngs:
        save_version_png(
            asset["id"],
            png,
            kind=kind,
            prompt=str(params.get("prompt") or ""),
            negative_prompt=str(params.get("negative_prompt") or ""),
            seed=_optional_int(params.get("seed")),
            workflow_id=job["workflow_id"],
            parameters=params,
            model=str(params.get("model") or ""),
            lora=str(params.get("lora") or ""),
            parent_version_id=parent,
            direction=str(params.get("direction") or ""),
            animation_name=str(params.get("animation_name") or ""),
            frame_index=frame_index,
            duration_ms=int(params.get("duration_ms") or 100),
        )


def _optional_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    return int(value)


job_manager = JobManager()
