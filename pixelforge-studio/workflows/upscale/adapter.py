from app.workflow_support import WorkflowAdapter, diffusion_values, field, load_workflow

UPSCALE_MODELS = [
    "RealESRGAN_x4plus_anime_6B.pth",
    "4x-UltraSharp.pth",
    "RealESRGAN_x4.pth",
    "4x_NMKD-Superscale-SP_178000_G.pth",
    "OmniSR_X2_DIV2K.safetensors",
    "OmniSR_X3_DIV2K.safetensors",
    "OmniSR_X4_DIV2K.safetensors",
]


class Adapter(WorkflowAdapter):
    id = "upscale"
    name = "Upscale"
    description = (
        "Upscale with ComfyUI's UpscaleModelLoader and ImageUpscaleWithModel. "
        "The default weight is RealESRGAN_x4plus_anime_6B.pth."
    )

    def inputs_schema(self) -> list[dict]:
        return [
            field("image", "Image", "image", required=True),
            field(
                "upscale_model",
                "Upscale model",
                "select",
                default="RealESRGAN_x4plus_anime_6B.pth",
                options=UPSCALE_MODELS,
            ),
        ]

    def build_workflow(self, inputs: dict, settings: dict) -> dict:
        slug = inputs.get("asset_slug") or "upscale"
        values, _keep = diffusion_values(inputs, settings, f"pixelforge/{slug}_upscale")
        return load_workflow(self.workflow_path(), values, keep_lora=False)
