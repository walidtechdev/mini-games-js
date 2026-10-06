import { Link } from "react-router-dom";
import { api } from "../api";
import { run, useStudio } from "../store";
import { Button } from "./ui";

export function JobStrip() {
  const jobs = useStudio((state) => state.jobs);
  const devOpen = useStudio((state) => state.devOpen);
  const setDevOpen = useStudio((state) => state.setDevOpen);
  const active = jobs.filter((job) => job.status === "queued" || job.status === "running");
  const latest = active[0] ?? jobs[0];

  return (
    <footer className="flex h-11 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-xs">
      <Link to="/jobs" className="text-mist hover:text-white">
        Jobs
      </Link>
      {latest ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 uppercase tracking-wide ${
              latest.status === "failed"
                ? "bg-red-500/20 text-red-200"
                : latest.status === "running"
                  ? "bg-accent/20 text-accent"
                  : "bg-raised text-mist"
            }`}
          >
            {latest.status}
          </span>
          <span className="truncate">
            {latest.label || latest.workflow_id}
            {latest.asset_name ? ` · ${latest.asset_name}` : ""} · {latest.message}
            {latest.status === "failed" && latest.error ? ` — ${latest.error}` : ""}
          </span>
          {(latest.status === "running" || latest.status === "queued") && (
            <div className="h-1.5 w-24 overflow-hidden rounded bg-ink">
              <div className="h-full bg-accent" style={{ width: `${Math.max(4, latest.progress)}%` }} />
            </div>
          )}
          {(latest.status === "running" || latest.status === "queued") && (
            <Button
              tone="ghost"
              className="px-2 py-0.5 text-xs"
              onClick={() => void run(() => api.cancelJob(latest.id).then(() => undefined))}
            >
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <span className="flex-1 text-mist">No jobs yet</span>
      )}
      <span className="text-mist">{active.length} active</span>
      <button className="text-mist hover:text-white" onClick={() => setDevOpen(!devOpen)}>
        Developer
      </button>
    </footer>
  );
}
