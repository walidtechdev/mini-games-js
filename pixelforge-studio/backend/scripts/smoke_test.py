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

from app.comfy_client import gpu_summary  # noqa: E402
from app.main import app  # noqa: E402
from app.workflows import get_adapter  # noqa: E402
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
    backend = ROOT
    source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in backend.rglob("*.py")
        if "__pycache__" not in path.parts and "scripts" not in path.parts
    )
    assert "nvidia-smi" not in source
    summary = gpu_summary(
        {
            "system": {"comfyui_version": "test", "pytorch_version": "2.4.0+rocm6.2"},
            "devices": [
                {
                    "name": "cuda:0 AMD Radeon RX 7800 XT : native",
                    "type": "cuda",
                    "vram_total": 16 * 1024**3,
                    "vram_free": 12 * 1024**3,
                }
            ],
        }
    )
    assert summary["devices"][0]["name"] == "cuda:0 AMD Radeon RX 7800 XT : native"
    assert summary["devices"][0]["vram_total"] == 16 * 1024**3
    assert summary["pytorch"] == "2.4.0+rocm6.2"

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

        settings = client.get("/api/settings").json()
        assert settings["comfyui_path"] == "/mnt/.storage/ComfyUI"
        assert settings["default_model"] == "pixelArtDiffusionXL_spriteShaper.safetensors"
        assert settings["default_lora"] == "pixel-art-xl-v1.1.safetensors"
        offline_models = client.get("/api/comfy/models")
        assert offline_models.status_code == 200, offline_models.text
        offline_body = offline_models.json()
        assert offline_body["source"] == "disk"
        assert isinstance(offline_body["checkpoints"], list)
        assert isinstance(offline_body["loras"], list)

        install = TMP / "ComfyUI"
        checkpoints = install / "models" / "checkpoints"
        loras = install / "models" / "loras"
        (checkpoints / "sdxl").mkdir(parents=True)
        (checkpoints / "pixelArtDiffusionXL_spriteShaper.safetensors").write_bytes(b"ckpt")
        (checkpoints / "sdxl" / "sdXL_v10VAEFix.safetensors").write_bytes(b"ckpt")
        (checkpoints / "notes.txt").write_text("skip", encoding="utf-8")
        (checkpoints / "put_checkpoints_here").write_bytes(b"")
        loras.mkdir(parents=True)
        (loras / "pixel-art-xl-v1.1.safetensors").write_bytes(b"lora")
        saved_path = client.put("/api/settings", json={"comfyui_path": str(install)})
        assert saved_path.status_code == 200, saved_path.text
        catalog = client.get("/api/comfy/models")
        assert catalog.status_code == 200, catalog.text
        listed = catalog.json()
        assert listed["source"] == "disk"
        assert listed["checkpoints"] == [
            "pixelArtDiffusionXL_spriteShaper.safetensors",
            "sdxl/sdXL_v10VAEFix.safetensors",
        ]
        assert listed["loras"] == ["pixel-art-xl-v1.1.safetensors"]
        missing_path = client.put("/api/settings", json={"comfyui_path": str(TMP / "missing-comfy")})
        assert missing_path.status_code == 200, missing_path.text
        empty_catalog = client.get("/api/comfy/models")
        assert empty_catalog.status_code == 200, empty_catalog.text
        assert empty_catalog.json()["source"] == "disk"
        assert empty_catalog.json()["checkpoints"] == []
        assert empty_catalog.json()["loras"] == []

        upscale = get_adapter("upscale").build_workflow(
            {
                "comfy_image": "sprite.png",
                "asset_slug": "knight",
                "upscale_model": "RealESRGAN_x4plus_anime_6B.pth",
            },
            settings,
        )
        upscale_types = [node["class_type"] for node in upscale.values()]
        assert "UpscaleModelLoader" in upscale_types
        assert "ImageUpscaleWithModel" in upscale_types
        assert "ImageScale" not in upscale_types
        assert any(
            node.get("inputs", {}).get("model_name") == "RealESRGAN_x4plus_anime_6B.pth" for node in upscale.values()
        )
        cutout = get_adapter("background_removal").build_workflow(
            {"comfy_image": "sprite.png", "asset_slug": "knight"},
            settings,
        )
        assert any(node.get("class_type") == "RMBG" for node in cutout.values())

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

        style = styles[0]
        standard = client.patch(
            f"/api/projects/{project['id']}",
            json={"standard_prompt": "clean pixels, transparent background"},
        )
        assert standard.status_code == 200, standard.text
        assert standard.json()["standard_prompt"] == "clean pixels, transparent background"
        described = client.patch(
            f"/api/assets/{asset['id']}",
            json={"description": "a knight in blue armor"},
        )
        assert described.status_code == 200, described.text
        composed = client.post(
            "/api/generate",
            json={
                "asset_id": asset["id"],
                "workflow_id": "txt2sprite",
                "style_id": style["id"],
                "inputs": {"prompt": "SHOULD NOT WIN", "width": 64, "height": 64},
            },
        )
        assert composed.status_code == 200, composed.text
        composed_job = wait_job(client, composed.json()["id"])
        assert composed_job["status"] == "failed"
        prompt = composed_job["params"]["prompt"]
        assert "SHOULD NOT WIN" not in prompt
        assert prompt.index(style["prompt_prefix"]) < prompt.index("clean pixels, transparent background")
        assert prompt.index("clean pixels, transparent background") < prompt.index("a knight in blue armor")

        imported = client.post(
            f"/api/assets/{asset['id']}/versions/upload",
            files={"file": ("outside.png", io.BytesIO(png), "image/png")},
            data={"kind": "import", "prompt": "external sprite"},
        )
        assert imported.status_code == 200, imported.text
        imported_version = imported.json()
        assert imported_version["kind"] == "import"
        facing = client.post(
            "/api/directions",
            json={
                "asset_id": asset["id"],
                "directions": ["left"],
                "style_id": style["id"],
                "inputs": {"image": f"version:{imported_version['id']}", "width": 64, "height": 64},
            },
        )
        assert facing.status_code == 200, facing.text
        facing_job = wait_job(client, facing.json()[0]["id"])
        assert facing_job["status"] == "failed"
        assert facing_job["params"]["image"] == f"version:{imported_version['id']}"
        assert "left side view, facing left" in facing_job["params"]["prompt"]
        assert "a knight in blue armor" in facing_job["params"]["prompt"]

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
