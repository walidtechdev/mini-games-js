"""Load ComfyUI API-format workflow JSON and inject parameters.

Custom workflows can keep the same placeholders (`__PROMPT__`, `__NEGATIVE__`,
`__MODEL__`, `__LORA__`, `__LORA_STRENGTH__`, `__SEED__`, `__STEPS__`, `__CFG__`,
`__WIDTH__`, `__HEIGHT__`, `__SAMPLER__`, `__SCHEDULER__`, `__DENOISE__`,
`__IMAGE__`, `__FILENAME__`, `__METHOD__`). An empty LoRA removes a LoraLoader
node and rewires its model/clip links so stock graphs stay valid.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from PIL import Image

from app.config import WORKFLOWS_DIR

INT_FIELDS: dict[str, set[str]] = {
    "KSampler": {"seed", "steps"},
    "EmptyLatentImage": {"width", "height", "batch_size"},
    "ImageScale": {"width", "height"},
}
FLOAT_FIELDS: dict[str, set[str]] = {
    "KSampler": {"cfg", "denoise"},
    "LoraLoader": {"strength_model", "strength_clip"},
}


class WorkflowAdapter:
    id: str = ""
    name: str = ""
    description: str = ""

    def inputs_schema(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def build_workflow(self, inputs: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def is_local(self, inputs: dict[str, Any]) -> bool:
        return False

    def execute_local(self, inputs: dict[str, Any], image: Image.Image) -> Image.Image:
        raise NotImplementedError

    def workflow_path(self) -> Path:
        return WORKFLOWS_DIR / self.id / "workflow.json"

    def public_info(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "inputs": self.inputs_schema(),
            "workflow_file": self.workflow_path().relative_to(WORKFLOWS_DIR.parent).as_posix(),
        }


def field(
    key: str,
    label: str,
    kind: str,
    *,
    required: bool = False,
    default: Any = None,
    options: list[str] | None = None,
    min: float | None = None,
    max: float | None = None,
    step: float | None = None,
    help: str | None = None,
    show_when: dict[str, str] | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "key": key,
        "label": label,
        "type": kind,
        "required": required,
    }
    if default is not None:
        data["default"] = default
    if options is not None:
        data["options"] = options
    if min is not None:
        data["min"] = min
    if max is not None:
        data["max"] = max
    if step is not None:
        data["step"] = step
    if help:
        data["help"] = help
    if show_when:
        data["show_when"] = show_when
    return data


def load_workflow(path: Path, values: dict[str, Any], *, keep_lora: bool) -> dict[str, Any]:
    workflow = json.loads(path.read_text(encoding="utf-8"))
    _replace_placeholders(workflow, values)
    missing = _leftover_placeholders(workflow)
    if missing:
        raise ValueError(f"Workflow {path.name} still has placeholders: {', '.join(sorted(missing))}")
    _coerce(workflow)
    if not keep_lora:
        _bypass_lora(workflow)
    return workflow


def _replace_placeholders(node: Any, values: dict[str, Any]) -> None:
    if isinstance(node, dict):
        for key, value in list(node.items()):
            token = _token(value)
            if token is not None and token in values:
                node[key] = values[token]
            else:
                _replace_placeholders(value, values)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            token = _token(value)
            if token is not None and token in values:
                node[index] = values[token]
            else:
                _replace_placeholders(value, values)


def _token(value: Any) -> str | None:
    if isinstance(value, str) and value.startswith("__") and value.endswith("__") and len(value) > 4:
        return value[2:-2]
    return None


def _leftover_placeholders(node: Any, found: set[str] | None = None) -> set[str]:
    found = found if found is not None else set()
    if isinstance(node, dict):
        for value in node.values():
            _leftover_placeholders(value, found)
    elif isinstance(node, list):
        for value in node:
            _leftover_placeholders(value, found)
    else:
        token = _token(node)
        if token is not None:
            found.add(token)
    return found


def _coerce(workflow: dict[str, Any]) -> None:
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        kind = node.get("class_type")
        inputs = node.get("inputs")
        if not isinstance(inputs, dict) or not isinstance(kind, str):
            continue
        for name in INT_FIELDS.get(kind, set()):
            if name in inputs and not isinstance(inputs[name], list):
                inputs[name] = int(float(inputs[name]))
        for name in FLOAT_FIELDS.get(kind, set()):
            if name in inputs and not isinstance(inputs[name], list):
                inputs[name] = float(inputs[name])


def _bypass_lora(workflow: dict[str, Any]) -> None:
    lora_ids = [nid for nid, node in workflow.items() if isinstance(node, dict) and node.get("class_type") == "LoraLoader"]
    for lid in lora_ids:
        node = workflow[lid]
        model_src = node["inputs"]["model"]
        clip_src = node["inputs"]["clip"]
        for other in workflow.values():
            if not isinstance(other, dict):
                continue
            inputs = other.get("inputs")
            if not isinstance(inputs, dict):
                continue
            for key, value in list(inputs.items()):
                if isinstance(value, list) and len(value) == 2 and str(value[0]) == str(lid):
                    inputs[key] = model_src if value[1] == 0 else clip_src
        del workflow[lid]


SAMPLER_OPTIONS = ["euler", "euler_ancestral", "heun", "dpmpp_2m", "dpmpp_sde", "ddim", "uni_pc"]
SCHEDULER_OPTIONS = ["normal", "karras", "simple", "exponential"]


def common_sampler_fields() -> list[dict[str, Any]]:
    return [
        field("seed", "Seed", "number", default=-1, help="-1 rolls a new seed. The seed that ran is stored on the version."),
        field("model", "Model", "string", default="", help="Checkpoint filename. Empty uses Settings."),
        field("lora", "LoRA", "string", default="", help="LoRA filename. Empty skips the LoRA loader."),
        field("lora_strength", "LoRA strength", "number", default=0.8, min=0, max=2, step=0.05),
        field("steps", "Steps", "number", default=20, min=1, max=150),
        field("cfg", "CFG", "number", default=7, min=1, max=30, step=0.5),
        field("sampler", "Sampler", "select", default="euler", options=SAMPLER_OPTIONS),
        field("scheduler", "Scheduler", "select", default="normal", options=SCHEDULER_OPTIONS),
    ]


def diffusion_values(inputs: dict[str, Any], settings: dict[str, Any], filename: str) -> tuple[dict[str, Any], bool]:
    lora = str(inputs.get("lora") or "").strip()
    model = str(inputs.get("model") or settings.get("default_model") or "").strip()
    values = {
        "PROMPT": inputs.get("prompt") or "",
        "NEGATIVE": inputs.get("negative_prompt") or "",
        "MODEL": model,
        "LORA": lora or "none.safetensors",
        "LORA_STRENGTH": inputs.get("lora_strength", 0.8),
        "SEED": int(inputs.get("seed") or 0),
        "STEPS": int(inputs.get("steps") or settings.get("default_steps") or 20),
        "CFG": float(inputs.get("cfg") or settings.get("default_cfg") or 7),
        "WIDTH": int(inputs.get("width") or settings.get("default_width") or 512),
        "HEIGHT": int(inputs.get("height") or settings.get("default_height") or 512),
        "SAMPLER": inputs.get("sampler") or "euler",
        "SCHEDULER": inputs.get("scheduler") or "normal",
        "DENOISE": inputs.get("denoise", 1),
        "FILENAME": filename,
        "IMAGE": inputs.get("comfy_image") or "pixelforge-input.png",
        "METHOD": inputs.get("method") or "nearest-exact",
    }
    return values, bool(lora)


def prompt_fields() -> list[dict[str, Any]]:
    return [
        field("prompt", "Prompt", "string", required=True, default="pixel art character sprite, full body, crisp outline"),
        field(
            "negative_prompt",
            "Negative prompt",
            "string",
            default="blurry, photorealistic, 3d render, text, watermark, jpeg artifacts",
        ),
    ]
