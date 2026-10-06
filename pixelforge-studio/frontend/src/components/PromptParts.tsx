import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStudio } from "../store";
import { TextArea } from "./ui";

export function usePersistedPrompts() {
  const asset = useStudio((state) => state.asset);
  const project = useStudio((state) => state.project);
  const patchAsset = useStudio((state) => state.patchAsset);
  const patchProject = useStudio((state) => state.patchProject);
  const assetId = asset?.id;
  const projectId = project?.id;
  const [description, setDescription] = useState(asset?.description ?? "");
  const [standard, setStandard] = useState(project?.standard_prompt ?? "");
  const descriptionRef = useRef(description);
  const standardRef = useRef(standard);
  descriptionRef.current = description;
  standardRef.current = standard;

  useEffect(() => {
    setDescription(useStudio.getState().asset?.description ?? "");
  }, [assetId]);

  useEffect(() => {
    setStandard(useStudio.getState().project?.standard_prompt ?? "");
  }, [projectId]);

  async function flush(): Promise<void> {
    const currentAsset = useStudio.getState().asset;
    const currentProject = useStudio.getState().project;
    if (currentAsset && currentAsset.id === assetId && currentAsset.description !== descriptionRef.current) {
      await api.updateAsset(currentAsset.id, { description: descriptionRef.current });
      patchAsset({ description: descriptionRef.current });
    }
    if (currentProject && currentProject.id === projectId && (currentProject.standard_prompt ?? "") !== standardRef.current) {
      const updated = await api.updateProject(currentProject.id, { standard_prompt: standardRef.current });
      patchProject(updated);
    }
  }

  useEffect(() => {
    return () => {
      const current = useStudio.getState().asset;
      const text = descriptionRef.current;
      if (!assetId || !current || current.id !== assetId || current.description === text) return;
      void api.updateAsset(assetId, { description: text }).then(() => patchAsset({ description: text }));
    };
  }, [assetId, patchAsset]);

  useEffect(() => {
    return () => {
      const current = useStudio.getState().project;
      const text = standardRef.current;
      if (!projectId || !current || current.id !== projectId || (current.standard_prompt ?? "") === text) return;
      void api.updateProject(projectId, { standard_prompt: text }).then((updated) => patchProject(updated));
    };
  }, [projectId, patchProject]);

  useEffect(() => {
    const id = assetId;
    const text = description;
    const timer = window.setTimeout(() => {
      const current = useStudio.getState().asset;
      if (!id || !current || current.id !== id || current.description === text) return;
      void api.updateAsset(id, { description: text }).then(() => patchAsset({ description: text }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [description, assetId, patchAsset]);

  useEffect(() => {
    const id = projectId;
    const text = standard;
    const timer = window.setTimeout(() => {
      const current = useStudio.getState().project;
      if (!id || !current || current.id !== id || (current.standard_prompt ?? "") === text) return;
      void api.updateProject(id, { standard_prompt: text }).then((updated) => patchProject(updated));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [standard, projectId, patchProject]);

  return { description, setDescription, standard, setStandard, flush };
}

export function PromptParts({
  styleId,
  description,
  standard,
  onDescription,
  onStandard,
}: {
  styleId: string | null;
  description: string;
  standard: string;
  onDescription: (value: string) => void;
  onStandard: (value: string) => void;
}) {
  const styles = useStudio((state) => state.styles);
  const style = styles.find((item) => item.id === styleId);
  return (
    <div className="grid gap-3">
      <label className="block text-xs text-mist">
        Style prefix
        <TextArea className="mt-1" rows={2} readOnly value={style?.prompt_prefix || "No style selected"} />
      </label>
      <label className="block text-xs text-mist">
        Project standard prompt
        <TextArea className="mt-1" rows={3} value={standard} onChange={(event) => onStandard(event.target.value)} />
        <span className="mt-1 block text-[11px]">Same for every character in this project.</span>
      </label>
      <label className="block text-xs text-mist">
        Character description
        <TextArea className="mt-1" rows={3} value={description} onChange={(event) => onDescription(event.target.value)} />
        <span className="mt-1 block text-[11px]">Saved on this asset. Generation sends the style prefix, then the standard prompt, then this description.</span>
      </label>
    </div>
  );
}
