import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { PALETTE, PixelBuffer, ZOOM_STEPS, sameColor, zoomPercent, type RGBA } from "../lib/pixel";
import { latestFrames } from "../lib/format";
import { run, useStudio } from "../store";
import { ANIMATIONS } from "../types";
import { DropImage } from "./DropImage";
import { Button } from "./ui";

type Tool = "pencil" | "eraser" | "fill" | "picker" | "rect" | "select" | "move";
type Rect = { x: number; y: number; w: number; h: number };

const TOOLS: Array<[Tool, string]> = [
  ["pencil", "Pencil"],
  ["eraser", "Eraser"],
  ["fill", "Fill"],
  ["picker", "Picker"],
  ["rect", "Rect"],
  ["select", "Select"],
  ["move", "Move"],
];

function normalize(x0: number, y0: number, x1: number, y1: number): Rect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

export function PixelEditor() {
  const asset = useStudio((state) => state.asset);
  const selectedId = useStudio((state) => state.selectedVersionId);
  const selectVersion = useStudio((state) => state.selectVersion);
  const refreshAsset = useStudio((state) => state.refreshAsset);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<PixelBuffer>(PixelBuffer.create(32, 32));
  const onionRef = useRef<PixelBuffer | null>(null);
  const undoRef = useRef<Uint8ClampedArray[]>([]);
  const redoRef = useRef<Uint8ClampedArray[]>([]);
  const dirtyRef = useRef(false);
  const toolRef = useRef<Tool>("pencil");
  const colorRef = useRef<RGBA>([244, 240, 232, 255]);
  const sampleRef = useRef<RGBA>([232, 72, 80, 255]);
  const selectionRef = useRef<Rect | null>(null);
  const dragRef = useRef<{
    kind: "draw" | "rect" | "select" | "move";
    x: number;
    y: number;
    base?: Uint8ClampedArray;
    floating?: PixelBuffer;
    origin?: Rect;
  } | null>(null);

  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState<RGBA>([244, 240, 232, 255]);
  const [sample, setSample] = useState<RGBA>([232, 72, 80, 255]);
  const [zoomIndex, setZoomIndex] = useState(6);
  const [showGrid, setShowGrid] = useState(true);
  const [onion, setOnion] = useState(true);
  const [rev, setRev] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);
  const [blankW, setBlankW] = useState(32);
  const [blankH, setBlankH] = useState(32);
  const [anim, setAnim] = useState<(typeof ANIMATIONS)[number]>("walk");
  const [facing, setFacing] = useState("front");

  const zoom = ZOOM_STEPS[zoomIndex] ?? 16;
  const version = asset?.versions.find((item) => item.id === selectedId) ?? null;
  const frames = asset ? latestFrames(asset.versions, anim, facing) : [];
  const sourceUrl = version?.url ?? "";
  const frameIndex = frames.findIndex((frame) => frame.id === selectedId);
  const previousUrl = frameIndex > 0 ? frames[frameIndex - 1]?.url ?? "" : "";

  function bump(): void {
    setRev((value) => value + 1);
  }

  function pushUndo(): void {
    undoRef.current.push(bufferRef.current.snapshot());
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
    dirtyRef.current = true;
  }

  function undo(): void {
    const snap = undoRef.current.pop();
    if (!snap) return;
    redoRef.current.push(bufferRef.current.snapshot());
    bufferRef.current.restore(snap);
    bump();
  }

  function redo(): void {
    const snap = redoRef.current.pop();
    if (!snap) return;
    undoRef.current.push(bufferRef.current.snapshot());
    bufferRef.current.restore(snap);
    bump();
  }

  function setToolBoth(next: Tool): void {
    toolRef.current = next;
    setTool(next);
  }

  function setColorBoth(next: RGBA): void {
    colorRef.current = next;
    setColor(next);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const buffer = bufferRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = buffer.width * zoom;
    canvas.height = buffer.height * zoom;
    ctx.imageSmoothingEnabled = false;
    const tile = Math.max(zoom, 4);
    for (let y = 0; y < canvas.height; y += tile) {
      for (let x = 0; x < canvas.width; x += tile) {
        const on = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0;
        ctx.fillStyle = on ? "#121722" : "#1c2433";
        ctx.fillRect(x, y, tile, tile);
      }
    }
    const off = document.createElement("canvas");
    off.width = buffer.width;
    off.height = buffer.height;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    if (onion && onionRef.current && onionRef.current.width === buffer.width && onionRef.current.height === buffer.height) {
      offCtx.putImageData(new ImageData(new Uint8ClampedArray(onionRef.current.data), off.width, off.height), 0, 0);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      offCtx.clearRect(0, 0, off.width, off.height);
    }
    offCtx.putImageData(new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height), 0, 0);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    if (showGrid && zoom >= 4) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      for (let x = 0; x <= buffer.width; x += 1) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, canvas.height);
      }
      for (let y = 0; y <= buffer.height; y += 1) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(canvas.width, y * zoom + 0.5);
      }
      ctx.stroke();
    }
    const stroke = (rect: Rect, ink: string) => {
      ctx.strokeStyle = ink;
      ctx.strokeRect(rect.x * zoom + 0.5, rect.y * zoom + 0.5, rect.w * zoom - 1, rect.h * zoom - 1);
    };
    if (selection) stroke(selection, "#e3a15a");
    if (preview) stroke(preview, "#8eb4ff");
  }, [rev, zoom, showGrid, onion, selection, preview]);

  useEffect(() => {
    if (!sourceUrl) return;
    let cancel = false;
    void PixelBuffer.fromUrl(sourceUrl).then((buffer) => {
      if (cancel) return;
      if (dirtyRef.current && !window.confirm("Discard unsaved pixels and load this image?")) return;
      bufferRef.current = buffer;
      undoRef.current = [];
      redoRef.current = [];
      dirtyRef.current = false;
      selectionRef.current = null;
      setSelection(null);
      bump();
    });
    return () => {
      cancel = true;
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!onion || !previousUrl) {
      onionRef.current = null;
      setRev((value) => value + 1);
      return;
    }
    let cancel = false;
    void PixelBuffer.fromUrl(previousUrl).then((buffer) => {
      if (cancel) return;
      onionRef.current = buffer;
      setRev((value) => value + 1);
    });
    return () => {
      cancel = true;
    };
  }, [onion, previousUrl]);

  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (command === "undo") undo();
      if (command === "redo") redo();
      if (command === "zoom-in") setZoomIndex((value) => Math.min(ZOOM_STEPS.length - 1, value + 1));
      if (command === "zoom-out") setZoomIndex((value) => Math.max(0, value - 1));
      if (command === "mirror") mirror();
      if (command === "crop") crop();
      if (command === "replace") replaceColor();
      if (command === "save") void save();
      if (command === "clear-selection") clearSelection();
      if (command === "pencil" || command === "eraser" || command === "fill" || command === "picker" || command === "rect" || command === "select" || command === "move") {
        setToolBoth(command);
      }
    };
    const onFrame = (event: Event) => {
      const delta = (event as CustomEvent<number>).detail;
      const index = frames.findIndex((frame) => frame.id === selectedId);
      const next = frames[index + delta];
      if (next) selectVersion(next.id);
    };
    window.addEventListener("pixelforge-editor", onCommand);
    window.addEventListener("pixelforge-frame", onFrame);
    return () => {
      window.removeEventListener("pixelforge-editor", onCommand);
      window.removeEventListener("pixelforge-frame", onFrame);
    };
  });

  function pixelFromEvent(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * bufferRef.current.width);
    const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * bufferRef.current.height);
    if (!bufferRef.current.inBounds(x, y)) return null;
    return { x, y };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    const point = pixelFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const active = toolRef.current;
    const ink = active === "eraser" ? ([0, 0, 0, 0] as RGBA) : colorRef.current;
    if (active === "pencil" || active === "eraser") {
      pushUndo();
      bufferRef.current.set(point.x, point.y, ink);
      dragRef.current = { kind: "draw", x: point.x, y: point.y };
      bump();
    } else if (active === "fill") {
      pushUndo();
      bufferRef.current.fill(point.x, point.y, colorRef.current);
      bump();
    } else if (active === "picker") {
      const picked = bufferRef.current.get(point.x, point.y);
      if (picked && picked[3] > 0) {
        setColorBoth(picked);
        sampleRef.current = picked;
        setSample(picked);
      }
    } else if (active === "rect") {
      dragRef.current = { kind: "rect", x: point.x, y: point.y };
      setPreview(normalize(point.x, point.y, point.x, point.y));
    } else if (active === "select") {
      dragRef.current = { kind: "select", x: point.x, y: point.y };
      const next = normalize(point.x, point.y, point.x, point.y);
      selectionRef.current = next;
      setSelection(next);
    } else if (active === "move" && selectionRef.current && contains(selectionRef.current, point.x, point.y)) {
      pushUndo();
      const origin = selectionRef.current;
      const floating = bufferRef.current.extract(origin.x, origin.y, origin.w, origin.h);
      bufferRef.current.clearRect(origin.x, origin.y, origin.w, origin.h);
      dragRef.current = { kind: "move", x: point.x, y: point.y, base: bufferRef.current.snapshot(), floating, origin };
      bump();
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    const point = pixelFromEvent(event);
    const drag = dragRef.current;
    if (!point || !drag) return;
    if (drag.kind === "draw") {
      const ink = toolRef.current === "eraser" ? ([0, 0, 0, 0] as RGBA) : colorRef.current;
      bufferRef.current.line(drag.x, drag.y, point.x, point.y, ink);
      drag.x = point.x;
      drag.y = point.y;
      bump();
    } else if (drag.kind === "rect") {
      setPreview(normalize(drag.x, drag.y, point.x, point.y));
    } else if (drag.kind === "select") {
      const next = normalize(drag.x, drag.y, point.x, point.y);
      selectionRef.current = next;
      setSelection(next);
    } else if (drag.kind === "move" && drag.base && drag.floating && drag.origin) {
      bufferRef.current.restore(drag.base);
      const dx = point.x - drag.x;
      const dy = point.y - drag.y;
      const next = { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy };
      bufferRef.current.stamp(drag.floating, next.x, next.y);
      selectionRef.current = next;
      setSelection(next);
      bump();
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    const point = pixelFromEvent(event);
    if (drag?.kind === "rect" && point) {
      pushUndo();
      const rect = normalize(drag.x, drag.y, point.x, point.y);
      bufferRef.current.rect(rect.x, rect.y, rect.w, rect.h, colorRef.current, event.shiftKey);
      setPreview(null);
      bump();
    }
    dragRef.current = null;
  }

  function mirror(): void {
    pushUndo();
    bufferRef.current.mirrorHorizontal(selectionRef.current ?? undefined);
    bump();
  }

  function crop(): void {
    const rect = selectionRef.current;
    if (!rect) return;
    pushUndo();
    bufferRef.current = bufferRef.current.crop(rect.x, rect.y, rect.w, rect.h);
    selectionRef.current = null;
    setSelection(null);
    bump();
  }

  function replaceColor(): void {
    pushUndo();
    bufferRef.current.replaceColor(sampleRef.current, colorRef.current);
    bump();
  }

  function clearSelection(): void {
    const rect = selectionRef.current;
    if (!rect) return;
    pushUndo();
    bufferRef.current.clearRect(rect.x, rect.y, rect.w, rect.h);
    bump();
  }

  async function save(): Promise<void> {
    if (!asset) return;
    const blob = await bufferRef.current.toBlob();
    await run(async () => {
      const saved = await api.uploadVersion(asset.id, blob, {
        kind: version?.kind === "animation" ? "animation" : "edit",
        prompt: "Pixel editor",
        direction: version?.direction || facing,
        animation_name: version?.animation_name || (version?.kind === "animation" ? anim : ""),
        frame_index: version?.frame_index,
        duration_ms: version?.duration_ms ?? 120,
        parent_version_id: version?.id,
      });
      dirtyRef.current = false;
      await refreshAsset();
      selectVersion(saved.id);
    });
  }

  async function openFile(file: File): Promise<void> {
    if (dirtyRef.current && !window.confirm("Discard unsaved pixels and load this image?")) return;
    const buffer = await PixelBuffer.fromFile(file);
    bufferRef.current = buffer;
    undoRef.current = [];
    redoRef.current = [];
    dirtyRef.current = true;
    selectionRef.current = null;
    setSelection(null);
    bump();
  }

  function newCanvas(): void {
    if (dirtyRef.current && !window.confirm("Discard unsaved pixels?")) return;
    bufferRef.current = PixelBuffer.create(blankW, blankH);
    undoRef.current = [];
    redoRef.current = [];
    dirtyRef.current = false;
    selectionRef.current = null;
    setSelection(null);
    bump();
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-36 shrink-0 flex-col gap-1 border-r border-line p-2">
        {TOOLS.map(([id, label]) => (
          <Button key={id} tone={tool === id ? "accent" : "ghost"} onClick={() => setToolBoth(id)}>
            {label}
          </Button>
        ))}
        <div className="my-2 h-px bg-line" />
        <Button onClick={undo}>Undo</Button>
        <Button onClick={redo}>Redo</Button>
        <Button onClick={mirror}>Mirror</Button>
        <Button onClick={crop}>Crop</Button>
        <Button onClick={replaceColor}>Replace</Button>
        <Button tone="accent" onClick={() => void save()}>
          Save
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs text-mist">
          <span className="text-white">{zoomPercent(zoom)}%</span>
          <Button className="px-2 py-0.5" onClick={() => setZoomIndex((value) => Math.max(0, value - 1))}>
            −
          </Button>
          <Button className="px-2 py-0.5" onClick={() => setZoomIndex((value) => Math.min(ZOOM_STEPS.length - 1, value + 1))}>
            +
          </Button>
          <Button className="px-2 py-0.5" onClick={() => setZoomIndex(ZOOM_STEPS.indexOf(16))}>
            1600%
          </Button>
          <Button className="px-2 py-0.5" onClick={() => setShowGrid((value) => !value)}>
            {showGrid ? "Grid on" : "Grid off"}
          </Button>
          <Button className="px-2 py-0.5" onClick={() => setOnion((value) => !value)}>
            {onion ? "Onion on" : "Onion off"}
          </Button>
          <span>
            {bufferRef.current.width}×{bufferRef.current.height}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <input className="w-14 rounded border border-line bg-ink px-1" type="number" min={1} max={256} value={blankW} onChange={(event) => setBlankW(Number(event.target.value))} />
            <input className="w-14 rounded border border-line bg-ink px-1" type="number" min={1} max={256} value={blankH} onChange={(event) => setBlankH(Number(event.target.value))} />
            <Button className="px-2 py-0.5" onClick={newCanvas}>
              New
            </Button>
          </span>
        </div>
        <DropImage className="min-h-0 flex-1 overflow-auto bg-ink" label="Drop a PNG, WebP, or JPEG to open it in the editor" onFile={(file) => void openFile(file)}>
          <div className="p-4">
            <canvas
              ref={canvasRef}
              className="cursor-crosshair touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>
        </DropImage>
        <div className="flex items-center gap-2 border-t border-line px-3 py-2">
          <span className="h-6 w-6 rounded border border-line" style={{ background: `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})` }} />
          <span className="text-[11px] text-mist">From</span>
          <span className="h-6 w-6 rounded border border-white/30" style={{ background: `rgba(${sample[0]},${sample[1]},${sample[2]},${sample[3] / 255})` }} />
          <div className="flex flex-wrap gap-1">
            {PALETTE.map((swatch) => (
              <button
                key={swatch.join("-")}
                className={`h-5 w-5 rounded-sm border ${sameColor(swatch, color) ? "border-accent" : "border-black/40"}`}
                style={{
                  background: swatch[3] === 0 ? "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 0 0 / 8px 8px" : `rgb(${swatch[0]},${swatch[1]},${swatch[2]})`,
                }}
                onClick={() => setColorBoth(swatch)}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-auto border-t border-line px-3 py-2">
          <select className="rounded border border-line bg-ink px-1 text-xs" value={anim} onChange={(event) => setAnim(event.target.value as typeof anim)}>
            {ANIMATIONS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select className="rounded border border-line bg-ink px-1 text-xs" value={facing} onChange={(event) => setFacing(event.target.value)}>
            {["front", "back", "left", "right"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          {frames.map((frame, index) => (
            <button key={frame.id} className={`checker h-10 w-10 shrink-0 rounded border ${frame.id === selectedId ? "border-accent" : "border-line"}`} onClick={() => selectVersion(frame.id)}>
              <img src={frame.url} alt={`Frame ${index + 1}`} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
