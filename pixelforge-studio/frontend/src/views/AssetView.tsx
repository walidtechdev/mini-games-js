import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { AnimationPanel } from "../components/AnimationPanel";
import { DirectionsPanel } from "../components/DirectionsPanel";
import { Gallery } from "../components/Gallery";
import { GeneratePanel } from "../components/GeneratePanel";
import { PixelEditor } from "../components/PixelEditor";
import { SpritesheetPanel } from "../components/SpritesheetPanel";
import { run, useStudio } from "../store";
import type { WorkspaceMode } from "../types";

const MODES: Array<[WorkspaceMode, string]> = [
  ["gallery", "Gallery"],
  ["generate", "Generate"],
  ["edit", "Edit"],
  ["pixelize", "Pixelize"],
  ["directions", "Directions"],
  ["animation", "Animation"],
  ["spritesheet", "Sheet"],
  ["editor", "Editor"],
];

export function AssetView() {
  const { assetId } = useParams();
  const asset = useStudio((state) => state.asset);
  const mode = useStudio((state) => state.mode);
  const setMode = useStudio((state) => state.setMode);
  const openAsset = useStudio((state) => state.openAsset);

  useEffect(() => {
    if (assetId) void run(() => openAsset(assetId));
  }, [assetId, openAsset]);

  if (!asset || asset.id !== assetId) return <p className="p-6 text-sm text-mist">Loading asset…</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-mist">
            {asset.project_name} / {asset.category_name}
          </div>
          <h1 className="text-lg font-semibold">{asset.name}</h1>
        </div>
        <div className="flex flex-wrap gap-1">
          {MODES.map(([id, label]) => (
            <button
              key={id}
              className={`rounded-full px-2.5 py-1 text-xs ${mode === id ? "bg-accent text-ink" : "bg-raised text-mist"}`}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {mode === "gallery" ? <Gallery /> : null}
        {mode === "generate" ? (
          <GeneratePanel workflowId="txt2sprite" title="Generate" blurb="Pick a workflow. PixelForge injects your prompt into it and stores every result as a new version." />
        ) : null}
        {mode === "edit" ? (
          <GeneratePanel workflowId="image_edit" locked title="Edit" blurb="The source image stays where it is. This queues an image-edit workflow and saves a new version." />
        ) : null}
        {mode === "pixelize" ? (
          <GeneratePanel
            workflowId="pixelize"
            locked
            title="Pixelize"
            blurb="Algorithmic nearest-neighbor, palette, and cleanup run on this machine. AI sends the sprite through the pixelize workflow."
          />
        ) : null}
        {mode === "directions" ? <DirectionsPanel /> : null}
        {mode === "animation" ? <AnimationPanel /> : null}
        {mode === "spritesheet" ? <SpritesheetPanel /> : null}
        {mode === "editor" ? <PixelEditor /> : null}
      </div>
    </div>
  );
}
