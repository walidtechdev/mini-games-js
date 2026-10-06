from app.workflow_support import (
    WorkflowAdapter,
    common_sampler_fields,
    diffusion_values,
    field,
    load_workflow,
    prompt_fields,
)


class Adapter(WorkflowAdapter):
    id = "txt2sprite"
    name = "Generate Sprite"
    description = "Text to sprite on a stock ComfyUI graph: checkpoint, prompts, empty latent, KSampler, VAE decode."

    def inputs_schema(self) -> list[dict]:
        return [
            *prompt_fields(),
            field("width", "Width", "number", default=512, min=64, max=2048, step=64),
            field("height", "Height", "number", default=512, min=64, max=2048, step=64),
            *common_sampler_fields(),
        ]

    def build_workflow(self, inputs: dict, settings: dict) -> dict:
        slug = inputs.get("asset_slug") or "sprite"
        values, keep_lora = diffusion_values(inputs, settings, f"pixelforge/{slug}")
        values["DENOISE"] = 1
        return load_workflow(self.workflow_path(), values, keep_lora=keep_lora)
