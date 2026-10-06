"""API smoke test. Does not require ComfyUI."""

from __future__ import annotations

import io
import os
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TMP = Path(tempfile.mkdtemp(prefix="pixelforge-smoke-"))
os.environ["PIXEFORGE_STORAGE_DIR"] = str(TMP / "storage")
os.environ["PIXEFORGE_DATABASE_PATH"] = str(TMP / "pixelforge.db")
os.environ["PIXEFORGE_COMFYUI_URL"] = "http://127.0.0.1:9"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.pixel_ops import cleanup_artifacts, pixelize_image, png_bytes  # noqa: E402


def wait_job(client: TestClient, job_id: str) -> dict:
    last: dict = {}
    for _ in range(50):
        response = client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200, response.text
        last = response.json()
        if last["status"] in {"completed", "failed", "cancelled"}:
            return last
        time.sleep(0.1)
    raise AssertionError(f"job did not finish: {last}")


def main() -> None:
    source = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    for x in range(8):
        source.putpixel((x, 0), (200, 20, 20, 255))
        source.putpixel((x, 7), (20, 20, 200, 255))
    source.putpixel((3, 3), (0, 255, 0, 255))
    tiny = pixelize_image(source, 4, 4, palette_colors=8, cleanup=True, scale_up=2)
    assert tiny.size == (8, 8)
    cleaned = cleanup_artifacts(source)
    assert cleaned.size == (8, 8)

    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200, health.text
        assert health.json()["status"] == "ok"

        workflows = client.get("/api/workflows").json()
        ids = {item["id"] for item in workflows}
        assert ids == {
            "txt2sprite",
            "image_edit",
            "directions",
            "animation",
            "upscale",
            "background_removal",
            "pixelize",
        }
        sprite = next(item for item in workflows if item["id"] == "txt2sprite")
        assert any(field["key"] == "prompt" for field in sprite["inputs"])

        styles = client.get("/api/styles").json()
        assert len(styles) >= 5

        project = client.post("/api/projects", json={"name": "My RPG", "description": "Smoke"}).json()
        assert project["name"] == "My RPG"
        assert len(project["categories"]) == 7
        characters = next(cat for cat in project["categories"] if cat["slug"] == "characters")

        asset = client.post(
            "/api/assets",
            json={
                "project_id": project["id"],
                "category_id": characters["id"],
                "name": "Knight",
                "description": "Hero",
            },
        ).json()
        assert asset["name"] == "Knight"
        assert (TMP / "storage" / "projects" / "my-rpg" / "project.json").exists()
        assert (TMP / "storage" / "projects" / "my-rpg" / "characters" / "knight" / "asset.json").exists()

        png = png_bytes(source)
        uploaded = client.post(
            f"/api/assets/{asset['id']}/versions/upload",
            files={"file": ("knight.png", io.BytesIO(png), "image/png")},
            data={"kind": "generation", "prompt": "uploaded master"},
        )
        assert uploaded.status_code == 200, uploaded.text
        version = uploaded.json()
        assert version["number"] == 1
        media = client.get(version["url"])
        assert media.status_code == 200
        assert media.content[:8] == b"\x89PNG\r\n\x1a\n"

        reference = client.post(
            f"/api/assets/{asset['id']}/references",
            files={"file": ("concept.png", io.BytesIO(png), "image/png")},
            data={"label": "concept"},
        )
        assert reference.status_code == 200, reference.text

        pixel_job = client.post(
            "/api/generate",
            json={
                "asset_id": asset["id"],
                "workflow_id": "pixelize",
                "inputs": {
                    "image": f"version:{version['id']}",
                    "engine": "algorithmic",
                    "width": 4,
                    "height": 4,
                    "palette_colors": 8,
                    "cleanup": "on",
                    "scale_up": 2,
                    "prompt": "pixel knight",
                },
            },
        )
        assert pixel_job.status_code == 200, pixel_job.text
        done = wait_job(client, pixel_job.json()["id"])
        assert done["status"] == "completed", done
        detail = client.get(f"/api/assets/{asset['id']}").json()
        pixel_versions = [item for item in detail["versions"] if item["kind"] == "pixelize"]
        assert pixel_versions, detail["versions"]
        assert pixel_versions[0]["width"] == 8
        assert pixel_versions[0]["seed"] is not None

        frames = client.post(
            f"/api/assets/{asset['id']}/frames",
            json={"animation": "walk", "direction": "front", "count": 4, "width": 4, "height": 4, "duration_ms": 90},
        )
        assert frames.status_code == 200, frames.text
        frame_ids = [item["id"] for item in frames.json()]
        reordered = client.post(
            f"/api/assets/{asset['id']}/animations/reorder",
            json={"animation": "walk", "direction": "front", "version_ids": list(reversed(frame_ids))},
        )
        assert reordered.status_code == 200, reordered.text

        sheet = client.post(
            f"/api/assets/{asset['id']}/spritesheet",
            json={
                "version_ids": frame_ids,
                "columns": 4,
                "rows": 1,
                "padding": 1,
                "cell_width": 4,
                "cell_height": 4,
                "background": "#00000000",
            },
        )
        assert sheet.status_code == 200, sheet.text
        sheet_body = sheet.json()
        assert len(sheet_body["sheet"]["frames"]) == 4
        sheet_file = client.get(sheet_body["json_url"])
        assert sheet_file.status_code == 200
        assert sheet_file.json()["meta"]["columns"] == 4

        offline = client.post(
            "/api/generate",
            json={
                "asset_id": asset["id"],
                "workflow_id": "txt2sprite",
                "inputs": {"prompt": "a knight", "width": 64, "height": 64},
            },
        )
        assert offline.status_code == 200, offline.text
        failed = wait_job(client, offline.json()["id"])
        assert failed["status"] == "failed", failed
        assert failed["error"] == "ComfyUI is not running. Start ComfyUI and check that the configured address is correct."
        assert failed["raw_log"]

        connection = client.post("/api/settings/test-comfy").json()
        assert connection["status"] == "Offline"
        assert "ComfyUI is not running" in connection["message"]

        logs = client.get("/api/logs").json()
        assert logs

        primary = client.post(f"/api/versions/{version['id']}/primary")
        assert primary.status_code == 200
        assert primary.json()["is_primary"] is True
        approved = client.post(f"/api/versions/{version['id']}/approve")
        assert approved.status_code == 200
        assert approved.json()["is_approved"] is True

    print("smoke ok")
    print(f"temp storage: {TMP}")


if __name__ == "__main__":
    main()
