import { useState } from "react";
import { api } from "../api";
import { run, useStudio } from "../store";
import { DIRECTIONS_4, DIRECTIONS_8 } from "../types";
import { Button } from "./ui";

export function DirectionsPanel() {
  const asset = useStudio((state) => state.asset);
  const selectedId = useStudio((state) => state.selectedVersionId);
  const [eight, setEight] = useState(false);
  const [prompt, setPrompt] = useState("same character, pixel art sprite, full body, crisp outline");
  const directions = eight ? DIRECTIONS_8 : DIRECTIONS_4;
  if (!asset) return null;
  const master = asset.versions.find((version) => version.id === (selectedId || asset.primary_version_id));

  function latest(direction: string) {
    return asset?.versions.find((version) => version.kind === "direction" && version.direction === direction);
  }

  async function generate(list: readonly string[]): Promise<void> {
    if (!master) return;
    await run(async () => {
      await api.directions({
        asset_id: asset?.id,
        directions: list,
        style_id: asset?.style_id,
        inputs: {
          image: `version:${master.id}`,
          prompt,
          width: master.width > 32 ? master.width : 512,
          height: master.height > 32 ? master.height : 512,
        },
      });
    });
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Directions</h2>
          <p className="text-sm text-mist">
            Master: {master ? `#${String(master.number).padStart(3, "0")}` : "select a version"}. Each facing is its own version.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEight((value) => !value)}>{eight ? "8 directions" : "4 directions"}</Button>
          <Button id="pixelforge-generate" tone="accent" disabled={!master} onClick={() => void generate(directions)}>
            Generate all
          </Button>
        </div>
      </div>
      <textarea
        className="mb-4 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm"
        rows={2}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <div className={`grid gap-3 ${eight ? "grid-cols-4" : "grid-cols-4"}`}>
        {directions.map((direction) => {
          const image = latest(direction);
          return (
            <div key={direction} className="rounded-lg border border-line bg-raised p-2">
              <div className="checker mb-2 flex aspect-square items-center justify-center">
                {image ? <img src={image.url} alt={direction} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-mist">Empty</span>}
              </div>
              <div className="mb-2 text-center text-xs capitalize">{direction}</div>
              <Button className="w-full" disabled={!master} onClick={() => void generate([direction])}>
                {image ? "Regenerate" : "Generate"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
