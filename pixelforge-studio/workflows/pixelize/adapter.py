from PIL import Image

from app.pixel_ops import pixelize_image
from app.workflow_support import WorkflowAdapter, common_sampler_fields, diffusion_values, field, load_workflow


class Adapter(WorkflowAdapter):
    id = "pixelize"
    name = "Pixelize"
    description = "Algorithmic nearest-neighbor pixelize works offline. The AI engine sends the image through this folder's ComfyUI workflow."

    def inputs_schema(self) -> list[dict]:
        ai = {"engine": "ai"}
        return [
            field("image", "Image", "image", required=True),
            field(
                "engine",
                "Engine",
                "select",
                default="algorithmic",
                options=["algorithmic", "ai"],
                help="Algorithmic runs on this machine. AI calls the pixelize workflow.",
            ),
            field("width", "Width", "number", default=64, min=8, max=1024, step=1),
            field("height", "Height", "number", default=64, min=8, max=1024, step=1),
            field("palette_colors", "Palette colors", "number", default=16, min=0, max=256, step=1, help="0 keeps the current colors."),
            field(
                "cleanup",
                "Artifact cleanup",
                "select",
                default="off",
                options=["off", "on"],
            ),
            field("scale_up", "Nearest scale-up", "number", default=1, min=1, max=16, step=1),
            field("prompt", "Prompt", "string", default="crisp pixel art sprite, hard edges, limited palette", show_when=ai),
            field("negative_prompt", "Negative prompt", "string", default="blurry, smooth gradient, photorealistic", show_when=ai),
            field("denoise", "Denoise", "number", default=0.35, min=0.05, max=1, step=0.05, show_when=ai),
            *[
                dict(item, show_when=ai) if "show_when" not in item else item
                for item in common_sampler_fields()
            ],
        ]

    def is_local(self, inputs: dict) -> bool:
        return str(inputs.get("engine") or "algorithmic") != "ai"

    def execute_local(self, inputs: dict, image: Image.Image) -> Image.Image:
        return pixelize_image(
            image,
            width=int(inputs.get("width") or 64),
            height=int(inputs.get("height") or 64),
            palette_colors=int(inputs.get("palette_colors") or 0),
            cleanup=str(inputs.get("cleanup") or "off") == "on",
            scale_up=int(inputs.get("scale_up") or 1),
        )

    def build_workflow(self, inputs: dict, settings: dict) -> dict:
        slug = inputs.get("asset_slug") or "pixel"
        values, keep_lora = diffusion_values(inputs, settings, f"pixelforge/{slug}_pixel")
        return load_workflow(self.workflow_path(), values, keep_lora=keep_lora)
