import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { run, useStudio } from "../store";
import { Button, TextArea, TextInput } from "../components/ui";

export function ProjectsView() {
  const projects = useStudio((state) => state.projects);
  const settings = useStudio((state) => state.settings);
  const setProjects = useStudio((state) => state.setProjects);
  const setSettings = useStudio((state) => state.setSettings);
  const [name, setName] = useState("My RPG");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="mt-1 max-w-xl text-sm text-mist">A project holds categories, assets, and every version you generate. Start with My RPG or name your own.</p>
      <form
        className="mt-4 flex max-w-xl flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const project = await api.createProject(name.trim(), description.trim());
            setProjects([project, ...useStudio.getState().projects.filter((item) => item.id !== project.id)]);
            navigate(`/p/${project.id}/c/characters`);
          });
        }}
      >
        <TextInput value={name} onChange={(event) => setName(event.target.value)} aria-label="Project name" />
        <TextArea rows={2} placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
        <Button tone="accent" type="submit" disabled={!name.trim()}>
          Create project
        </Button>
      </form>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <article key={project.id} className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-lg">{project.name}</h2>
            <p className="mt-1 min-h-10 text-sm text-mist">{project.description || "No description"}</p>
            <div className="mt-3 flex gap-2">
              <Button tone="accent" onClick={() => navigate(`/p/${project.id}/c/characters`)}>
                Open
              </Button>
              <Button
                onClick={() =>
                  void run(async () => {
                    if (!settings) return;
                    const saved = await api.saveSettings({ ...settings, default_project_id: project.id });
                    setSettings(saved);
                  })
                }
              >
                Set default
              </Button>
              <Button
                tone="danger"
                onClick={() =>
                  void run(async () => {
                    await api.deleteProject(project.id);
                    setProjects(useStudio.getState().projects.filter((item) => item.id !== project.id));
                  })
                }
              >
                Delete
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
