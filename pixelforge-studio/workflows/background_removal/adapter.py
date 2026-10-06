from app.workflow_support import WorkflowAdapter, diffusion_values, field, load_workflow


class Adapter(WorkflowAdapter):
    id = "background_removal"
    name = "Remove Background"
    description = (
        "Sends the sprite through workflows/background_removal/workflow.json. "
        "The shipped graph still calls a node named RMBG. comfyui-rmbg and comfyui-inspyrenet-rembg "
        "are on this machine, but their class names and input sockets were not verified, so the graph was left as-is."
    )

    def inputs_schema(self) -> list[dict]:
        return [field("image", "Image", "image", required=True)]

    def build_workflow(self, inputs: dict, settings: dict) -> dict:
        slug = inputs.get("asset_slug") or "cutout"
        values, _keep = diffusion_values(inputs, settings, f"pixelforge/{slug}_cutout")
        return load_workflow(self.workflow_path(), values, keep_lora=False)
