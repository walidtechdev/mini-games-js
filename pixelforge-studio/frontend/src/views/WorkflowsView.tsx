import { useStudio } from "../store";

export function WorkflowsView() {
  const workflows = useStudio((state) => state.workflows);
  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="text-2xl font-semibold">Workflows</h1>
      <p className="mt-1 max-w-2xl text-sm text-mist">
        Each folder under workflows/ is an adapter. The form is built from its inputs schema, so a new workflow does not need a frontend change. Swap the workflow.json to match your ComfyUI install.
      </p>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {workflows.map((workflow) => (
          <article key={workflow.id} className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-lg">{workflow.name}</h2>
            <p className="mt-1 text-sm text-mist">{workflow.description}</p>
            <p className="mt-2 text-[11px] text-accent2">{workflow.workflow_file}</p>
            <ul className="mt-3 space-y-1 text-xs text-mist">
              {workflow.inputs.map((field) => (
                <li key={field.key}>
                  {field.label} · {field.type}
                  {field.required ? " · required" : ""}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
