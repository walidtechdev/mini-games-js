import { useState } from "react";
import { api } from "../api";
import { formatWhen, versionLabel } from "../lib/format";
import { run, useStudio } from "../store";
import type { ReferenceImage } from "../types";
import { REFERENCE_LABELS } from "../types";
import { Button, SelectInput } from "./ui";

export function Inspector() {
  const project = useStudio((state) => state.project);
  const asset = useStudio((state) => state.asset);
  const workflows = useStudio((state) => state.workflows);
  const styles = useStudio((state) => state.styles);
  const selectedId = useStudio((state) => state.selectedVersionId);
  const mode = useStudio((state) => state.mode);
  const setMode = useStudio((state) => state.setMode);
  const refreshAsset = useStudio((state) => state.refreshAsset);
  const [label, setLabel] = useState<(typeof REFERENCE_LABELS)[number]>("concept");
  const version = asset?.versions.find((item) => item.id === selectedId) ?? null;
  const style = styles.find((item) => item.id === asset?.style_id);
  const workflow = workflows.find((item) => item.id === (style?.preferred_workflow || "txt2sprite"));

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-mist">Editing</div>
        <div className="truncate text-base font-semibold">{asset ? asset.name : project ? project.name : "Nothing selected"}</div>
        <div className="text-xs text-mist">
          {asset ? `${asset.project_name} / ${asset.category_name}` : project ? "Choose an asset from the library" : "Open a project to begin"}
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-auto px-4 py-3 text-sm">
        <section>
          <h2 className="mb-1 text-[11px] uppercase tracking-wider text-mist">Can generate</h2>
          <p className="text-mist">
            {workflow ? workflow.name : "Generate Sprite"}
            {style ? ` · ${style.name}` : ""}
          </p>
          <Button className="mt-2" tone="accent" disabled={!asset} onClick={() => setMode("generate")}>
            Open generate
          </Button>
          <p className="mt-2 text-xs text-mist">Workspace: {mode}</p>
        </section>
        <section>
          <h2 className="mb-2 text-[11px] uppercase tracking-wider text-mist">Selected</h2>
          {version ? (
            <div className="space-y-2">
              <div className="checker flex aspect-square items-center justify-center rounded-md">
                <img src={version.url} alt={versionLabel(version)} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="font-medium">{versionLabel(version)}</div>
              <dl className="space-y-1 text-xs text-mist">
                <div>Size {version.width}×{version.height}</div>
                <div>Seed {version.seed ?? "—"}</div>
                <div>Model {version.model || "—"}</div>
                <div>LoRA {version.lora || "—"}</div>
                <div>Workflow {version.workflow_id || "—"}</div>
                <div>{formatWhen(version.created_at)}</div>
              </dl>
              {version.prompt ? <p className="text-xs leading-relaxed">{version.prompt}</p> : null}
              <Button
                className="w-full"
                disabled={!version.workflow_id || version.workflow_id === "editor" || version.workflow_id === "spritesheet"}
                onClick={() =>
                  void run(async () => {
                    await api.reproduce(version.id);
                  })
                }
              >
                Reproduce
              </Button>
            </div>
          ) : (
            <p className="text-xs text-mist">Select a version in the gallery. Shift-click a second one to compare.</p>
          )}
        </section>
        {asset ? (
          <section>
            <h2 className="mb-2 text-[11px] uppercase tracking-wider text-mist">References</h2>
            <div className="mb-2 flex gap-2">
              <SelectInput value={label} onChange={(event) => setLabel(event.target.value as typeof label)}>
                {REFERENCE_LABELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectInput>
              <label className="shrink-0">
                <input
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void run(async () => {
                      await api.uploadReference(asset.id, file, label);
                      await refreshAsset();
                    });
                  }}
                />
                <span className="inline-block cursor-pointer rounded-md border border-line bg-raised px-3 py-1.5 text-sm">Upload</span>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {asset.references.map((reference) => (
                <ReferenceThumb key={reference.id} reference={reference} onDelete={() => void run(async () => {
                  await api.deleteReference(reference.id);
                  await refreshAsset();
                })} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function ReferenceThumb({ reference, onDelete }: { reference: ReferenceImage; onDelete: () => void }) {
  return (
    <div className="group relative">
      <img src={reference.url} alt={reference.label} className="checker aspect-square w-full rounded object-contain" />
      <div className="truncate text-[10px] text-mist">{reference.label}</div>
      <button className="absolute right-1 top-1 hidden rounded bg-black/70 px-1 text-[10px] group-hover:block" onClick={onDelete}>
        ×
      </button>
    </div>
  );
}
