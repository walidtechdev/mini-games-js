import type {
  AssetDetail,
  AssetSummary,
  Category,
  DevLog,
  GpuInfo,
  Job,
  Project,
  ProjectDetail,
  ReferenceImage,
  Settings,
  Style,
  Version,
  WorkflowInfo,
} from "./types";

export class ApiError extends Error {}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
  } catch {
    /* response was not JSON */
  }
  return "Something went wrong.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new ApiError(await errorMessage(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),
  workflows: () => request<WorkflowInfo[]>("/api/workflows"),
  projects: () => request<Project[]>("/api/projects"),
  createProject: (name: string, description: string) =>
    request<ProjectDetail>("/api/projects", { method: "POST", body: JSON.stringify({ name, description }) }),
  project: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  createCategory: (projectId: string, name: string, assetType: string) =>
    request<Category>(`/api/projects/${projectId}/categories`, {
      method: "POST",
      body: JSON.stringify({ name, asset_type: assetType }),
    }),
  animations: (projectId: string) => request<Version[]>(`/api/projects/${projectId}/animations`),
  assets: (projectId: string, categoryId?: string) => {
    const query = new URLSearchParams({ project_id: projectId });
    if (categoryId) query.set("category_id", categoryId);
    return request<AssetSummary[]>(`/api/assets?${query.toString()}`);
  },
  createAsset: (body: {
    project_id: string;
    category_id: string;
    name: string;
    description: string;
    style_id?: string | null;
  }) => request<AssetDetail>("/api/assets", { method: "POST", body: JSON.stringify(body) }),
  asset: (id: string) => request<AssetDetail>(`/api/assets/${id}`),
  updateAsset: (id: string, body: { name?: string; description?: string; style_id?: string | null }) =>
    request<AssetDetail>(`/api/assets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAsset: (id: string) => request<{ ok: boolean }>(`/api/assets/${id}`, { method: "DELETE" }),
  uploadReference: (assetId: string, file: File, label: string) => {
    const data = new FormData();
    data.set("file", file);
    data.set("label", label);
    return request<ReferenceImage>(`/api/assets/${assetId}/references`, { method: "POST", body: data });
  },
  deleteReference: (id: string) => request<{ ok: boolean }>(`/api/references/${id}`, { method: "DELETE" }),
  uploadVersion: (
    assetId: string,
    file: Blob,
    fields: {
      kind?: string;
      prompt?: string;
      direction?: string;
      animation_name?: string;
      frame_index?: number | null;
      duration_ms?: number;
      parent_version_id?: string;
    },
  ) => {
    const data = new FormData();
    data.set("file", file, "frame.png");
    data.set("kind", fields.kind ?? "edit");
    data.set("prompt", fields.prompt ?? "");
    data.set("direction", fields.direction ?? "");
    data.set("animation_name", fields.animation_name ?? "");
    data.set("duration_ms", String(fields.duration_ms ?? 100));
    if (fields.frame_index != null) data.set("frame_index", String(fields.frame_index));
    if (fields.parent_version_id) data.set("parent_version_id", fields.parent_version_id);
    return request<Version>(`/api/assets/${assetId}/versions/upload`, { method: "POST", body: data });
  },
  blankFrames: (assetId: string, body: Record<string, unknown>) =>
    request<Version[]>(`/api/assets/${assetId}/frames`, { method: "POST", body: JSON.stringify(body) }),
  reorderFrames: (assetId: string, body: { animation: string; direction: string; version_ids: string[] }) =>
    request<Version[]>(`/api/assets/${assetId}/animations/reorder`, { method: "POST", body: JSON.stringify(body) }),
  spritesheet: (assetId: string, body: Record<string, unknown>) =>
    request<Version>(`/api/assets/${assetId}/spritesheet`, { method: "POST", body: JSON.stringify(body) }),
  sheetJson: (versionId: string) => request<unknown>(`/api/versions/${versionId}/sheet.json`),
  setPrimary: (versionId: string) => request<Version>(`/api/versions/${versionId}/primary`, { method: "POST" }),
  approve: (versionId: string, approved = true) =>
    request<Version>(`/api/versions/${versionId}/approve?approved=${approved ? "true" : "false"}`, { method: "POST" }),
  saveVersion: (versionId: string) => request<Version>(`/api/versions/${versionId}/save`, { method: "POST" }),
  updateVersion: (versionId: string, body: { duration_ms?: number; frame_index?: number }) =>
    request<Version>(`/api/versions/${versionId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteVersion: (versionId: string) => request<{ ok: boolean }>(`/api/versions/${versionId}`, { method: "DELETE" }),
  reproduce: (versionId: string) => request<Job>(`/api/versions/${versionId}/reproduce`, { method: "POST" }),
  generate: (body: { asset_id: string; workflow_id: string; inputs: Record<string, unknown>; style_id?: string | null }) =>
    request<Job>("/api/generate", { method: "POST", body: JSON.stringify(body) }),
  directions: (body: Record<string, unknown>) => request<Job[]>("/api/directions", { method: "POST", body: JSON.stringify(body) }),
  animation: (body: Record<string, unknown>) => request<Job[]>("/api/animation", { method: "POST", body: JSON.stringify(body) }),
  jobs: () => request<Job[]>("/api/jobs"),
  cancelJob: (id: string) => request<Job>(`/api/jobs/${id}/cancel`, { method: "POST" }),
  styles: () => request<Style[]>("/api/styles"),
  createStyle: (body: Partial<Style>) => request<Style>("/api/styles", { method: "POST", body: JSON.stringify(body) }),
  updateStyle: (id: string, body: Partial<Style>) =>
    request<Style>(`/api/styles/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteStyle: (id: string) => request<{ ok: boolean }>(`/api/styles/${id}`, { method: "DELETE" }),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (body: Partial<Settings>) => request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  testComfy: () =>
    request<{ ok: boolean; status: "Connected" | "Offline"; message: string; gpu: GpuInfo | null }>(
      "/api/settings/test-comfy",
      { method: "POST" },
    ),
  logs: () => request<DevLog[]>("/api/logs"),
};
