import { useEffect, useRef } from "react";
import { api } from "../api";
import { imageChoices } from "../lib/format";
import { run, useStudio } from "../store";
import type { Style } from "../types";
import { PromptParts, usePersistedPrompts } from "./PromptParts";
import { defaultsFor, valuesToInputs, WorkflowForm, type FormValues } from "./WorkflowForm";
import { Button, SelectInput } from "./ui";

function stylePatch(style: Style, current: FormValues): FormValues {
  const next: FormValues = {
    ...current,
    width: String(style.width),
    height: String(style.height),
    steps: String(style.steps),
    cfg: String(style.cfg),
    negative_prompt: style.negative_prompt,
    lora_strength: String(style.lora_strength),
  };
  if (style.model) next.model = style.model;
  if (style.lora) next.lora = style.lora;
  return next;
}

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
  const formDrafts = useStudio((state) => state.formDrafts);
  const workflowByAsset = useStudio((state) => state.workflowByAsset);
  const ensureDraft = useStudio((state) => state.ensureDraft);
  const patchDraft = useStudio((state) => state.patchDraft);
  const writeDraft = useStudio((state) => state.writeDraft);
  const setAssetWorkflow = useStudio((state) => state.setAssetWorkflow);
  const patchAsset = useStudio((state) => state.patchAsset);
  const setSettings = useStudio((state) => state.setSettings);
  const refreshAsset = useStudio((state) => state.refreshAsset);
  const selectVersion = useStudio((state) => state.selectVersion);
  const prompts = usePersistedPrompts();
  const seenSelection = useRef<string | null | undefined>(undefined);

  const activeId = locked ? workflowId : asset ? workflowByAsset[asset.id] || workflowId : workflowId;
  const workflow = workflows.find((item) => item.id === activeId) ?? workflows.find((item) => item.id === workflowId);
  const draftKey = asset && workflow ? `${asset.id}:${workflow.id}` : "";
  const values = draftKey ? formDrafts[draftKey] : undefined;

  useEffect(() => {
    if (!asset || !workflow || !settings || !draftKey) return;
    if (formDrafts[draftKey]) return;
    const next = defaultsFor(workflow.inputs);
    if (!next.width) next.width = String(settings.default_width);
    if (!next.height) next.height = String(settings.default_height);
    if (!next.steps) next.steps = String(settings.default_steps);
    if (!next.cfg) next.cfg = String(settings.default_cfg);
    if (!next.model) next.model = settings.default_model;
    if (!next.lora) next.lora = settings.default_lora;
    if (workflow.inputs.some((field) => field.type === "image") && selectedId) {
      next.image = `version:${selectedId}`;
    }
    ensureDraft(draftKey, next);
  }, [asset, workflow, settings, draftKey, formDrafts, selectedId, ensureDraft]);

  useEffect(() => {
    if (seenSelection.current === undefined) {
      seenSelection.current = selectedId;
      return;
    }
    if (seenSelection.current === selectedId) return;
    seenSelection.current = selectedId;
    if (!draftKey || !workflow || !selectedId) return;
    if (!workflow.inputs.some((field) => field.type === "image")) return;
    patchDraft(draftKey, "image", `version:${selectedId}`);
  }, [selectedId, draftKey, workflow, patchDraft]);

  if (!asset || !workflow) {
    return <p className="p-6 text-sm text-mist">Workflows are still loading.</p>;
  }

  const images = imageChoices(asset.versions, asset.references);
  const formValues = values ?? {};

  function changeValue(key: string, value: string): void {
    patchDraft(draftKey, key, value);
    if (key === "model" && value) {
      void run(async () => {
        const saved = await api.saveSettings({ default_model: value });
        setSettings(saved);
      });
    }
  }

  async function useDroppedImage(file: File): Promise<void> {
    const version = await api.uploadVersion(asset!.id, file, { kind: "import", prompt: file.name });
    await refreshAsset();
    selectVersion(version.id);
    patchDraft(draftKey, "image", `version:${version.id}`);
  }

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
              onClick={() => setAssetWorkflow(asset.id, item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-48 flex-1 text-xs text-mist">
          Style preset
          <SelectInput
            className="mt-1"
            value={asset.style_id ?? ""}
            onChange={(event) => {
              const styleId = event.target.value || null;
              void run(async () => {
                await api.updateAsset(asset.id, { style_id: styleId });
                patchAsset({ style_id: styleId });
              });
            }}
          >
            <option value="">None</option>
            {styles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </SelectInput>
        </label>
        <Button
          type="button"
          disabled={!asset.style_id}
          onClick={() => {
            const style = styles.find((item) => item.id === asset.style_id);
            if (!style) return;
            writeDraft(draftKey, stylePatch(style, formValues));
            if (!locked && style.preferred_workflow) setAssetWorkflow(asset.id, style.preferred_workflow);
            if (style.model) {
              void run(async () => {
                const saved = await api.saveSettings({ default_model: style.model });
                setSettings(saved);
              });
            }
          }}
        >
          Apply style
        </Button>
      </div>
      <PromptParts
        styleId={asset.style_id}
        description={prompts.description}
        standard={prompts.standard}
        onDescription={prompts.setDescription}
        onStandard={prompts.setStandard}
      />
      <WorkflowForm
        fields={workflow.inputs}
        values={formValues}
        images={images}
        onChange={changeValue}
        onImageFile={(file) => void run(() => useDroppedImage(file))}
      />
      <div>
        <Button
          id="pixelforge-generate"
          tone="accent"
          onClick={() =>
            void run(async () => {
              await prompts.flush();
              const latestAsset = useStudio.getState().asset;
              if (!latestAsset) return;
              await api.generate({
                asset_id: latestAsset.id,
                workflow_id: workflow.id,
                style_id: latestAsset.style_id,
                inputs: valuesToInputs(workflow.inputs, useStudio.getState().formDrafts[draftKey] ?? formValues),
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
