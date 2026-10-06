import { useEffect, useState } from "react";
import { api } from "../api";
import { run, useStudio } from "../store";
import type { Settings } from "../types";
import { Button, TextInput } from "../components/ui";

function formatVram(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "unknown";
  const gigabytes = bytes / 1024 ** 3;
  if (gigabytes >= 0.1) return `${gigabytes.toFixed(1)} GB`;
  const megabytes = bytes / 1024 ** 2;
  if (megabytes >= 0.1) return `${Math.round(megabytes)} MB`;
  return `${bytes} B`;
}

export function SettingsView() {
  const settings = useStudio((state) => state.settings);
  const workflows = useStudio((state) => state.workflows);
  const projects = useStudio((state) => state.projects);
  const setSettings = useStudio((state) => state.setSettings);
  const setComfy = useStudio((state) => state.setComfy);
  const comfyStatus = useStudio((state) => state.comfyStatus);
  const gpu = useStudio((state) => state.gpu);
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  if (!draft) return <p className="p-6 text-sm text-mist">Loading settings…</p>;

  function update(patch: Partial<Settings>): void {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <form
        className="mt-4 grid max-w-xl gap-3 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const saved = await api.saveSettings(draft);
            setSettings(saved);
          });
        }}
      >
        <label className="text-xs text-mist">
          ComfyUI URL
          <TextInput className="mt-1" value={draft.comfyui_url} onChange={(event) => update({ comfyui_url: event.target.value })} />
        </label>
        <label className="text-xs text-mist">
          Storage directory
          <TextInput className="mt-1" value={draft.storage_dir} onChange={(event) => update({ storage_dir: event.target.value })} />
        </label>
        <label className="text-xs text-mist">
          Default workflow
          <select className="mt-1 w-full rounded-md border border-line bg-ink px-2 py-1.5" value={draft.default_workflow} onChange={(event) => update({ default_workflow: event.target.value })}>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-mist">
          Default model
          <TextInput className="mt-1" value={draft.default_model} onChange={(event) => update({ default_model: event.target.value })} />
        </label>
        <label className="text-xs text-mist">
          Default LoRA
          <TextInput className="mt-1" value={draft.default_lora} onChange={(event) => update({ default_lora: event.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-mist">
            Default width
            <TextInput className="mt-1" type="number" value={draft.default_width} onChange={(event) => update({ default_width: Number(event.target.value) })} />
          </label>
          <label className="text-xs text-mist">
            Default height
            <TextInput className="mt-1" type="number" value={draft.default_height} onChange={(event) => update({ default_height: Number(event.target.value) })} />
          </label>
        </div>
        <label className="text-xs text-mist">
          Default project
          <select className="mt-1 w-full rounded-md border border-line bg-ink px-2 py-1.5" value={draft.default_project_id} onChange={(event) => update({ default_project_id: event.target.value })}>
            <option value="">None</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button tone="accent" type="submit">
            Save settings
          </Button>
          <Button
            type="button"
            disabled={testing}
            onClick={() => {
              setTesting(true);
              void run(async () => {
                const result = await api.testComfy();
                setComfy(result.status, result.gpu);
              }).finally(() => setTesting(false));
            }}
          >
            Test ComfyUI Connection
          </Button>
        </div>
      </form>
      <section className="mt-6 max-w-xl rounded-lg border border-line bg-panel p-4">
        <h2 className="text-sm font-medium">GPU information</h2>
        <p className={`mt-1 text-sm ${comfyStatus === "Connected" ? "text-emerald-300" : comfyStatus === "Offline" ? "text-red-300" : "text-mist"}`}>
          {comfyStatus === "unknown" ? "Not tested yet" : comfyStatus}
        </p>
        {comfyStatus === "Connected" && gpu ? (
          <div className="mt-2 space-y-2 text-xs text-mist">
            <p>Read from ComfyUI /system_stats. PixelForge does not query the GPU itself.</p>
            <div>ComfyUI {gpu.comfyui_version || "unknown version"}</div>
            <div>PyTorch {gpu.pytorch || "—"}</div>
            {gpu.devices.length === 0 ? <p>ComfyUI did not include a device in /system_stats.</p> : null}
            {gpu.devices.map((device, index) => (
              <div key={`${device.name ?? "device"}-${index}`}>
                <div className="text-sm text-slate-100">{device.name || "Unnamed device"}</div>
                <div>
                  VRAM {formatVram(device.vram_free)} free / {formatVram(device.vram_total)} total
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-mist">
            {comfyStatus === "Offline"
              ? "Offline. Start ComfyUI and check the configured address, then test again. GPU name and VRAM show up only after ComfyUI answers /system_stats."
              : "Run Test ComfyUI Connection to load the device name and VRAM from ComfyUI."}
          </p>
        )}
      </section>
    </div>
  );
}
