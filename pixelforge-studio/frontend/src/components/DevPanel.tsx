import { useEffect } from "react";
import { run, useStudio } from "../store";
import { formatWhen } from "../lib/format";

export function DevPanel() {
  const open = useStudio((state) => state.devOpen);
  const logs = useStudio((state) => state.logs);
  const jobs = useStudio((state) => state.jobs);
  const refreshLogs = useStudio((state) => state.refreshLogs);
  const setDevOpen = useStudio((state) => state.setDevOpen);

  useEffect(() => {
    if (open) void run(refreshLogs);
  }, [open, refreshLogs]);

  if (!open) return null;
  const rawJobs = jobs.filter((job) => job.raw_log || job.error);

  return (
    <section className="max-h-64 shrink-0 overflow-auto border-t border-line bg-[#0e1118] px-4 py-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium text-mist">Developer log</h2>
        <button className="text-mist hover:text-white" onClick={() => setDevOpen(false)}>
          Close
        </button>
      </div>
      <div className="space-y-2">
        {logs.length === 0 ? <p className="text-mist">No log entries yet.</p> : null}
        {logs.map((entry) => (
          <article key={entry.id} className="rounded border border-line/80 bg-panel px-2 py-1.5">
            <div className="flex gap-2 text-mist">
              <span className={entry.level === "error" ? "text-red-300" : "text-accent2"}>{entry.level}</span>
              <span>{formatWhen(entry.created_at)}</span>
            </div>
            <p>{entry.message}</p>
            {entry.detail ? <pre className="mt-1 whitespace-pre-wrap text-[11px] text-mist">{entry.detail}</pre> : null}
          </article>
        ))}
        {rawJobs.map((job) => (
          <article key={job.id} className="rounded border border-line/80 bg-panel px-2 py-1.5">
            <div className="text-mist">
              Job {job.label || job.id} · {job.status}
            </div>
            {job.error ? <p>{job.error}</p> : null}
            {job.raw_log ? <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-mist">{job.raw_log}</pre> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
