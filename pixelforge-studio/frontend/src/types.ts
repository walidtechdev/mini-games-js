export type WorkspaceMode =
  | "gallery"
  | "generate"
  | "edit"
  | "pixelize"
  | "directions"
  | "animation"
  | "spritesheet"
  | "editor";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type InputField = {
  key: string;
  label: string;
  type: "string" | "number" | "select" | "image" | "boolean";
  required?: boolean;
  default?: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  show_when?: Record<string, string>;
};

export type WorkflowInfo = {
  id: string;
  name: string;
  description: string;
  inputs: InputField[];
  workflow_file: string;
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  asset_type: string;
  sort_order: number;
  created_at: string;
};

export type ProjectDetail = Project & { categories: Category[] };

export type AssetSummary = {
  id: string;
  project_id: string;
  category_id: string;
  name: string;
  slug: string;
  asset_type: string;
  description: string;
  style_id: string | null;
  primary_version_id: string | null;
  thumb_url: string;
  version_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Version = {
  id: string;
  asset_id: string;
  parent_version_id: string | null;
  kind: string;
  number: number;
  prompt: string;
  negative_prompt: string;
  seed: number | null;
  workflow_id: string;
  parameters: Record<string, unknown>;
  model: string;
  lora: string;
  file_path: string;
  width: number;
  height: number;
  direction: string;
  animation_name: string;
  frame_index: number | null;
  duration_ms: number;
  is_primary: boolean;
  is_approved: boolean;
  has_sheet_json: boolean;
  created_at: string;
  url: string;
  asset_name?: string;
  sheet?: SheetDocument;
  json_url?: string;
};

export type SheetFrame = {
  frame: number;
  x: number;
  y: number;
  width: number;
  height: number;
  duration: number;
  animation: string;
  direction: string;
};

export type SheetDocument = {
  frames: SheetFrame[];
  meta: Record<string, number | string>;
};

export type ReferenceImage = {
  id: string;
  asset_id: string;
  label: string;
  file_path: string;
  width: number;
  height: number;
  created_at: string;
  url: string;
};

export type AssetDetail = AssetSummary & {
  project_name: string;
  project_slug: string;
  category_name: string;
  category_slug: string;
  versions: Version[];
  references: ReferenceImage[];
};

export type Style = {
  id: string;
  name: string;
  prompt_prefix: string;
  negative_prompt: string;
  model: string;
  lora: string;
  lora_strength: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  preferred_workflow: string;
  params: Record<string, unknown>;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
};

export type Job = {
  id: string;
  asset_id: string | null;
  project_id: string | null;
  asset_name: string;
  workflow_id: string;
  status: JobStatus;
  progress: number;
  message: string;
  prompt_id: string;
  error: string;
  raw_log: string;
  batch_id: string;
  label: string;
  created_at: string;
  updated_at: string;
};

export type Settings = {
  comfyui_url: string;
  storage_dir: string;
  default_workflow: string;
  default_model: string;
  default_lora: string;
  default_width: number;
  default_height: number;
  default_steps: number;
  default_cfg: number;
  default_project_id: string;
  comfy_client_id: string;
};

export type GpuDevice = {
  name?: string;
  type?: string;
  vram_total?: number;
  vram_free?: number;
};

export type GpuInfo = {
  comfyui_version?: string;
  pytorch?: string;
  devices: GpuDevice[];
};

export type DevLog = {
  id: number;
  level: string;
  message: string;
  detail: string;
  created_at: string;
};

export type Toast = {
  id: string;
  message: string;
  tone: "info" | "error";
};

export const REFERENCE_LABELS = ["concept", "face", "weapon", "armor", "color", "other"] as const;
export const ANIMATIONS = ["idle", "walk", "run", "attack", "hurt", "death"] as const;
export const DIRECTIONS_4 = ["front", "back", "left", "right"] as const;
export const DIRECTIONS_8 = [
  "front",
  "back",
  "left",
  "right",
  "front-left",
  "front-right",
  "back-left",
  "back-right",
] as const;
