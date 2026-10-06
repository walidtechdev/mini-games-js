import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { run, useStudio } from "../store";
import { Button, TextArea, TextInput } from "../components/ui";

export function CategoryView() {
  const { projectId, categorySlug } = useParams();
  const project = useStudio((state) => state.project);
  const assets = useStudio((state) => state.assets);
  const styles = useStudio((state) => state.styles);
  const refreshAssets = useStudio((state) => state.refreshAssets);
  const openProject = useStudio((state) => state.openProject);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (projectId && project?.id !== projectId) void run(() => openProject(projectId));
  }, [projectId, project?.id, openProject]);

  const category = project?.categories.find((item) => item.slug === categorySlug);
  const visible = assets.filter((asset) => asset.category_id === category?.id);

  if (!project || project.id !== projectId) return <p className="p-6 text-sm text-mist">Loading project…</p>;
  if (!category) return <p className="p-6 text-sm text-mist">That category is not in this project.</p>;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="text-xs uppercase tracking-wider text-mist">{project.name}</div>
      <h1 className="text-2xl font-semibold">{category.name}</h1>
      <form
        className="mt-4 flex max-w-xl flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const asset = await api.createAsset({
              project_id: project.id,
              category_id: category.id,
              name: name.trim(),
              description: description.trim(),
              style_id: styles[0]?.id ?? null,
            });
            setName("");
            setDescription("");
            await refreshAssets();
            navigate(`/p/${project.id}/asset/${asset.id}`);
          });
        }}
      >
        <TextInput placeholder={`New ${category.name.slice(0, -1) || "asset"} name`} value={name} onChange={(event) => setName(event.target.value)} />
        <TextArea rows={2} placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
        <Button tone="accent" type="submit" disabled={!name.trim()}>
          Create asset
        </Button>
      </form>
      <form
        className="mt-3 flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await api.createCategory(project.id, categoryName.trim(), "object");
            setCategoryName("");
            await openProject(project.id);
          });
        }}
      >
        <TextInput placeholder="New category" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
        <Button type="submit" disabled={!categoryName.trim()}>
          Add category
        </Button>
      </form>
      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {visible.map((asset) => (
          <button key={asset.id} className="overflow-hidden rounded-lg border border-line bg-panel text-left" onClick={() => navigate(`/p/${project.id}/asset/${asset.id}`)}>
            <div className="checker flex aspect-square items-center justify-center">
              {asset.thumb_url ? <img src={asset.thumb_url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-mist">No image</span>}
            </div>
            <div className="px-2 py-2">
              <div className="truncate text-sm">{asset.name}</div>
              <div className="text-[11px] text-mist">{asset.version_count} versions</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
