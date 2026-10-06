import { useState } from "react";
import { api } from "../api";
import { run, useStudio } from "../store";
import type { Style } from "../types";
import { Button, TextArea, TextInput } from "../components/ui";

const EMPTY: Partial<Style> = {
  name: "",
  prompt_prefix: "",
  negative_prompt: "",
  model: "",
  lora: "",
  lora_strength: 0.8,
  steps: 20,
  cfg: 7,
  width: 64,
  height: 64,
  preferred_workflow: "txt2sprite",
};

export function StylesView() {
  const styles = useStudio((state) => state.styles);
  const workflows = useStudio((state) => state.workflows);
  const setStyles = useStudio((state) => state.setStyles);
  const [draft, setDraft] = useState<Partial<Style>>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);

  function update(patch: Partial<Style>): void {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function reload(): Promise<void> {
    setStyles(await api.styles());
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_1fr]">
      <div className="overflow-auto border-r border-line p-3">
        <Button className="mb-3 w-full" onClick={() => { setEditing(null); setDraft(EMPTY); }}>
          New style
        </Button>
        {styles.map((style) => (
          <button key={style.id} className={`mb-1 block w-full rounded px-2 py-2 text-left text-sm ${editing === style.id ? "bg-raised" : "hover:bg-raised/60"}`} onClick={() => { setEditing(style.id); setDraft(style); }}>
            <div>{style.name}</div>
            <div className="text-[11px] text-mist">{style.is_builtin ? "Built-in" : "Custom"} · {style.preferred_workflow}</div>
          </button>
        ))}
      </div>
      <form
        className="space-y-3 overflow-auto p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            if (editing) await api.updateStyle(editing, draft);
            else await api.createStyle(draft);
            await reload();
          });
        }}
      >
        <h1 className="text-xl font-semibold">{editing ? "Edit style" : "New style"}</h1>
        <TextInput placeholder="Name" value={draft.name ?? ""} onChange={(event) => update({ name: event.target.value })} />
        <TextArea rows={3} placeholder="Prompt prefix" value={draft.prompt_prefix ?? ""} onChange={(event) => update({ prompt_prefix: event.target.value })} />
        <TextArea rows={2} placeholder="Negative prompt" value={draft.negative_prompt ?? ""} onChange={(event) => update({ negative_prompt: event.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <TextInput placeholder="Model" value={draft.model ?? ""} onChange={(event) => update({ model: event.target.value })} />
          <TextInput placeholder="LoRA" value={draft.lora ?? ""} onChange={(event) => update({ lora: event.target.value })} />
          <TextInput type="number" value={draft.width ?? 64} onChange={(event) => update({ width: Number(event.target.value) })} />
          <TextInput type="number" value={draft.height ?? 64} onChange={(event) => update({ height: Number(event.target.value) })} />
          <TextInput type="number" value={draft.steps ?? 20} onChange={(event) => update({ steps: Number(event.target.value) })} />
          <TextInput type="number" step={0.5} value={draft.cfg ?? 7} onChange={(event) => update({ cfg: Number(event.target.value) })} />
        </div>
        <select className="w-full rounded-md border border-line bg-ink px-2 py-1.5 text-sm" value={draft.preferred_workflow ?? "txt2sprite"} onChange={(event) => update({ preferred_workflow: event.target.value })}>
          {workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button tone="accent" type="submit" disabled={!draft.name?.trim()}>
            Save style
          </Button>
          {editing && !styles.find((style) => style.id === editing)?.is_builtin ? (
            <Button
              tone="danger"
              type="button"
              onClick={() =>
                void run(async () => {
                  await api.deleteStyle(editing);
                  setEditing(null);
                  setDraft(EMPTY);
                  await reload();
                })
              }
            >
              Delete
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
