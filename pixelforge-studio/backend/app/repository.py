"""Projects, assets, versions, styles, settings, and filesystem mirrors."""

from __future__ import annotations

import io
import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

from app.config import get_env, resolve_storage_dir
from app.db import get_db
from app.pixel_ops import image_size, png_bytes

DEFAULT_CATEGORIES: list[tuple[str, str, str]] = [
    ("Characters", "characters", "character"),
    ("Enemies", "enemies", "enemy"),
    ("NPCs", "npcs", "npc"),
    ("Objects", "objects", "object"),
    ("Environments", "environments", "environment"),
    ("Tilesets", "tilesets", "tileset"),
    ("UI", "ui", "ui"),
]

BUILTIN_STYLES: list[dict[str, Any]] = [
    {
        "name": "SNES RPG",
        "prompt_prefix": "SNES era RPG pixel art sprite, 16-bit, limited palette, crisp black outline, transparent background",
        "negative_prompt": "blurry, photorealistic, 3d, anti-aliased, text, watermark, jpeg artifacts",
        "width": 64,
        "height": 64,
        "steps": 24,
        "cfg": 7,
        "preferred_workflow": "txt2sprite",
    },
    {
        "name": "GBA",
        "prompt_prefix": "Game Boy Advance pixel art sprite, 32-color look, clean silhouette, transparent background",
        "negative_prompt": "photorealistic, blurry, 3d render, text, watermark",
        "width": 64,
        "height": 64,
        "steps": 22,
        "cfg": 7,
        "preferred_workflow": "txt2sprite",
    },
    {
        "name": "16-bit fantasy",
        "prompt_prefix": "16-bit fantasy JRPG pixel art, detailed costume, readable silhouette, transparent background",
        "negative_prompt": "photorealistic, blurry, 3d, text, watermark, extra limbs",
        "width": 96,
        "height": 96,
        "steps": 28,
        "cfg": 7.5,
        "preferred_workflow": "txt2sprite",
    },
    {
        "name": "32-bit RPG",
        "prompt_prefix": "late 90s 32-bit RPG pixel sprite, richer shading, crisp pixels, transparent background",
        "negative_prompt": "photorealistic, blurry, oil painting, text, watermark",
        "width": 128,
        "height": 128,
        "steps": 28,
        "cfg": 7,
        "preferred_workflow": "txt2sprite",
    },
    {
        "name": "Dark fantasy",
        "prompt_prefix": "dark fantasy pixel art sprite, muted colors, worn materials, dramatic silhouette, transparent background",
        "negative_prompt": "cute, chibi, photorealistic, blurry, text, watermark, bright plastic",
        "width": 128,
        "height": 128,
        "steps": 30,
        "cfg": 8,
        "preferred_workflow": "txt2sprite",
    },
]

REFERENCE_LABELS = {"concept", "face", "weapon", "armor", "color", "other"}
ANIMATIONS = ("idle", "walk", "run", "attack", "hurt", "death")
DIRECTIONS_4 = ("front", "back", "left", "right")
DIRECTIONS_8 = DIRECTIONS_4 + ("front-left", "front-right", "back-left", "back-right")
DIRECTION_PHRASES = {
    "front": "front view, facing the camera",
    "back": "back view, facing away from the camera",
    "left": "left side view, facing left",
    "right": "right side view, facing right",
    "front-left": "three-quarter view facing front-left",
    "front-right": "three-quarter view facing front-right",
    "back-left": "three-quarter back-left view",
    "back-right": "three-quarter back-right view",
}
ANIMATION_PHRASES = {
    "idle": "idle stance",
    "walk": "walk cycle",
    "run": "run cycle",
    "attack": "attack motion",
    "hurt": "hurt reaction",
    "death": "defeat collapse",
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "item"


def storage_root() -> Path:
    stored = get_setting("storage_dir")
    return resolve_storage_dir(stored or None)


def rel_to_storage(path: Path) -> str:
    return path.resolve().relative_to(storage_root().resolve()).as_posix()


def abs_from_storage(relative: str) -> Path:
    root = storage_root().resolve()
    full = (root / relative).resolve()
    if full != root and root not in full.parents:
        raise ValueError("Path escapes the storage directory")
    return full


def log_event(level: str, message: str, detail: str = "") -> None:
    get_db().execute(
        "INSERT INTO dev_logs (level, message, detail, created_at) VALUES (?, ?, ?, ?)",
        (level, message, detail[:20000], now()),
    )
    # Keep the developer panel from growing without bound.
    get_db().execute(
        "DELETE FROM dev_logs WHERE id NOT IN (SELECT id FROM dev_logs ORDER BY id DESC LIMIT 400)"
    )


def list_logs(limit: int = 200) -> list[dict[str, Any]]:
    return get_db().query(
        "SELECT id, level, message, detail, created_at FROM dev_logs ORDER BY id DESC LIMIT ?",
        (limit,),
    )


def get_setting(key: str) -> str | None:
    row = get_db().query_one("SELECT value FROM settings WHERE key = ?", (key,))
    if not row:
        return None
    return str(row["value"])


def get_settings_map() -> dict[str, str]:
    rows = get_db().query("SELECT key, value FROM settings")
    return {str(row["key"]): str(row["value"]) for row in rows}


def effective_settings() -> dict[str, Any]:
    env = get_env()
    stored = get_settings_map()

    def pick(key: str, fallback: Any) -> Any:
        if key in stored and stored[key] != "":
            return stored[key]
        return fallback

    storage = str(pick("storage_dir", env.storage_dir))
    return {
        "comfyui_url": str(pick("comfyui_url", env.comfyui_url)).rstrip("/"),
        "comfyui_path": str(pick("comfyui_path", env.comfyui_path)),
        "storage_dir": storage,
        "default_workflow": str(pick("default_workflow", env.default_workflow)),
        "default_model": str(pick("default_model", env.default_model)),
        "default_lora": str(pick("default_lora", env.default_lora)),
        "default_width": int(pick("default_width", env.default_width)),
        "default_height": int(pick("default_height", env.default_height)),
        "default_steps": int(pick("default_steps", env.default_steps)),
        "default_cfg": float(pick("default_cfg", env.default_cfg)),
        "default_project_id": stored.get("default_project_id", ""),
        "comfy_client_id": stored.get("comfy_client_id", ""),
    }


def save_settings(values: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "comfyui_url",
        "comfyui_path",
        "storage_dir",
        "default_workflow",
        "default_model",
        "default_lora",
        "default_width",
        "default_height",
        "default_steps",
        "default_cfg",
        "default_project_id",
    }
    with get_db().transaction() as conn:
        for key, value in values.items():
            if key not in allowed or value is None:
                continue
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, str(value)),
            )
    if values.get("storage_dir"):
        resolve_storage_dir(str(values["storage_dir"]))
    return effective_settings()


def seed() -> None:
    db = get_db()
    if get_setting("comfy_client_id") is None:
        env = get_env()
        defaults = {
            "comfyui_url": env.comfyui_url,
            "comfyui_path": env.comfyui_path,
            "storage_dir": env.storage_dir,
            "default_workflow": env.default_workflow,
            "default_model": env.default_model,
            "default_lora": env.default_lora,
            "default_width": str(env.default_width),
            "default_height": str(env.default_height),
            "default_steps": str(env.default_steps),
            "default_cfg": str(env.default_cfg),
            "default_project_id": "",
            "comfy_client_id": new_id(),
        }
        with db.transaction() as conn:
            for key, value in defaults.items():
                conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (key, value))
    # The first build stored a checkpoint name that is not on this machine.
    if get_setting("default_model") == "v1-5-pruned-emaonly.safetensors":
        env = get_env()
        db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            ("default_model", env.default_model),
        )
    if get_setting("comfyui_path") is None:
        env = get_env()
        db.execute("INSERT INTO settings (key, value) VALUES (?, ?)", ("comfyui_path", env.comfyui_path))
    existing = db.query_one("SELECT COUNT(*) AS n FROM styles")
    if existing and int(existing["n"]) == 0:
        stamp = now()
        with db.transaction() as conn:
            for style in BUILTIN_STYLES:
                conn.execute(
                    """
                    INSERT INTO styles (
                      id, name, prompt_prefix, negative_prompt, model, lora, lora_strength,
                      steps, cfg, width, height, preferred_workflow, params_json, is_builtin,
                      created_at, updated_at
                    ) VALUES (?, ?, ?, ?, '', '', 0.8, ?, ?, ?, ?, ?, '{}', 1, ?, ?)
                    """,
                    (
                        new_id(),
                        style["name"],
                        style["prompt_prefix"],
                        style["negative_prompt"],
                        style["steps"],
                        style["cfg"],
                        style["width"],
                        style["height"],
                        style["preferred_workflow"],
                        stamp,
                        stamp,
                    ),
                )


def _unique_slug(base: str, taken: set[str]) -> str:
    slug = base
    index = 2
    while slug in taken:
        slug = f"{base}-{index}"
        index += 1
    return slug


def project_folder(slug: str) -> Path:
    path = storage_root() / "projects" / slug
    path.mkdir(parents=True, exist_ok=True)
    return path


def asset_folder(project_slug: str, category_slug: str, asset_slug: str) -> Path:
    path = project_folder(project_slug) / category_slug / asset_slug
    for name in ("references", "generations", "approved", "animations"):
        (path / name).mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def mirror_project(project_id: str) -> None:
    project = get_project(project_id)
    categories = list_categories(project_id)
    folder = project_folder(project["slug"])
    for category in categories:
        (folder / category["slug"]).mkdir(parents=True, exist_ok=True)
    write_json(
        folder / "project.json",
        {
            "id": project["id"],
            "name": project["name"],
            "slug": project["slug"],
            "description": project["description"],
            "standard_prompt": project.get("standard_prompt") or "",
            "categories": [c["slug"] for c in categories],
            "updated_at": project["updated_at"],
        },
    )


def mirror_asset(asset_id: str) -> None:
    asset = get_asset(asset_id)
    project = get_project(asset["project_id"])
    category = get_category(asset["category_id"])
    folder = asset_folder(project["slug"], category["slug"], asset["slug"])
    versions = list_versions(asset_id)
    references = list_references(asset_id)
    write_json(
        folder / "asset.json",
        {
            "id": asset["id"],
            "name": asset["name"],
            "slug": asset["slug"],
            "type": asset["asset_type"],
            "description": asset["description"],
            "style_id": asset["style_id"],
            "primary_version_id": asset["primary_version_id"],
            "metadata": json.loads(asset["metadata_json"] or "{}"),
            "versions": [
                {
                    "id": v["id"],
                    "number": v["number"],
                    "kind": v["kind"],
                    "file": v["file_path"],
                    "prompt": v["prompt"],
                    "seed": v["seed"],
                    "workflow_id": v["workflow_id"],
                    "model": v["model"],
                    "lora": v["lora"],
                    "direction": v["direction"],
                    "animation_name": v["animation_name"],
                    "frame_index": v["frame_index"],
                    "is_primary": bool(v["is_primary"]),
                    "is_approved": bool(v["is_approved"]),
                    "created_at": v["created_at"],
                }
                for v in versions
            ],
            "references": [
                {"id": r["id"], "label": r["label"], "file": r["file_path"]} for r in references
            ],
            "updated_at": asset["updated_at"],
        },
    )


def style_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "prompt_prefix": row["prompt_prefix"],
        "negative_prompt": row["negative_prompt"],
        "model": row["model"],
        "lora": row["lora"],
        "lora_strength": row["lora_strength"],
        "steps": row["steps"],
        "cfg": row["cfg"],
        "width": row["width"],
        "height": row["height"],
        "preferred_workflow": row["preferred_workflow"],
        "params": json.loads(row["params_json"] or "{}"),
        "is_builtin": bool(row["is_builtin"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def version_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "asset_id": row["asset_id"],
        "parent_version_id": row["parent_version_id"],
        "kind": row["kind"],
        "number": row["number"],
        "prompt": row["prompt"],
        "negative_prompt": row["negative_prompt"],
        "seed": row["seed"],
        "workflow_id": row["workflow_id"],
        "parameters": json.loads(row["parameters_json"] or "{}"),
        "model": row["model"],
        "lora": row["lora"],
        "file_path": row["file_path"],
        "width": row["width"],
        "height": row["height"],
        "direction": row["direction"],
        "animation_name": row["animation_name"],
        "frame_index": row["frame_index"],
        "duration_ms": row["duration_ms"],
        "is_primary": bool(row["is_primary"]),
        "is_approved": bool(row["is_approved"]),
        "has_sheet_json": bool(row["sheet_json_path"]),
        "created_at": row["created_at"],
        "url": f"/api/media/versions/{row['id']}",
    }


def reference_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "asset_id": row["asset_id"],
        "label": row["label"],
        "file_path": row["file_path"],
        "width": row["width"],
        "height": row["height"],
        "created_at": row["created_at"],
        "url": f"/api/media/references/{row['id']}",
    }


def job_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "asset_id": row.get("asset_id"),
        "project_id": row.get("project_id"),
        "asset_name": row.get("asset_name") or "",
        "workflow_id": row["workflow_id"],
        "status": row["status"],
        "progress": row["progress"],
        "message": row["message"],
        "prompt_id": row["prompt_id"],
        "error": row["error"],
        "raw_log": row["raw_log"],
        "params": json.loads(row["params_json"] or "{}") if "params_json" in row.keys() else {},
        "batch_id": row["batch_id"],
        "label": row["label"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_projects() -> list[dict[str, Any]]:
    return get_db().query("SELECT * FROM projects ORDER BY updated_at DESC")


def get_project(project_id: str) -> dict[str, Any]:
    row = get_db().query_one("SELECT * FROM projects WHERE id = ?", (project_id,))
    if not row:
        raise KeyError(project_id)
    return row


def create_project(name: str, description: str = "") -> dict[str, Any]:
    stamp = now()
    project_id = new_id()
    taken = {row["slug"] for row in get_db().query("SELECT slug FROM projects")}
    slug = _unique_slug(slugify(name), taken)
    with get_db().transaction() as conn:
        conn.execute(
            "INSERT INTO projects (id, name, slug, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (project_id, name.strip(), slug, description.strip(), stamp, stamp),
        )
        for index, (cat_name, cat_slug, asset_type) in enumerate(DEFAULT_CATEGORIES):
            conn.execute(
                """
                INSERT INTO categories (id, project_id, name, slug, asset_type, sort_order, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (new_id(), project_id, cat_name, cat_slug, asset_type, index, stamp),
            )
    mirror_project(project_id)
    return get_project(project_id)


def update_project(project_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    current = get_project(project_id)
    name = fields.get("name", current["name"])
    description = fields.get("description", current["description"])
    standard_prompt = fields.get("standard_prompt", current.get("standard_prompt") or "")
    get_db().execute(
        """
        UPDATE projects
        SET name = ?, description = ?, standard_prompt = ?, updated_at = ?
        WHERE id = ?
        """,
        (str(name).strip(), str(description), str(standard_prompt), now(), project_id),
    )
    mirror_project(project_id)
    return get_project(project_id)


def delete_project(project_id: str) -> None:
    project = get_project(project_id)
    folder = storage_root() / "projects" / project["slug"]
    get_db().execute("DELETE FROM projects WHERE id = ?", (project_id,))
    if folder.exists():
        shutil.rmtree(folder)


def list_categories(project_id: str) -> list[dict[str, Any]]:
    return get_db().query(
        "SELECT * FROM categories WHERE project_id = ? ORDER BY sort_order, name",
        (project_id,),
    )


def get_category(category_id: str) -> dict[str, Any]:
    row = get_db().query_one("SELECT * FROM categories WHERE id = ?", (category_id,))
    if not row:
        raise KeyError(category_id)
    return row


def create_category(project_id: str, name: str, asset_type: str = "object") -> dict[str, Any]:
    get_project(project_id)
    taken = {row["slug"] for row in list_categories(project_id)}
    slug = _unique_slug(slugify(name), taken)
    order_row = get_db().query_one(
        "SELECT COALESCE(MAX(sort_order), -1) AS n FROM categories WHERE project_id = ?",
        (project_id,),
    )
    sort_order = int(order_row["n"]) + 1 if order_row else 0
    category_id = new_id()
    get_db().execute(
        """
        INSERT INTO categories (id, project_id, name, slug, asset_type, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (category_id, project_id, name.strip(), slug, asset_type.strip() or "object", sort_order, now()),
    )
    mirror_project(project_id)
    return get_category(category_id)


def list_project_animations(project_id: str) -> list[dict[str, Any]]:
    rows = get_db().query(
        """
        SELECT versions.*, assets.name AS asset_name
        FROM versions
        JOIN assets ON assets.id = versions.asset_id
        WHERE assets.project_id = ? AND versions.kind = 'animation'
        ORDER BY assets.name, versions.animation_name, versions.direction, versions.frame_index, versions.number
        """,
        (project_id,),
    )
    return [{**version_out(row), "asset_name": row["asset_name"]} for row in rows]


def list_assets(project_id: str, category_id: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM assets WHERE project_id = ?"
    params: list[Any] = [project_id]
    if category_id:
        sql += " AND category_id = ?"
        params.append(category_id)
    sql += " ORDER BY updated_at DESC"
    rows = get_db().query(sql, tuple(params))
    return [asset_summary(row) for row in rows]


def asset_summary(row: dict[str, Any]) -> dict[str, Any]:
    primary = None
    if row["primary_version_id"]:
        primary = get_db().query_one("SELECT id FROM versions WHERE id = ?", (row["primary_version_id"],))
    counts = get_db().query_one(
        "SELECT COUNT(*) AS n FROM versions WHERE asset_id = ?",
        (row["id"],),
    )
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "category_id": row["category_id"],
        "name": row["name"],
        "slug": row["slug"],
        "asset_type": row["asset_type"],
        "description": row["description"],
        "style_id": row["style_id"],
        "primary_version_id": row["primary_version_id"],
        "thumb_url": f"/api/media/versions/{row['primary_version_id']}" if primary else "",
        "version_count": int(counts["n"]) if counts else 0,
        "metadata": json.loads(row["metadata_json"] or "{}"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_asset(asset_id: str) -> dict[str, Any]:
    row = get_db().query_one("SELECT * FROM assets WHERE id = ?", (asset_id,))
    if not row:
        raise KeyError(asset_id)
    return row


def get_asset_detail(asset_id: str) -> dict[str, Any]:
    row = get_asset(asset_id)
    summary = asset_summary(row)
    project = get_project(row["project_id"])
    category = get_category(row["category_id"])
    summary["project_name"] = project["name"]
    summary["project_slug"] = project["slug"]
    summary["category_name"] = category["name"]
    summary["category_slug"] = category["slug"]
    summary["versions"] = [version_out(v) for v in list_versions(asset_id)]
    summary["references"] = [reference_out(r) for r in list_references(asset_id)]
    return summary


def create_asset(
    project_id: str,
    category_id: str,
    name: str,
    description: str = "",
    style_id: str | None = None,
    asset_type: str | None = None,
) -> dict[str, Any]:
    project = get_project(project_id)
    category = get_category(category_id)
    if category["project_id"] != project_id:
        raise ValueError("Category does not belong to this project")
    taken = {
        row["slug"]
        for row in get_db().query("SELECT slug FROM assets WHERE category_id = ?", (category_id,))
    }
    slug = _unique_slug(slugify(name), taken)
    asset_id = new_id()
    stamp = now()
    kind = asset_type or category["asset_type"]
    get_db().execute(
        """
        INSERT INTO assets (
          id, project_id, category_id, name, slug, asset_type, description, style_id,
          primary_version_id, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, '{}', ?, ?)
        """,
        (asset_id, project_id, category_id, name.strip(), slug, kind, description.strip(), style_id, stamp, stamp),
    )
    asset_folder(project["slug"], category["slug"], slug)
    mirror_asset(asset_id)
    return get_asset_detail(asset_id)


def update_asset(asset_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    current = get_asset(asset_id)
    name = fields.get("name", current["name"])
    description = fields.get("description", current["description"])
    style_id = fields.get("style_id", current["style_id"])
    metadata = fields.get("metadata", json.loads(current["metadata_json"] or "{}"))
    get_db().execute(
        """
        UPDATE assets
        SET name = ?, description = ?, style_id = ?, metadata_json = ?, updated_at = ?
        WHERE id = ?
        """,
        (str(name).strip(), str(description), style_id, json.dumps(metadata), now(), asset_id),
    )
    mirror_asset(asset_id)
    return get_asset_detail(asset_id)


def delete_asset(asset_id: str) -> None:
    asset = get_asset(asset_id)
    project = get_project(asset["project_id"])
    category = get_category(asset["category_id"])
    folder = storage_root() / "projects" / project["slug"] / category["slug"] / asset["slug"]
    get_db().execute("DELETE FROM assets WHERE id = ?", (asset_id,))
    if folder.exists():
        shutil.rmtree(folder)


def list_versions(asset_id: str) -> list[dict[str, Any]]:
    return get_db().query(
        "SELECT * FROM versions WHERE asset_id = ? ORDER BY number DESC",
        (asset_id,),
    )


def get_version(version_id: str) -> dict[str, Any]:
    row = get_db().query_one("SELECT * FROM versions WHERE id = ?", (version_id,))
    if not row:
        raise KeyError(version_id)
    return row


def list_references(asset_id: str) -> list[dict[str, Any]]:
    return get_db().query(
        "SELECT * FROM asset_references WHERE asset_id = ? ORDER BY created_at DESC",
        (asset_id,),
    )


def get_reference(reference_id: str) -> dict[str, Any]:
    row = get_db().query_one("SELECT * FROM asset_references WHERE id = ?", (reference_id,))
    if not row:
        raise KeyError(reference_id)
    return row


def _touch_asset(asset_id: str) -> None:
    get_db().execute("UPDATE assets SET updated_at = ? WHERE id = ?", (now(), asset_id))


def save_version_png(
    asset_id: str,
    png: bytes,
    *,
    kind: str,
    prompt: str = "",
    negative_prompt: str = "",
    seed: int | None = None,
    workflow_id: str = "",
    parameters: dict[str, Any] | None = None,
    model: str = "",
    lora: str = "",
    parent_version_id: str | None = None,
    direction: str = "",
    animation_name: str = "",
    frame_index: int | None = None,
    duration_ms: int = 100,
    sheet_json: str | None = None,
    subdir: str | None = None,
) -> dict[str, Any]:
    asset = get_asset(asset_id)
    project = get_project(asset["project_id"])
    category = get_category(asset["category_id"])
    folder = asset_folder(project["slug"], category["slug"], asset["slug"])
    with get_db().transaction() as conn:
        row = conn.execute(
            "SELECT COALESCE(MAX(number), 0) + 1 AS n FROM versions WHERE asset_id = ?",
            (asset_id,),
        ).fetchone()
        number = int(row["n"])
        version_id = new_id()
        width, height = image_size(png)
        if subdir:
            dest_dir = folder / subdir
        elif kind == "animation":
            anim = slugify(animation_name or "anim")
            facing = slugify(direction or "none")
            dest_dir = folder / "animations" / anim / facing
        else:
            dest_dir = folder / "generations"
        dest_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{kind}-{number:03d}.png"
        dest = dest_dir / filename
        dest.write_bytes(png)
        relative = rel_to_storage(dest)
        sheet_relative = ""
        if sheet_json is not None:
            sheet_path = dest.with_suffix(".json")
            sheet_path.write_text(sheet_json, encoding="utf-8")
            sheet_relative = rel_to_storage(sheet_path)
        conn.execute(
            """
            INSERT INTO versions (
              id, asset_id, parent_version_id, kind, number, prompt, negative_prompt, seed,
              workflow_id, parameters_json, model, lora, file_path, approved_path, width, height,
              direction, animation_name, frame_index, duration_ms, is_primary, is_approved,
              sheet_json_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
            """,
            (
                version_id,
                asset_id,
                parent_version_id,
                kind,
                number,
                prompt,
                negative_prompt,
                seed,
                workflow_id,
                json.dumps(parameters or {}),
                model,
                lora,
                relative,
                width,
                height,
                direction,
                animation_name,
                frame_index,
                duration_ms,
                sheet_relative,
                now(),
            ),
        )
        primary = conn.execute(
            "SELECT primary_version_id FROM assets WHERE id = ?",
            (asset_id,),
        ).fetchone()
        if primary and not primary["primary_version_id"]:
            conn.execute(
                "UPDATE assets SET primary_version_id = ? WHERE id = ?",
                (version_id, asset_id),
            )
            conn.execute("UPDATE versions SET is_primary = 1 WHERE id = ?", (version_id,))
    _touch_asset(asset_id)
    mirror_asset(asset_id)
    return version_out(get_version(version_id))


def add_reference(asset_id: str, label: str, data: bytes, filename: str) -> dict[str, Any]:
    safe_label = label if label in REFERENCE_LABELS else "other"
    asset = get_asset(asset_id)
    project = get_project(asset["project_id"])
    category = get_category(asset["category_id"])
    folder = asset_folder(project["slug"], category["slug"], asset["slug"]) / "references"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}:
        suffix = ".png"
    ref_id = new_id()
    dest = folder / f"{safe_label}-{ref_id}{suffix}"
    dest.write_bytes(data)
    try:
        width, height = image_size(data)
    except Exception:
        width, height = 0, 0
    get_db().execute(
        """
        INSERT INTO asset_references (id, asset_id, label, file_path, width, height, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (ref_id, asset_id, safe_label, rel_to_storage(dest), width, height, now()),
    )
    _touch_asset(asset_id)
    mirror_asset(asset_id)
    return reference_out(get_reference(ref_id))


def delete_reference(reference_id: str) -> None:
    row = get_reference(reference_id)
    path = abs_from_storage(row["file_path"])
    get_db().execute("DELETE FROM asset_references WHERE id = ?", (reference_id,))
    if path.exists():
        path.unlink()
    mirror_asset(row["asset_id"])


def set_primary(version_id: str) -> dict[str, Any]:
    version = get_version(version_id)
    with get_db().transaction() as conn:
        conn.execute("UPDATE versions SET is_primary = 0 WHERE asset_id = ?", (version["asset_id"],))
        conn.execute("UPDATE versions SET is_primary = 1 WHERE id = ?", (version_id,))
        conn.execute(
            "UPDATE assets SET primary_version_id = ?, updated_at = ? WHERE id = ?",
            (version_id, now(), version["asset_id"]),
        )
    mirror_asset(version["asset_id"])
    return version_out(get_version(version_id))


def set_approved(version_id: str, approved: bool) -> dict[str, Any]:
    version = get_version(version_id)
    asset = get_asset(version["asset_id"])
    project = get_project(asset["project_id"])
    category = get_category(asset["category_id"])
    folder = asset_folder(project["slug"], category["slug"], asset["slug"])
    if approved:
        src = abs_from_storage(version["file_path"])
        dest = folder / "approved" / src.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        get_db().execute(
            "UPDATE versions SET is_approved = 1, approved_path = ? WHERE id = ?",
            (rel_to_storage(dest), version_id),
        )
    else:
        if version["approved_path"]:
            path = abs_from_storage(version["approved_path"])
            if path.exists():
                path.unlink()
        get_db().execute(
            "UPDATE versions SET is_approved = 0, approved_path = '' WHERE id = ?",
            (version_id,),
        )
    _touch_asset(version["asset_id"])
    mirror_asset(version["asset_id"])
    return version_out(get_version(version_id))


def duplicate_version(version_id: str) -> dict[str, Any]:
    version = get_version(version_id)
    data = abs_from_storage(version["file_path"]).read_bytes()
    params = json.loads(version["parameters_json"] or "{}")
    params["saved_from"] = version_id
    return save_version_png(
        version["asset_id"],
        data,
        kind=version["kind"],
        prompt=version["prompt"],
        negative_prompt=version["negative_prompt"],
        seed=version["seed"],
        workflow_id=version["workflow_id"],
        parameters=params,
        model=version["model"],
        lora=version["lora"],
        parent_version_id=version_id,
        direction=version["direction"],
        animation_name=version["animation_name"],
        frame_index=version["frame_index"],
        duration_ms=version["duration_ms"],
    )


def delete_version(version_id: str) -> None:
    version = get_version(version_id)
    asset = get_asset(version["asset_id"])
    path = abs_from_storage(version["file_path"])
    with get_db().transaction() as conn:
        conn.execute("DELETE FROM versions WHERE id = ?", (version_id,))
        if asset["primary_version_id"] == version_id:
            replacement = conn.execute(
                "SELECT id FROM versions WHERE asset_id = ? ORDER BY number DESC LIMIT 1",
                (asset["id"],),
            ).fetchone()
            next_id = replacement["id"] if replacement else None
            conn.execute(
                "UPDATE assets SET primary_version_id = ?, updated_at = ? WHERE id = ?",
                (next_id, now(), asset["id"]),
            )
            if next_id:
                conn.execute("UPDATE versions SET is_primary = 1 WHERE id = ?", (next_id,))
    if path.exists():
        path.unlink()
    sheet = version["sheet_json_path"]
    if sheet:
        sheet_path = abs_from_storage(sheet)
        if sheet_path.exists():
            sheet_path.unlink()
    if version["approved_path"]:
        approved = abs_from_storage(version["approved_path"])
        if approved.exists():
            approved.unlink()
    mirror_asset(asset["id"])


def update_version_meta(version_id: str, duration_ms: int | None = None, frame_index: int | None = None) -> dict[str, Any]:
    version = get_version(version_id)
    duration = version["duration_ms"] if duration_ms is None else int(duration_ms)
    frame = version["frame_index"] if frame_index is None else frame_index
    get_db().execute(
        "UPDATE versions SET duration_ms = ?, frame_index = ? WHERE id = ?",
        (duration, frame, version_id),
    )
    mirror_asset(version["asset_id"])
    return version_out(get_version(version_id))


def reorder_frames(asset_id: str, animation: str, direction: str, version_ids: list[str]) -> list[dict[str, Any]]:
    with get_db().transaction() as conn:
        for index, version_id in enumerate(version_ids):
            conn.execute(
                """
                UPDATE versions
                SET frame_index = ?
                WHERE id = ? AND asset_id = ? AND animation_name = ? AND direction = ?
                """,
                (index, version_id, asset_id, animation, direction),
            )
    mirror_asset(asset_id)
    return [version_out(v) for v in list_versions(asset_id)]


def read_version_bytes(version_id: str) -> tuple[bytes, str]:
    version = get_version(version_id)
    path = abs_from_storage(version["file_path"])
    return path.read_bytes(), path.name


def read_reference_bytes(reference_id: str) -> tuple[bytes, str]:
    ref = get_reference(reference_id)
    path = abs_from_storage(ref["file_path"])
    return path.read_bytes(), path.name


def create_job(
    *,
    workflow_id: str,
    params: dict[str, Any],
    asset_id: str | None,
    project_id: str | None,
    label: str,
    batch_id: str = "",
) -> dict[str, Any]:
    job_id = new_id()
    stamp = now()
    get_db().execute(
        """
        INSERT INTO jobs (
          id, asset_id, project_id, workflow_id, status, progress, message, prompt_id,
          params_json, error, raw_log, batch_id, label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'queued', 0, 'Queued', '', ?, '', '', ?, ?, ?, ?)
        """,
        (job_id, asset_id, project_id, workflow_id, json.dumps(params), batch_id, label, stamp, stamp),
    )
    return get_job(job_id)


def get_job(job_id: str) -> dict[str, Any]:
    row = get_db().query_one(
        """
        SELECT jobs.*, COALESCE(assets.name, '') AS asset_name
        FROM jobs LEFT JOIN assets ON assets.id = jobs.asset_id
        WHERE jobs.id = ?
        """,
        (job_id,),
    )
    if not row:
        raise KeyError(job_id)
    return job_out(row)


def list_jobs(limit: int = 100) -> list[dict[str, Any]]:
    rows = get_db().query(
        """
        SELECT jobs.*, COALESCE(assets.name, '') AS asset_name
        FROM jobs LEFT JOIN assets ON assets.id = jobs.asset_id
        ORDER BY jobs.created_at DESC
        LIMIT ?
        """,
        (limit,),
    )
    return [job_out(row) for row in rows]


def jobs_by_status(statuses: list[str]) -> list[dict[str, Any]]:
    marks = ",".join("?" for _ in statuses)
    rows = get_db().query(
        f"""
        SELECT jobs.*, COALESCE(assets.name, '') AS asset_name
        FROM jobs LEFT JOIN assets ON assets.id = jobs.asset_id
        WHERE jobs.status IN ({marks})
        ORDER BY jobs.created_at ASC
        """,
        tuple(statuses),
    )
    return [job_out(row) for row in rows]


def update_job(job_id: str, **fields: Any) -> dict[str, Any]:
    if not fields:
        return get_job(job_id)
    columns = []
    values: list[Any] = []
    for key, value in fields.items():
        columns.append(f"{key} = ?")
        values.append(value)
    columns.append("updated_at = ?")
    values.append(now())
    values.append(job_id)
    get_db().execute(f"UPDATE jobs SET {', '.join(columns)} WHERE id = ?", tuple(values))
    return get_job(job_id)


def list_styles() -> list[dict[str, Any]]:
    return [style_out(row) for row in get_db().query("SELECT * FROM styles ORDER BY is_builtin DESC, name")]


def get_style(style_id: str) -> dict[str, Any]:
    row = get_db().query_one("SELECT * FROM styles WHERE id = ?", (style_id,))
    if not row:
        raise KeyError(style_id)
    return row


def create_style(payload: dict[str, Any]) -> dict[str, Any]:
    style_id = new_id()
    stamp = now()
    get_db().execute(
        """
        INSERT INTO styles (
          id, name, prompt_prefix, negative_prompt, model, lora, lora_strength,
          steps, cfg, width, height, preferred_workflow, params_json, is_builtin,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        """,
        (
            style_id,
            payload["name"].strip(),
            payload.get("prompt_prefix") or "",
            payload.get("negative_prompt") or "",
            payload.get("model") or "",
            payload.get("lora") or "",
            float(payload.get("lora_strength") or 0.8),
            int(payload.get("steps") or 20),
            float(payload.get("cfg") or 7),
            int(payload.get("width") or 512),
            int(payload.get("height") or 512),
            payload.get("preferred_workflow") or "txt2sprite",
            json.dumps(payload.get("params") or {}),
            stamp,
            stamp,
        ),
    )
    return style_out(get_style(style_id))


def update_style(style_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    current = get_style(style_id)
    get_db().execute(
        """
        UPDATE styles SET
          name = ?, prompt_prefix = ?, negative_prompt = ?, model = ?, lora = ?,
          lora_strength = ?, steps = ?, cfg = ?, width = ?, height = ?,
          preferred_workflow = ?, params_json = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            payload.get("name", current["name"]),
            payload.get("prompt_prefix", current["prompt_prefix"]),
            payload.get("negative_prompt", current["negative_prompt"]),
            payload.get("model", current["model"]),
            payload.get("lora", current["lora"]),
            float(payload.get("lora_strength", current["lora_strength"])),
            int(payload.get("steps", current["steps"])),
            float(payload.get("cfg", current["cfg"])),
            int(payload.get("width", current["width"])),
            int(payload.get("height", current["height"])),
            payload.get("preferred_workflow", current["preferred_workflow"]),
            json.dumps(payload.get("params", json.loads(current["params_json"] or "{}"))),
            now(),
            style_id,
        ),
    )
    return style_out(get_style(style_id))


def delete_style(style_id: str) -> None:
    row = get_style(style_id)
    if row["is_builtin"]:
        raise ValueError("Built-in styles stay in the library. Duplicate one if you want a variant.")
    get_db().execute("DELETE FROM styles WHERE id = ?", (style_id,))


def apply_style(inputs: dict[str, Any], style_id: str | None) -> dict[str, Any]:
    """Attach the style name. Sampler defaults are applied only when the UI asks."""
    merged = dict(inputs)
    if not style_id:
        return merged
    try:
        style = style_out(get_style(style_id))
    except KeyError:
        return merged
    if not str(merged.get("negative_prompt") or "").strip():
        merged["negative_prompt"] = style["negative_prompt"]
    merged["style_id"] = style_id
    merged["style_name"] = style["name"]
    return merged


def compose_prompt(asset: dict[str, Any], style_id: str | None) -> str:
    """Style prefix, then the project standard prompt, then the asset description."""
    parts: list[str] = []
    if style_id:
        try:
            style = style_out(get_style(style_id))
        except KeyError:
            style = None
        if style:
            prefix = str(style.get("prompt_prefix") or "").strip()
            if prefix:
                parts.append(prefix)
    project = get_project(str(asset["project_id"]))
    standard = str(project.get("standard_prompt") or "").strip()
    if standard:
        parts.append(standard)
    description = str(asset.get("description") or "").strip()
    if description:
        parts.append(description)
    return ", ".join(parts)


def resolve_seed(inputs: dict[str, Any]) -> dict[str, Any]:
    import random

    merged = dict(inputs)
    try:
        seed = int(merged.get("seed", -1))
    except (TypeError, ValueError):
        seed = -1
    if seed < 0:
        seed = random.randint(0, 2**31 - 1)
    merged["seed"] = seed
    return merged


def load_image_ref(image_value: str) -> tuple[bytes, str, str]:
    """Return bytes, a storage-safe filename, and a parent id description."""
    kind, _, ident = (image_value or "").partition(":")
    if kind == "version" and ident:
        data, name = read_version_bytes(ident)
        return data, name, ident
    if kind == "reference" and ident:
        data, name = read_reference_bytes(ident)
        return data, name, ident
    raise ValueError("Choose an image from this asset.")


def ensure_png(data: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as img:
            return png_bytes(img.convert("RGBA"))
    except Exception as exc:
        raise ValueError("That file is not an image PixelForge can read.") from exc
