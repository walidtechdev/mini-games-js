import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { run, useStudio } from "./store";
import { AnimationsView } from "./views/AnimationsView";
import { AssetView } from "./views/AssetView";
import { CategoryView } from "./views/CategoryView";
import { JobsView } from "./views/JobsView";
import { ProjectsView } from "./views/ProjectsView";
import { SettingsView } from "./views/SettingsView";
import { StylesView } from "./views/StylesView";
import { WorkflowsView } from "./views/WorkflowsView";

export function App() {
  const boot = useStudio((state) => state.boot);
  const booted = useStudio((state) => state.booted);

  useEffect(() => {
    void run(boot);
  }, [boot]);

  if (!booted) {
    return <div className="grid h-screen place-items-center bg-ink text-mist">Opening PixelForge Studio…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<ProjectsView />} />
          <Route path="/p/:projectId" element={<ProjectsView />} />
          <Route path="/p/:projectId/c/:categorySlug" element={<CategoryView />} />
          <Route path="/p/:projectId/asset/:assetId" element={<AssetView />} />
          <Route path="/animations" element={<AnimationsView />} />
          <Route path="/styles" element={<StylesView />} />
          <Route path="/workflows" element={<WorkflowsView />} />
          <Route path="/jobs" element={<JobsView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
