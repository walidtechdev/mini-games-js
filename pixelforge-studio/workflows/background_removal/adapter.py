from app.workflow_support import WorkflowAdapter, diffusion_values, field, load_workflow


class Adapter(WorkflowAdapter):
    id = "background_removal"
    name = "Remove Background"
    description = (
        "Sends the sprite through workflows/background_removal/workflow.json. "
        "The shipped graph expects the RMBG custom node. Export your own background-removal "
        "graph from ComfyUI (API format) over this file and keep the __IMAGE__ and __FILENAME__ placeholders."
    )

    def inputs_schema(self) -> list[dict]:
        return [field("image", "Image", "image", required=True)]

    def build_workflow(self, inputs: dict, settings: dict) -> dict:
        slug = inputs.get("asset_slug") or "cutout"
        values, _keep = diffusion_values(inputs, settings, f"pixelforge/{slug}_cutout")
        return load_workflow(self.workflow_path(), values, keep_lora=False)
