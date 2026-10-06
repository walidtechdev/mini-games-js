import { useState } from "react";
import { api } from "../api";
import { formatWhen, versionLabel } from "../lib/format";
import { run, useStudio } from "../store";
import { Button } from "./ui";

const FILTERS = ["all", "generation", "approved", "edit", "pixelize", "direction", "animation", "spritesheet"] as const;

export function Gallery() {
  const asset = useStudio((state) => state.asset);
  const selectedId = useStudio((state) => state.selectedVersionId);
  const compareId = useStudio((state) => state.compareVersionId);
  const selectVersion = useStudio((state) => state.selectVersion);
  const setLightbox = useStudio((state) => state.setLightbox);
  const setCompareOpen = useStudio((state) => state.setCompareOpen);
  const setMode = useStudio((state) => state.setMode);
  const refreshAsset = useStudio((state) => state.refreshAsset);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  if (!asset) return null;
  const versions = asset.versions.filter((version) => {
    if (filter === "all") return true;
    if (filter === "approved") return version.is_approved;
    return version.kind === filter;
  });
  const selected = versions.find((version) => version.id === selectedId) ?? asset.versions.find((version) => version.id === selectedId);

  async function after(action: () => Promise<unknown>): Promise<void> {
    await run(async () => {
      await action();
      await refreshAsset();
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        {FILTERS.map((item) => (
          <button
            key={item}
            className={`rounded-full px-2 py-0.5 text-xs capitalize ${filter === item ? "bg-accent text-ink" : "bg-raised text-mist"}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button disabled={!selected} onClick={() => selected && setLightbox(selected.url)}>
            Enlarge
          </Button>
          <Button disabled={!selected || !compareId} onClick={() => setCompareOpen(true)}>
            Compare
          </Button>
          <Button disabled={!selected} onClick={() => selected && void after(() => api.saveVersion(selected.id))}>
            Save as version
          </Button>
          <Button disabled={!selected} onClick={() => selected && void after(() => api.setPrimary(selected.id))}>
            Set as primary
          </Button>
          <Button disabled={!selected} onClick={() => selected && void after(() => api.approve(selected.id, !selected.is_approved))}>
            {selected?.is_approved ? "Unapprove" : "Approve"}
          </Button>
          <Button
            disabled={!selected}
            onClick={() => {
              setMode("edit");
            }}
          >
            Send to edit
          </Button>
          <Button
            tone="danger"
            disabled={!selected}
            onClick={() => selected && void after(() => api.deleteVersion(selected.id))}
          >
            Delete
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {versions.length === 0 ? (
          <p className="text-sm text-mist">No versions in this filter yet. Generate, pixelize, or paint one.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {versions.map((version) => {
              const active = version.id === selectedId;
              const compared = version.id === compareId;
              return (
                <button
                  key={version.id}
                  className={`overflow-hidden rounded-lg border text-left ${active ? "border-accent" : compared ? "border-accent2" : "border-line"}`}
                  onClick={(event) => selectVersion(version.id, event.shiftKey)}
                  onDoubleClick={() => setLightbox(version.url)}
                >
                  <div className="checker flex aspect-square items-center justify-center">
                    <img src={version.url} alt={versionLabel(version)} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="space-y-0.5 px-2 py-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{versionLabel(version)}</span>
                      {version.is_primary ? <span className="text-accent">Primary</span> : null}
                    </div>
                    <div className="text-mist">
                      {version.is_approved ? "Approved · " : ""}
                      {formatWhen(version.created_at)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
