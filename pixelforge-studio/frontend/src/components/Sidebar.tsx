import { NavLink } from "react-router-dom";
import { useStudio } from "../store";

const STATIC_CATEGORIES = [
  ["characters", "Characters"],
  ["enemies", "Enemies"],
  ["npcs", "NPCs"],
  ["objects", "Objects"],
  ["environments", "Environments"],
  ["tilesets", "Tilesets"],
  ["ui", "UI"],
] as const;

const LIBRARY = [
  ["/animations", "Animations"],
  ["/styles", "Styles"],
  ["/workflows", "Workflows"],
  ["/jobs", "Jobs"],
  ["/settings", "Settings"],
] as const;

function itemClass(active: boolean): string {
  return `block rounded-md px-3 py-1.5 text-sm ${active ? "bg-raised text-white" : "text-mist hover:bg-raised/70 hover:text-white"}`;
}

export function Sidebar() {
  const project = useStudio((state) => state.project);
  const jobs = useStudio((state) => state.jobs);
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const categories = project?.categories ?? STATIC_CATEGORIES.map(([slug, name]) => ({ slug, name, id: slug }));

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">
      <div className="border-b border-line px-4 py-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-accent">PixelForge</div>
        <div className="text-lg font-semibold">Studio</div>
        <div className="mt-1 truncate text-xs text-mist">{project ? project.name : "No project open"}</div>
      </div>
      <nav className="flex-1 space-y-4 overflow-auto px-2 py-3">
        <div>
          <NavLink to="/" className={({ isActive }) => itemClass(isActive)} end>
            Projects
          </NavLink>
        </div>
        <div className="space-y-0.5">
          <div className="px-3 pb-1 text-[11px] uppercase tracking-wider text-mist/70">Library</div>
          {categories.map((category) => {
            const href = project ? `/p/${project.id}/c/${category.slug}` : "/";
            return (
              <NavLink key={category.id} to={href} className={({ isActive }) => itemClass(isActive)}>
                {category.name}
              </NavLink>
            );
          })}
        </div>
        <div className="space-y-0.5">
          {LIBRARY.map(([href, label]) => (
            <NavLink key={href} to={href} className={({ isActive }) => itemClass(isActive)}>
              <span className="flex items-center justify-between">
                {label}
                {label === "Jobs" && activeJobs > 0 ? (
                  <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-ink">{activeJobs}</span>
                ) : null}
              </span>
            </NavLink>
          ))}
        </div>
      </nav>
    </aside>
  );
}
