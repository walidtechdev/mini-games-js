import { useEffect, useState } from "react";
import { api } from "../api";
import { imageChoices } from "../lib/format";
import { run, useStudio } from "../store";
import { defaultsFor, valuesToInputs, WorkflowForm, type FormValues } from "./WorkflowForm";
import { Button, SelectInput } from "./ui";

export function GeneratePanel({
  workflowId,
  title,
  blurb,
  locked = false,
}: {
  workflowId: string;
  title: string;
  blurb: string;
  locked?: boolean;
}) {
  const workflows = useStudio((state) => state.workflows);
  const styles = useStudio((state) => state.styles);
  const asset = useStudio((state) => state.asset);
  const settings = useStudio((state) => state.settings);
  const selectedId = useStudio((state) => state.selectedVersionId);
  const [activeId, setActiveId] = useState(workflowId);
  const [styleId, setStyleId] = useState(asset?.style_id ?? "");
  const [values, setValues] = useState<FormValues>({});

  const workflow = workflows.find((item) => item.id === (locked ? workflowId : activeId)) ?? workflows.find((item) => item.id === workflowId);

  useEffect(() => {
    if (!workflow) return;
    const next = defaultsFor(workflow.inputs);
    const style = styles.find((item) => item.id === (styleId || asset?.style_id));
    if (style) {
      if (next.prompt != null) {
        const base = String(workflow.inputs.find((field) => field.key === "prompt")?.default ?? "");
        next.prompt = style.prompt_prefix ? `${style.prompt_prefix}, ${base}` : base;
      }
      if (next.negative_prompt != null) next.negative_prompt = style.negative_prompt;
      if (next.width != null) next.width = String(style.width);
      if (next.height != null) next.height = String(style.height);
      if (next.steps != null) next.steps = String(style.steps);
      if (next.cfg != null) next.cfg = String(style.cfg);
      if (style.model) next.model = style.model;
      if (style.lora) next.lora = style.lora;
    } else if (settings) {
      if (next.width != null && !next.width) next.width = String(settings.default_width);
      if (next.height != null && !next.height) next.height = String(settings.default_height);
      if (next.model != null && !next.model) next.model = settings.default_model;
    }
    if (workflow.inputs.some((field) => field.type === "image") && selectedId) {
      next.image = `version:${selectedId}`;
    }
    setValues(next);
  }, [workflow, styleId, asset?.style_id, settings, styles]);

  useEffect(() => {
    if (!workflow?.inputs.some((field) => field.type === "image") || !selectedId) return;
    setValues((current) => ({ ...current, image: `version:${selectedId}` }));
  }, [selectedId, workflow]);

  if (!asset || !workflow) {
    return <p className="p-6 text-sm text-mist">Workflows are still loading.</p>;
  }

  const images = imageChoices(asset.versions, asset.references);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-auto p-5">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-mist">{blurb}</p>
      </div>
      {!locked ? (
        <div className="flex flex-wrap gap-2">
          {workflows.map((item) => (
            <button
              key={item.id}
              className={`rounded-full border px-3 py-1 text-xs ${item.id === workflow.id ? "border-accent bg-accent/15 text-accent" : "border-line text-mist"}`}
              onClick={() => setActiveId(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      <label className="block text-xs text-mist">
        Style preset
        <SelectInput className="mt-1" value={styleId} onChange={(event) => setStyleId(event.target.value)}>
          <option value="">None</option>
          {styles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.name}
            </option>
          ))}
        </SelectInput>
      </label>
      <WorkflowForm
        fields={workflow.inputs}
        values={values}
        images={images}
        onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
      />
      <div>
        <Button
          id="pixelforge-generate"
          tone="accent"
          onClick={() =>
            void run(async () => {
              await api.generate({
                asset_id: asset.id,
                workflow_id: workflow.id,
                style_id: styleId || null,
                inputs: valuesToInputs(workflow.inputs, values),
              });
            })
          }
        >
          Generate
        </Button>
      </div>
    </div>
  );
}
