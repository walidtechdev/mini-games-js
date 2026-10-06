import { useState } from "react";
import { api } from "../api";
import { versionLabel } from "../lib/format";
import { run, useStudio } from "../store";
import { DIRECTIONS_4, DIRECTIONS_8 } from "../types";
import { DropImage } from "./DropImage";
import { PromptParts, usePersistedPrompts } from "./PromptParts";
import { Button, SelectInput } from "./ui";

export function DirectionsPanel() {
  const asset = useStudio((state) => state.asset);
  const selectedId = useStudio((state) => state.selectedVersionId);
  const masters = useStudio((state) => state.masters);
  const setMaster = useStudio((state) => state.setMaster);
  const refreshAsset = useStudio((state) => state.refreshAsset);
  const selectVersion = useStudio((state) => state.selectVersion);
  const [eight, setEight] = useState(false);
  const prompts = usePersistedPrompts();
  const directions = eight ? DIRECTIONS_8 : DIRECTIONS_4;
  if (!asset) return null;
  const storedId = masters[asset.id]?.directions;
  const master =
    asset.versions.find((version) => version.id === storedId) ??
    asset.versions.find((version) => version.id === (selectedId || asset.primary_version_id));

  function latest(direction: string) {
    return asset?.versions.find((version) => version.kind === "direction" && version.direction === direction);
  }

  async function importMaster(file: File): Promise<void> {
    const version = await api.uploadVersion(asset!.id, file, { kind: "import", prompt: file.name });
    await refreshAsset();
    selectVersion(version.id);
    setMaster(asset!.id, "directions", version.id);
  }

  async function generate(list: readonly string[]): Promise<void> {
    if (!master || !asset) return;
    await prompts.flush();
    await api.directions({
      asset_id: asset.id,
      directions: list,
      style_id: asset.style_id,
      inputs: {
        image: `version:${master.id}`,
        width: master.width > 32 ? master.width : 512,
        height: master.height > 32 ? master.height : 512,
      },
    });
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Directions</h2>
          <p className="text-sm text-mist">
            Master: {master ? versionLabel(master) : "drop a sprite or pick a version"}. Each facing is its own version. Regenerating one facing uses the same master.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEight((value) => !value)}>{eight ? "8 directions" : "4 directions"}</Button>
          <Button id="pixelforge-generate" tone="accent" disabled={!master} onClick={() => void run(() => generate(directions))}>
            Generate all
          </Button>
        </div>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-[220px_1fr]">
        <DropImage label="Drop a master sprite, or choose a file" onFile={(file) => void run(() => importMaster(file))}>
          <div className="checker m-2 flex aspect-square items-center justify-center">
            {master ? <img src={master.url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-mist">No master</span>}
          </div>
        </DropImage>
        <div className="grid content-start gap-3">
          <label className="text-xs text-mist">
            Master version
            <SelectInput
              className="mt-1"
              value={master?.id ?? ""}
              onChange={(event) => {
                if (event.target.value) setMaster(asset.id, "directions", event.target.value);
              }}
            >
              <option value="">Choose a version</option>
              {asset.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {versionLabel(version)} · {version.kind}
                </option>
              ))}
            </SelectInput>
          </label>
          <PromptParts
            styleId={asset.style_id}
            description={prompts.description}
            standard={prompts.standard}
            onDescription={prompts.setDescription}
            onStandard={prompts.setStandard}
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {directions.map((direction) => {
          const image = latest(direction);
          return (
            <div key={direction} className="rounded-lg border border-line bg-raised p-2">
              <div className="checker mb-2 flex aspect-square items-center justify-center">
                {image ? <img src={image.url} alt={direction} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-mist">Empty</span>}
              </div>
              <div className="mb-2 text-center text-xs capitalize">{direction}</div>
              <Button className="w-full" disabled={!master} onClick={() => void run(() => generate([direction]))}>
                {image ? "Regenerate" : "Generate"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
