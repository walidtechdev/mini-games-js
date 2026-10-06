from app.workflow_support import WorkflowAdapter, diffusion_values, field, load_workflow


class Adapter(WorkflowAdapter):
    id = "upscale"
    name = "Upscale"
    description = "Scale a sprite through ComfyUI ImageScale. Swap workflow.json for an ESRGAN or Ultimate SD Upscale graph if you want a model upscale."

    def inputs_schema(self) -> list[dict]:
        return [
            field("image", "Image", "image", required=True),
            field("scale", "Scale", "number", default=2, min=1, max=8, step=1),
            field(
                "method",
                "Method",
                "select",
                default="nearest-exact",
                options=["nearest-exact", "lanczos", "bicubic", "bilinear", "area"],
            ),
        ]

    def build_workflow(self, inputs: dict, settings: dict) -> dict:
        scale = max(1, int(inputs.get("scale") or 2))
        width = int(inputs.get("source_width") or inputs.get("width") or 64) * scale
        height = int(inputs.get("source_height") or inputs.get("height") or 64) * scale
        enriched = dict(inputs)
        enriched["width"] = width
        enriched["height"] = height
        slug = inputs.get("asset_slug") or "upscale"
        values, _keep = diffusion_values(enriched, settings, f"pixelforge/{slug}_upscale")
        return load_workflow(self.workflow_path(), values, keep_lora=False)
