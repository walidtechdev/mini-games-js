import { useEffect, useState } from "react";
import { api } from "../api";
import { latestFrames } from "../lib/format";
import { run, useStudio } from "../store";
import { ANIMATIONS, DIRECTIONS_4, DIRECTIONS_8 } from "../types";
import { Button, SelectInput, TextInput } from "./ui";

export function AnimationPanel() {
  const asset = useStudio((state) => state.asset);
  const refreshAsset = useStudio((state) => state.refreshAsset);
  const selectedId = useStudio((state) => state.selectedVersionId);
  const selectVersion = useStudio((state) => state.selectVersion);
  const [animation, setAnimation] = useState<(typeof ANIMATIONS)[number]>("walk");
  const [eight, setEight] = useState(false);
  const [chosen, setChosen] = useState<string[]>(["front"]);
  const [facing, setFacing] = useState("front");
  const [frameCount, setFrameCount] = useState(6);
  const [prompt, setPrompt] = useState("pixel art sprite, consistent character");
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [onion, setOnion] = useState(true);

  const frames = asset ? latestFrames(asset.versions, animation, facing) : [];
  const frame = frames[cursor] ?? null;
  const previous = cursor > 0 ? frames[cursor - 1] : null;

  useEffect(() => {
    setCursor(0);
  }, [animation, facing, asset?.id]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const delay = frames[cursor]?.duration_ms || 120;
    const timer = window.setTimeout(() => {
      setCursor((current) => {
        const next = current + 1;
        if (next >= frames.length) {
          if (!loop) setPlaying(false);
          return loop ? 0 : current;
        }
        return next;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, cursor, frames, loop]);

  useEffect(() => {
    const onPlay = () => setPlaying((value) => !value);
    const onFrame = (event: Event) => {
      const delta = (event as CustomEvent<number>).detail;
      setCursor((current) => Math.min(frames.length - 1, Math.max(0, current + delta)));
    };
    const onDelete = () => {
      if (frame) void remove(frame.id);
    };
    window.addEventListener("pixelforge-play", onPlay);
    window.addEventListener("pixelforge-frame", onFrame);
    window.addEventListener("pixelforge-delete-frame", onDelete);
    return () => {
      window.removeEventListener("pixelforge-play", onPlay);
      window.removeEventListener("pixelforge-frame", onFrame);
      window.removeEventListener("pixelforge-delete-frame", onDelete);
    };
  });

  if (!asset) return null;
  const master = asset.versions.find((version) => version.id === (selectedId || asset.primary_version_id));
  const options = eight ? DIRECTIONS_8 : DIRECTIONS_4;

  function toggleDirection(direction: string): void {
    setChosen((current) => (current.includes(direction) ? current.filter((item) => item !== direction) : [...current, direction]));
  }

  async function remove(versionId: string): Promise<void> {
    await run(async () => {
      await api.deleteVersion(versionId);
      await refreshAsset();
    });
  }

  async function move(index: number, delta: number): Promise<void> {
    const next = frames.slice();
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    await run(async () => {
      await api.reorderFrames(asset!.id, { animation, direction: facing, version_ids: next.map((version) => version.id) });
      await refreshAsset();
    });
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-5">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-mist">
          Animation
          <SelectInput className="mt-1" value={animation} onChange={(event) => setAnimation(event.target.value as typeof animation)}>
            {ANIMATIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectInput>
        </label>
        <label className="text-xs text-mist">
          Frames
          <TextInput className="mt-1 w-20" type="number" min={1} max={24} value={frameCount} onChange={(event) => setFrameCount(Number(event.target.value))} />
        </label>
        <Button onClick={() => setEight((value) => !value)}>{eight ? "8 directions" : "4 directions"}</Button>
        <Button
          onClick={() =>
            void run(async () => {
              await api.blankFrames(asset.id, { animation, direction: facing, count: frameCount, width: 32, height: 32 });
              await refreshAsset();
            })
          }
        >
          Blank frames
        </Button>
        <Button
          id="pixelforge-generate"
          tone="accent"
          disabled={!master || chosen.length === 0}
          onClick={() =>
            void run(async () => {
              await api.animation({
                asset_id: asset.id,
                animation,
                directions: chosen,
                frame_count: frameCount,
                style_id: asset.style_id,
                inputs: {
                  image: `version:${master?.id}`,
                  prompt,
                  width: master && master.width > 32 ? master.width : 512,
                  height: master && master.height > 32 ? master.height : 512,
                },
              });
            })
          }
        >
          Generate frames
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {options.map((direction) => (
          <label key={direction} className="flex items-center gap-1 rounded border border-line px-2 py-1">
            <input type="checkbox" checked={chosen.includes(direction)} onChange={() => toggleDirection(direction)} />
            {direction}
          </label>
        ))}
      </div>
      <textarea className="mb-4 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm" rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-mist">Timeline · {facing}</span>
        {options.map((direction) => (
          <button key={direction} className={`rounded px-2 py-0.5 text-xs ${facing === direction ? "bg-accent text-ink" : "bg-raised text-mist"}`} onClick={() => setFacing(direction)}>
            {direction}
          </button>
        ))}
        <Button onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</Button>
        <Button onClick={() => setLoop((value) => !value)}>{loop ? "Loop on" : "Loop off"}</Button>
        <Button onClick={() => setOnion((value) => !value)}>{onion ? "Onion on" : "Onion off"}</Button>
      </div>
      <div className="checker relative mb-4 flex h-64 items-center justify-center rounded-lg border border-line">
        {onion && previous ? <img src={previous.url} alt="" className="absolute max-h-full max-w-full object-contain opacity-35" /> : null}
        {frame ? <img src={frame.url} alt="" className="relative max-h-full max-w-full object-contain" /> : <span className="text-sm text-mist">No frames yet</span>}
      </div>
      <div className="flex gap-2 overflow-auto pb-2">
        {frames.map((item, index) => (
          <div key={item.id} className={`w-24 shrink-0 rounded border p-1 ${index === cursor ? "border-accent" : "border-line"}`}>
            <button className="checker block aspect-square w-full" onClick={() => { setCursor(index); selectVersion(item.id); }}>
              <img src={item.url} alt="" className="h-full w-full object-contain" />
            </button>
            <div className="mt-1 flex justify-between text-[10px] text-mist">
              <span>f{index + 1}</span>
              <span>{item.duration_ms}ms</span>
            </div>
            <div className="mt-1 flex gap-1">
              <button className="text-[10px]" onClick={() => void move(index, -1)}>←</button>
              <button className="text-[10px]" onClick={() => void move(index, 1)}>→</button>
              <label className="cursor-pointer text-[10px] text-accent2">
                Replace
                <input
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void run(async () => {
                      await api.uploadVersion(asset.id, file, {
                        kind: "animation",
                        animation_name: animation,
                        direction: facing,
                        frame_index: item.frame_index,
                        duration_ms: item.duration_ms,
                        parent_version_id: item.id,
                      });
                      await refreshAsset();
                    });
                  }}
                />
              </label>
              <button className="text-[10px] text-red-300" onClick={() => void remove(item.id)}>
                Del
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
