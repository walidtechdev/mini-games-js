"""ComfyUI HTTP + WebSocket client. No credentials live here; the URL comes from settings."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx
import websockets

from app.config import COMFY_OFFLINE_MESSAGE

logger = logging.getLogger("pixelforge.comfy")

ProgressCallback = Callable[[float, str], Awaitable[None]]


class ComfyOfflineError(Exception):
    def __init__(self, raw: str) -> None:
        super().__init__(COMFY_OFFLINE_MESSAGE)
        self.user_message = COMFY_OFFLINE_MESSAGE
        self.raw = raw


class ComfyWorkflowError(Exception):
    def __init__(self, user_message: str, raw: str) -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.raw = raw


class JobCancelled(Exception):
    pass


class ComfyClient:
    def __init__(self, base_url: str, client_id: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id

    def _ws_url(self) -> str:
        parts = urlsplit(self.base_url)
        scheme = "wss" if parts.scheme == "https" else "ws"
        return urlunsplit((scheme, parts.netloc, "/ws", urlencode({"clientId": self.client_id}), ""))

    async def system_stats(self) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=5) as http:
                response = await http.get(f"{self.base_url}/system_stats")
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise ComfyWorkflowError("ComfyUI returned an unexpected system_stats payload.", response.text)
                return data
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ComfyOfflineError(repr(exc)) from exc

    async def upload_image(self, path: Path, filename: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=60) as http:
                files = {"image": (filename, path.read_bytes(), "image/png")}
                data = {"overwrite": "true", "type": "input"}
                response = await http.post(f"{self.base_url}/upload/image", files=files, data=data)
                response.raise_for_status()
                body = response.json()
                name = body.get("name")
                if not name:
                    raise ComfyWorkflowError("ComfyUI did not return an uploaded filename.", response.text)
                return str(name)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ComfyOfflineError(repr(exc)) from exc
        except httpx.HTTPStatusError as exc:
            raise ComfyWorkflowError("ComfyUI rejected the image upload.", exc.response.text) from exc

    async def queue_prompt(self, workflow: dict[str, Any]) -> str:
        payload = {"prompt": workflow, "client_id": self.client_id}
        try:
            async with httpx.AsyncClient(timeout=30) as http:
                response = await http.post(f"{self.base_url}/prompt", json=payload)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ComfyOfflineError(repr(exc)) from exc
        raw = response.text
        if response.status_code >= 400:
            raise ComfyWorkflowError(
                "ComfyUI rejected the workflow. Check the developer panel, and swap workflow.json if this graph uses nodes your install does not have.",
                raw,
            )
        body = response.json()
        node_errors = body.get("node_errors") or {}
        if node_errors:
            raise ComfyWorkflowError(
                "ComfyUI rejected the workflow. Check the developer panel, and swap workflow.json if this graph uses nodes your install does not have.",
                raw,
            )
        prompt_id = body.get("prompt_id")
        if not prompt_id:
            raise ComfyWorkflowError("ComfyUI did not return a prompt id.", raw)
        return str(prompt_id)

    async def interrupt(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                await http.post(f"{self.base_url}/interrupt")
        except (httpx.HTTPError, OSError) as exc:
            logger.warning("ComfyUI interrupt failed: %s", exc)

    async def delete_queue_item(self, prompt_id: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                await http.post(f"{self.base_url}/queue", json={"delete": [prompt_id]})
        except (httpx.HTTPError, OSError) as exc:
            logger.warning("ComfyUI queue delete failed: %s", exc)

    async def history(self, prompt_id: str) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=30) as http:
                response = await http.get(f"{self.base_url}/history/{prompt_id}")
                response.raise_for_status()
                data = response.json()
                return data if isinstance(data, dict) else {}
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ComfyOfflineError(repr(exc)) from exc

    async def view_image(self, filename: str, subfolder: str, folder_type: str) -> bytes:
        params = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        try:
            async with httpx.AsyncClient(timeout=60) as http:
                response = await http.get(f"{self.base_url}/view", params=params)
                response.raise_for_status()
                return response.content
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ComfyOfflineError(repr(exc)) from exc

    async def wait_for_images(
        self,
        prompt_id: str,
        on_progress: ProgressCallback,
        is_cancelled: Callable[[], bool],
    ) -> list[dict[str, str]]:
        finished = asyncio.Event()

        async def listen() -> None:
            try:
                async with websockets.connect(self._ws_url(), open_timeout=5, ping_interval=20) as ws:
                    while not finished.is_set():
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=1)
                        except asyncio.TimeoutError:
                            continue
                        if isinstance(raw, bytes):
                            continue
                        self._handle_ws(raw, prompt_id, on_progress, finished)
            except Exception as exc:
                logger.info("ComfyUI websocket ended: %s", exc)

        listener = asyncio.create_task(listen())
        try:
            deadline = time.monotonic() + 30 * 60
            finished_polls = 0
            while True:
                if is_cancelled():
                    await self.interrupt()
                    await self.delete_queue_item(prompt_id)
                    raise JobCancelled()
                if time.monotonic() > deadline:
                    raise ComfyWorkflowError("Timed out waiting for ComfyUI.", prompt_id)
                hist = await self.history(prompt_id)
                status = _history_status(hist, prompt_id)
                images = extract_images(hist, prompt_id)
                if status == "error":
                    raise ComfyWorkflowError(
                        "ComfyUI failed while running this workflow.",
                        json.dumps(hist)[:8000],
                    )
                if images and status == "success":
                    return images
                if finished.is_set():
                    finished_polls += 1
                    if images:
                        return images
                    if finished_polls > 8:
                        raise ComfyWorkflowError(
                            "ComfyUI finished without returning an image.",
                            json.dumps(hist)[:8000],
                        )
                await asyncio.sleep(0.4)
        finally:
            finished.set()
            listener.cancel()


    def _handle_ws(
        self,
        raw: str,
        prompt_id: str,
        on_progress: ProgressCallback,
        finished: asyncio.Event,
    ) -> None:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        data = msg.get("data") or {}
        if not isinstance(data, dict):
            return
        msg_prompt = data.get("prompt_id")
        if msg_prompt and msg_prompt != prompt_id:
            return
        kind = msg.get("type")
        if kind == "progress":
            value = float(data.get("value") or 0)
            maximum = float(data.get("max") or 1) or 1
            asyncio.create_task(on_progress(max(0.0, min(1.0, value / maximum)), "Sampling"))
        elif kind == "executing":
            node = data.get("node")
            if node is None and msg_prompt == prompt_id:
                finished.set()
            elif node:
                asyncio.create_task(on_progress(-1, f"Node {node}"))
        elif kind in {"execution_error", "execution_interrupted"}:
            finished.set()
        elif kind == "execution_success" and msg_prompt == prompt_id:
            finished.set()


def extract_images(history: dict[str, Any], prompt_id: str) -> list[dict[str, str]]:
    entry = history.get(prompt_id) or {}
    outputs = entry.get("outputs") or {}
    images: list[dict[str, str]] = []
    if not isinstance(outputs, dict):
        return images
    for node_out in outputs.values():
        if not isinstance(node_out, dict):
            continue
        for image in node_out.get("images") or []:
            if isinstance(image, dict) and image.get("filename"):
                images.append(
                    {
                        "filename": str(image.get("filename")),
                        "subfolder": str(image.get("subfolder") or ""),
                        "type": str(image.get("type") or "output"),
                    }
                )
    return images


def _history_status(history: dict[str, Any], prompt_id: str) -> str:
    entry = history.get(prompt_id)
    if not isinstance(entry, dict):
        return ""
    status = entry.get("status") or {}
    if not isinstance(status, dict):
        return ""
    status_str = str(status.get("status_str") or "")
    if status_str == "error":
        return "error"
    if status.get("completed") and status_str in {"success", ""}:
        return "success" if status_str != "error" else "error"
    if status_str == "success":
        return "success"
    return ""


def gpu_summary(stats: dict[str, Any]) -> dict[str, Any]:
    """Copy device name and VRAM from a ComfyUI /system_stats payload.

    ComfyUI reports whatever PyTorch sees (NVIDIA, AMD/ROCm, or CPU). This
    function only reads that JSON. It does not run a vendor tool.
    VRAM fields are bytes, as ComfyUI sends them.
    """
    devices = []
    for device in stats.get("devices") or []:
        if not isinstance(device, dict):
            continue
        devices.append(
            {
                "name": device.get("name"),
                "type": device.get("type"),
                "vram_total": device.get("vram_total"),
                "vram_free": device.get("vram_free"),
            }
        )
    system = stats.get("system") if isinstance(stats.get("system"), dict) else {}
    return {
        "comfyui_version": system.get("comfyui_version"),
        "pytorch": system.get("pytorch_version"),
        "devices": devices,
    }
