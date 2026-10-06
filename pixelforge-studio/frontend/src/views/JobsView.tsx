import { api } from "../api";
import { formatWhen } from "../lib/format";
import { run, useStudio } from "../store";
import { Button } from "../components/ui";

export function JobsView() {
  const jobs = useStudio((state) => state.jobs);
  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="text-2xl font-semibold">Jobs</h1>
      <p className="mt-1 text-sm text-mist">Queued work stays visible from every screen. Cancel interrupts the active ComfyUI prompt.</p>
      <div className="mt-4 space-y-2">
        {jobs.length === 0 ? <p className="text-sm text-mist">No jobs yet.</p> : null}
        {jobs.map((job) => (
          <article key={job.id} className="rounded-lg border border-line bg-panel px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-raised px-1.5 py-0.5 text-[11px] uppercase text-mist">{job.status}</span>
              <span className="font-medium">{job.label || job.workflow_id}</span>
              <span className="text-mist">{job.asset_name}</span>
              <span className="ml-auto text-xs text-mist">{formatWhen(job.created_at)}</span>
            </div>
            <div className="mt-1 text-xs text-mist">
              {job.message}
              {job.error ? ` — ${job.error}` : ""}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-ink">
              <div className="h-full bg-accent" style={{ width: `${Math.max(job.status === "completed" ? 100 : 0, job.progress)}%` }} />
            </div>
            {(job.status === "queued" || job.status === "running") && (
              <Button className="mt-2" tone="danger" onClick={() => void run(() => api.cancelJob(job.id).then(() => undefined))}>
                Cancel
              </Button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
