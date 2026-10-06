import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { versionLabel } from "../lib/format";
import { run, useStudio } from "../store";
import type { Version } from "../types";

export function AnimationsView() {
  const project = useStudio((state) => state.project);
  const setMode = useStudio((state) => state.setMode);
  const [frames, setFrames] = useState<Version[]>([]);

  useEffect(() => {
    if (!project) return;
    void run(async () => {
      setFrames(await api.animations(project.id));
    });
  }, [project]);

  const groups = new Map<string, Version[]>();
  for (const frame of frames) {
    const key = `${frame.asset_id}:${frame.animation_name}:${frame.direction}`;
    groups.set(key, [...(groups.get(key) ?? []), frame]);
  }

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="text-2xl font-semibold">Animations</h1>
      <p className="mt-1 text-sm text-mist">
        {project ? `${project.name} · idle, walk, run, attack, hurt, death` : "Open a project to see its animation frames."}
      </p>
      {project && groups.size === 0 ? <p className="mt-4 text-sm text-mist">No animation frames yet. Open an asset and use the Animation workspace.</p> : null}
      <div className="mt-4 space-y-4">
        {[...groups.entries()].map(([key, items]) => {
          const first = items[0];
          if (!first) return null;
          return (
            <section key={key}>
              <Link className="text-sm text-accent2" to={`/p/${project?.id}/asset/${first.asset_id}`} onClick={() => setMode("animation")}>
                {first.asset_name} · {first.animation_name} · {first.direction}
              </Link>
              <div className="mt-2 flex gap-2 overflow-auto">
                {items.map((frame) => (
                  <div key={frame.id} className="w-16 shrink-0">
                    <div className="checker aspect-square">
                      <img src={frame.url} alt={versionLabel(frame)} className="h-full w-full object-contain" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
