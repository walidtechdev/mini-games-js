import { useEffect } from "react";
import { Outlet, useMatch } from "react-router-dom";
import { run, useStudio } from "../store";
import type { WorkspaceMode } from "../types";
import { DevPanel } from "./DevPanel";
import { Inspector } from "./Inspector";
import { JobStrip } from "./JobStrip";
import { Overlays } from "./Overlays";
import { Sidebar } from "./Sidebar";

const MODES: WorkspaceMode[] = ["gallery", "generate", "edit", "pixelize", "directions", "animation", "spritesheet", "editor"];

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function Shell() {
  const setMode = useStudio((state) => state.setMode);
  const setHelpOpen = useStudio((state) => state.setHelpOpen);
  const helpOpen = useStudio((state) => state.helpOpen);
  const setLightbox = useStudio((state) => state.setLightbox);
  const setCompareOpen = useStudio((state) => state.setCompareOpen);
  const mode = useStudio((state) => state.mode);
  const assetMatch = useMatch("/p/:projectId/asset/:assetId");
  const projectMatch = useMatch("/p/:projectId/*");
  const projectOnly = useMatch("/p/:projectId");
  const openProject = useStudio((state) => state.openProject);
  const project = useStudio((state) => state.project);
  const projectId = assetMatch?.params.projectId || projectMatch?.params.projectId || projectOnly?.params.projectId;

  useEffect(() => {
    if (projectId && project?.id !== projectId) void run(() => openProject(projectId));
  }, [projectId, project?.id, openProject]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHelpOpen(false);
        setLightbox(null);
        setCompareOpen(false);
        return;
      }
      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        if (typingTarget(event.target)) return;
        event.preventDefault();
        setHelpOpen(!helpOpen);
        return;
      }
      if (typingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!event.ctrlKey && !event.metaKey && !event.altKey && key >= "1" && key <= "8" && assetMatch) {
        const next = MODES[Number(key) - 1];
        if (next) setMode(next);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "enter") {
        event.preventDefault();
        document.getElementById("pixelforge-generate")?.click();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("pixelforge-editor", { detail: "save" }));
        return;
      }
      if (mode === "editor" && !event.ctrlKey && !event.metaKey) {
        const tool = { b: "pencil", e: "eraser", g: "fill", i: "picker", r: "rect", v: "select", m: "move" }[key];
        if (tool && !event.shiftKey) {
          window.dispatchEvent(new CustomEvent("pixelforge-editor", { detail: tool }));
          return;
        }
        if (key === "h") window.dispatchEvent(new CustomEvent("pixelforge-editor", { detail: "mirror" }));
        if (key === "[" ) window.dispatchEvent(new CustomEvent("pixelforge-editor", { detail: "zoom-out" }));
        if (key === "]") window.dispatchEvent(new CustomEvent("pixelforge-editor", { detail: "zoom-in" }));
        if (event.shiftKey && key === "r") window.dispatchEvent(new CustomEvent("pixelforge-editor", { detail: "replace" }));
      }
      if ((event.ctrlKey || event.metaKey) && key === "z" && mode === "editor") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("pixelforge-editor", { detail: event.shiftKey ? "redo" : "undo" }));
      }
      if ((event.ctrlKey || event.metaKey) && key === "y" && mode === "editor") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("pixelforge-editor", { detail: "redo" }));
      }
      if (key === " " && mode === "animation") {
        event.preventDefault();
        window.dispatchEvent(new Event("pixelforge-play"));
      }
      if ((key === "arrowleft" || key === "arrowright") && (mode === "animation" || mode === "editor")) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("pixelforge-frame", { detail: key === "arrowright" ? 1 : -1 }));
      }
      if ((key === "delete" || key === "backspace") && mode === "animation") {
        window.dispatchEvent(new Event("pixelforge-delete-frame"));
      }
      if ((key === "delete" || key === "backspace") && mode === "editor") {
        window.dispatchEvent(new CustomEvent("pixelforge-editor", { detail: "clear-selection" }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assetMatch, helpOpen, mode, setCompareOpen, setHelpOpen, setLightbox, setMode]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink text-slate-100">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
        <Inspector />
      </div>
      <DevPanel />
      <JobStrip />
      <Overlays />
    </div>
  );
}
