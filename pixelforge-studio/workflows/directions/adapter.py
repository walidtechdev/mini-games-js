from app.workflow_support import (
    WorkflowAdapter,
    common_sampler_fields,
    diffusion_values,
    field,
    load_workflow,
)


class Adapter(WorkflowAdapter):
    id = "directions"
    name = "Directions"
    description = "Turn a master sprite into one facing. PixelForge queues one ComfyUI job per direction so a single facing can be regenerated."

    def inputs_schema(self) -> list[dict]:
        return [
            field("image", "Master image", "image", required=True),
            field("prompt", "Prompt", "string", default="same character, pixel art sprite, full body, crisp outline"),
            field("negative_prompt", "Negative prompt", "string", default="blurry, extra limbs, photorealistic, text"),
            field("denoise", "Denoise", "number", default=0.65, min=0.05, max=1, step=0.05),
            field("width", "Width", "number", default=512, min=64, max=2048, step=64),
            field("height", "Height", "number", default=512, min=64, max=2048, step=64),
            *common_sampler_fields(),
        ]

    def build_workflow(self, inputs: dict, settings: dict) -> dict:
        facing = inputs.get("direction") or "front"
        slug = inputs.get("asset_slug") or "dir"
        values, keep_lora = diffusion_values(inputs, settings, f"pixelforge/{slug}_{facing}")
        return load_workflow(self.workflow_path(), values, keep_lora=keep_lora)
