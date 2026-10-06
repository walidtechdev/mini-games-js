import { create } from "zustand";
import { ApiError, api } from "./api";
import type {
  AssetDetail,
  AssetSummary,
  DevLog,
  GpuInfo,
  Job,
  Project,
  ProjectDetail,
  Settings,
  Style,
  Toast,
  WorkflowInfo,
  WorkspaceMode,
} from "./types";

const PROJECT_KEY = "pixelforge.project";

type StudioState = {
  booted: boolean;
  projects: Project[];
  project: ProjectDetail | null;
  assets: AssetSummary[];
  asset: AssetDetail | null;
  styles: Style[];
  workflows: WorkflowInfo[];
  jobs: Job[];
  logs: DevLog[];
  settings: Settings | null;
  mode: WorkspaceMode;
  selectedVersionId: string | null;
  compareVersionId: string | null;
  lightboxUrl: string | null;
  toasts: Toast[];
  devOpen: boolean;
  helpOpen: boolean;
  compareOpen: boolean;
  comfyStatus: "unknown" | "Connected" | "Offline";
  gpu: GpuInfo | null;
  boot: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  refreshAssets: () => Promise<void>;
  openAsset: (id: string) => Promise<void>;
  refreshAsset: () => Promise<void>;
  setMode: (mode: WorkspaceMode) => void;
  selectVersion: (id: string | null, compare?: boolean) => void;
  pushToast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  setDevOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setCompareOpen: (open: boolean) => void;
  setLightbox: (url: string | null) => void;
  refreshJobs: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  applyJobs: (jobs: Job[], announce: boolean) => void;
  setComfy: (status: "Connected" | "Offline", gpu: GpuInfo | null) => void;
  setSettings: (settings: Settings) => void;
  setStyles: (styles: Style[]) => void;
  setProjects: (projects: Project[]) => void;
};

let socket: WebSocket | null = null;
let pollTimer = 0;
const seen = new Set<string>();

function remember(jobs: Job[]): void {
  for (const job of jobs) {
    if (job.status === "queued" || job.status === "running") continue;
    seen.add(`${job.id}:${job.status}`);
  }
}

export const useStudio = create<StudioState>((set, get) => ({
  booted: false,
  projects: [],
  project: null,
  assets: [],
  asset: null,
  styles: [],
  workflows: [],
  jobs: [],
  logs: [],
  settings: null,
  mode: "gallery",
  selectedVersionId: null,
  compareVersionId: null,
  lightboxUrl: null,
  toasts: [],
  devOpen: false,
  helpOpen: false,
  compareOpen: false,
  comfyStatus: "unknown",
  gpu: null,

  pushToast: (message, tone = "info") => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    window.setTimeout(() => get().dismissToast(id), 4500);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  setDevOpen: (devOpen) => set({ devOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  setLightbox: (lightboxUrl) => set({ lightboxUrl }),
  setMode: (mode) => set({ mode }),
  setComfy: (comfyStatus, gpu) => set({ comfyStatus, gpu }),
  setSettings: (settings) => set({ settings }),
  setStyles: (styles) => set({ styles }),
  setProjects: (projects) => set({ projects }),
  selectVersion: (id, compare = false) => {
    if (compare && id) {
      set({ compareVersionId: id });
      return;
    }
    set({ selectedVersionId: id });
  },

  applyJobs: (jobs, announce) => {
    const previousAsset = get().asset;
    let shouldRefresh = false;
    for (const job of jobs) {
      if (job.status === "queued" || job.status === "running") continue;
      const key = `${job.id}:${job.status}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!announce) continue;
      if (job.status === "failed" && job.error) get().pushToast(job.error, "error");
      if (job.status === "completed" && previousAsset && job.asset_id === previousAsset.id) shouldRefresh = true;
    }
    set({ jobs });
    if (shouldRefresh) void get().refreshAsset();
  },

  refreshJobs: async () => {
    const jobs = await api.jobs();
    get().applyJobs(jobs, true);
  },
  refreshLogs: async () => {
    const logs = await api.logs();
    set({ logs });
  },

  boot: async () => {
    try {
      const [projects, styles, workflows, settings, jobs, logs] = await Promise.all([
        api.projects(),
        api.styles(),
        api.workflows(),
        api.settings(),
        api.jobs(),
        api.logs(),
      ]);
      remember(jobs);
      set({ projects, styles, workflows, settings, jobs, logs });
      connectSocket();
      const stored = localStorage.getItem(PROJECT_KEY) || settings.default_project_id;
      if (stored && projects.some((project) => project.id === stored)) {
        await get().openProject(stored);
      }
    } finally {
      set({ booted: true });
    }
  },

  openProject: async (id) => {
    const project = await api.project(id);
    const assets = await api.assets(id);
    localStorage.setItem(PROJECT_KEY, id);
    set({ project, assets });
  },

  refreshAssets: async () => {
    const project = get().project;
    if (!project) return;
    const assets = await api.assets(project.id);
    set({ assets });
  },

  openAsset: async (id) => {
    const asset = await api.asset(id);
    const selected = get().selectedVersionId;
    const stillThere = selected && asset.versions.some((version) => version.id === selected);
    set({
      asset,
      selectedVersionId: stillThere ? selected : asset.primary_version_id || asset.versions[0]?.id || null,
    });
  },

  refreshAsset: async () => {
    const asset = get().asset;
    if (!asset) return;
    await get().openAsset(asset.id);
    await get().refreshAssets();
  },
}));

function connectSocket(): void {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
  socket.onmessage = (event) => {
    const payload = JSON.parse(String(event.data)) as { type?: string; jobs?: Job[] };
    if (payload.type === "jobs" && payload.jobs) useStudio.getState().applyJobs(payload.jobs, true);
  };
  socket.onclose = () => {
    socket = null;
    window.setTimeout(connectSocket, 2000);
  };
  if (!pollTimer) {
    pollTimer = window.setInterval(() => {
      void useStudio
        .getState()
        .refreshJobs()
        .catch(() => undefined);
    }, 4000);
  }
}

export async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Something went wrong.";
    useStudio.getState().pushToast(message, "error");
  }
}
