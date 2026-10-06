from app.workflow_support import (
    WorkflowAdapter,
    common_sampler_fields,
    diffusion_values,
    field,
    load_workflow,
    prompt_fields,
)


class Adapter(WorkflowAdapter):
    id = "image_edit"
    name = "Edit Sprite"
    description = "Img2img edit. Stock nodes: LoadImage, ImageScale, VAEEncode, KSampler, VAEDecode. The original version is kept."

    def inputs_schema(self) -> list[dict]:
        return [
            field("image", "Source image", "image", required=True),
            *prompt_fields(),
            field("denoise", "Denoise", "number", default=0.55, min=0.05, max=1, step=0.05),
            field("width", "Width", "number", default=512, min=64, max=2048, step=64),
            field("height", "Height", "number", default=512, min=64, max=2048, step=64),
            *common_sampler_fields(),
        ]

    def build_workflow(self, inputs: dict, settings: dict) -> dict:
        slug = inputs.get("asset_slug") or "edit"
        values, keep_lora = diffusion_values(inputs, settings, f"pixelforge/{slug}_edit")
        return load_workflow(self.workflow_path(), values, keep_lora=keep_lora)
