import { useState } from "react";
import { useStudio } from "../store";
import { versionLabel } from "../lib/format";

const SHORTCUTS: Array<[string, string]> = [
  ["1–8", "Gallery, Generate, Edit, Pixelize, Directions, Animation, Sheet, Editor"],
  ["Ctrl+Enter", "Run the current generate / edit / pixelize action"],
  ["Ctrl+S", "Save the pixel editor canvas as a new version"],
  ["B E G I", "Pencil, eraser, fill, eyedropper"],
  ["R V M", "Rectangle, selection, move"],
  ["Ctrl+Z / Ctrl+Y", "Undo / redo in the editor"],
  ["[ ]", "Zoom out / in (1600% is the 16× step)"],
  ["H", "Mirror horizontal"],
  ["Shift+R", "Replace the sampled color"],
  ["Delete", "Clear the selection, or delete the animation frame"],
  ["Space", "Play or pause the animation"],
  ["← →", "Previous / next animation frame"],
  ["?", "Show this list"],
  ["Esc", "Close a dialog"],
];

export function Overlays() {
  const toasts = useStudio((state) => state.toasts);
  const dismissToast = useStudio((state) => state.dismissToast);
  const helpOpen = useStudio((state) => state.helpOpen);
  const setHelpOpen = useStudio((state) => state.setHelpOpen);
  const lightboxUrl = useStudio((state) => state.lightboxUrl);
  const setLightbox = useStudio((state) => state.setLightbox);
  const compareOpen = useStudio((state) => state.compareOpen);
  const setCompareOpen = useStudio((state) => state.setCompareOpen);
  const asset = useStudio((state) => state.asset);
  const selectedVersionId = useStudio((state) => state.selectedVersionId);
  const compareVersionId = useStudio((state) => state.compareVersionId);
  const [wipe, setWipe] = useState(50);

  const left = asset?.versions.find((version) => version.id === selectedVersionId);
  const right = asset?.versions.find((version) => version.id === compareVersionId);

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            className={`pointer-events-auto rounded-md border px-3 py-2 text-left text-sm shadow-panel ${
              toast.tone === "error" ? "border-red-400/40 bg-[#2a1618]" : "border-line bg-panel"
            }`}
            onClick={() => dismissToast(toast.id)}
          >
            {toast.message}
          </button>
        ))}
      </div>
      {helpOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-[520px] rounded-lg border border-line bg-panel p-4 shadow-panel">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg">Keyboard shortcuts</h2>
              <button onClick={() => setHelpOpen(false)}>Close</button>
            </div>
            <ul className="space-y-1 text-sm">
              {SHORTCUTS.map(([keys, label]) => (
                <li key={keys} className="flex justify-between gap-4 border-b border-line/60 py-1">
                  <span>{label}</span>
                  <span className="shrink-0 text-mist">{keys}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {lightboxUrl ? (
        <button className="fixed inset-0 z-40 flex items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
          <img src={lightboxUrl} alt="Enlarged version" className="checker max-h-[85vh] max-w-[85vw] object-contain" />
        </button>
      ) : null}
      {compareOpen && left && right ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-8">
          <div className="w-full max-w-4xl rounded-lg border border-line bg-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm">
                Compare {versionLabel(left)} with {versionLabel(right)}
              </h2>
              <button onClick={() => setCompareOpen(false)}>Close</button>
            </div>
            <div className="checker relative mx-auto aspect-square max-h-[60vh] overflow-hidden">
              <img src={left.url} alt={versionLabel(left)} className="absolute inset-0 h-full w-full object-contain" />
              <img
                src={right.url}
                alt={versionLabel(right)}
                className="absolute inset-0 h-full w-full object-contain"
                style={{ clipPath: `inset(0 0 0 ${wipe}%)` }}
              />
            </div>
            <input className="mt-3 w-full" type="range" min={0} max={100} value={wipe} onChange={(event) => setWipe(Number(event.target.value))} />
          </div>
        </div>
      ) : null}
    </>
  );
}
