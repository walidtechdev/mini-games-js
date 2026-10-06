import type { Version } from "../types";
import { DIRECTIONS_8 } from "../types";

export function versionLabel(version: Version): string {
  const number = `#${String(version.number).padStart(3, "0")}`;
  if (version.kind === "generation") return `Generation ${number}`;
  if (version.kind === "direction") return `${version.direction || "Direction"} ${number}`;
  if (version.kind === "animation") {
    const frame = version.frame_index == null ? "" : ` f${version.frame_index + 1}`;
    return `${version.animation_name || "Animation"} ${version.direction}${frame} ${number}`.replace(/\s+/g, " ");
  }
  if (version.kind === "spritesheet") return `Spritesheet ${number}`;
  const kind = version.kind.replaceAll("_", " ");
  return `${kind} ${number}`;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function latestFrames(versions: Version[], animation: string, direction: string): Version[] {
  const matches = versions.filter(
    (version) => version.kind === "animation" && version.animation_name === animation && version.direction === direction,
  );
  const byIndex = new Map<number, Version>();
  for (const version of matches) {
    const index = version.frame_index ?? 0;
    const current = byIndex.get(index);
    if (!current || version.number > current.number) byIndex.set(index, version);
  }
  return [...byIndex.values()].sort((a, b) => (a.frame_index ?? 0) - (b.frame_index ?? 0));
}

export function sheetFrames(versions: Version[], animation: string, directions: readonly string[]): Version[] {
  const order = directions.length ? directions : DIRECTIONS_8;
  return order.flatMap((direction) => latestFrames(versions, animation, direction));
}

export function imageChoices(versions: Version[], references: { id: string; label: string }[]): { value: string; label: string }[] {
  return [
    ...versions
      .filter((version) => version.kind !== "spritesheet")
      .map((version) => ({
        value: `version:${version.id}`,
        label: `${versionLabel(version)} · ${version.width}×${version.height}`,
      })),
    ...references.map((reference) => ({
      value: `reference:${reference.id}`,
      label: `Reference · ${reference.label}`,
    })),
  ];
}
