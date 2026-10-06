from app.workflow_support import (
    WorkflowAdapter,
    common_sampler_fields,
    diffusion_values,
    field,
    load_workflow,
)


class Adapter(WorkflowAdapter):
    id = "animation"
    name = "Animation Frame"
    description = "One animation frame from a master sprite. PixelForge queues a job per frame and stores each frame on the asset."

    def inputs_schema(self) -> list[dict]:
        return [
            field("image", "Master image", "image", required=True),
            field("prompt", "Prompt", "string", default="pixel art sprite animation frame, consistent character"),
            field("negative_prompt", "Negative prompt", "string", default="blurry, photorealistic, text, extra limbs"),
            field("denoise", "Denoise", "number", default=0.45, min=0.05, max=1, step=0.05),
            field("width", "Width", "number", default=512, min=64, max=2048, step=64),
            field("height", "Height", "number", default=512, min=64, max=2048, step=64),
            *common_sampler_fields(),
        ]

    def build_workflow(self, inputs: dict, settings: dict) -> dict:
        anim = inputs.get("animation_name") or "idle"
        facing = inputs.get("direction") or "front"
        frame = inputs.get("frame_index")
        slug = inputs.get("asset_slug") or "anim"
        values, keep_lora = diffusion_values(inputs, settings, f"pixelforge/{slug}_{anim}_{facing}_{frame}")
        return load_workflow(self.workflow_path(), values, keep_lora=keep_lora)
