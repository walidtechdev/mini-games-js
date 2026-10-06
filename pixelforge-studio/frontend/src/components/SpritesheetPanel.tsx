import { useMemo, useState } from "react";
import { api } from "../api";
import { sheetFrames } from "../lib/format";
import { run, useStudio } from "../store";
import { ANIMATIONS, DIRECTIONS_4, DIRECTIONS_8 } from "../types";
import type { Version } from "../types";
import { Button, SelectInput, TextInput } from "./ui";

export function SpritesheetPanel() {
  const asset = useStudio((state) => state.asset);
  const refreshAsset = useStudio((state) => state.refreshAsset);
  const [animation, setAnimation] = useState<(typeof ANIMATIONS)[number]>("walk");
  const [eight, setEight] = useState(false);
  const [columns, setColumns] = useState(6);
  const [padding, setPadding] = useState(0);
  const [cell, setCell] = useState(32);
  const [background, setBackground] = useState("#00000000");
  const [preview, setPreview] = useState<Version | null>(null);
  const directions = eight ? DIRECTIONS_8 : DIRECTIONS_4;
  const frames = useMemo(() => (asset ? sheetFrames(asset.versions, animation, directions) : []), [asset, animation, directions]);
  const rows = Math.max(1, Math.ceil(frames.length / Math.max(1, columns)));

  if (!asset) return null;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-auto p-5">
      <div>
        <h2 className="text-xl font-semibold">Spritesheet</h2>
        <p className="text-sm text-mist">Packs the latest frame of each cell and writes a PNG plus JSON. {frames.length} frames ready.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-mist md:grid-cols-3">
        <label>
          Animation
          <SelectInput className="mt-1" value={animation} onChange={(event) => setAnimation(event.target.value as typeof animation)}>
            {ANIMATIONS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectInput>
        </label>
        <label>
          Columns
          <TextInput className="mt-1" type="number" min={1} value={columns} onChange={(event) => setColumns(Number(event.target.value))} />
        </label>
        <label>
          Rows
          <TextInput className="mt-1" type="number" value={rows} readOnly />
        </label>
        <label>
          Padding
          <TextInput className="mt-1" type="number" min={0} value={padding} onChange={(event) => setPadding(Number(event.target.value))} />
        </label>
        <label>
          Cell size
          <TextInput className="mt-1" type="number" min={1} value={cell} onChange={(event) => setCell(Number(event.target.value))} />
        </label>
        <label>
          Background
          <TextInput className="mt-1" value={background} onChange={(event) => setBackground(event.target.value)} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => setEight((value) => !value)}>{eight ? "Using 8 directions" : "Using 4 directions"}</Button>
        <Button
          tone="accent"
          disabled={frames.length === 0}
          onClick={() =>
            void run(async () => {
              const cols = Math.max(1, columns);
              const sheet = await api.spritesheet(asset.id, {
                version_ids: frames.map((frame) => frame.id),
                columns: cols,
                rows: Math.max(1, Math.ceil(frames.length / cols)),
                padding,
                cell_width: cell,
                cell_height: cell,
                background,
              });
              setPreview(sheet);
              await refreshAsset();
            })
          }
        >
          Export PNG + JSON
        </Button>
      </div>
      {preview ? (
        <div>
          <div className="checker mb-2 inline-block rounded border border-line p-2">
            <img src={preview.url} alt="Spritesheet" className="max-w-full" />
          </div>
          {preview.json_url ? (
            <a className="text-sm text-accent2" href={preview.json_url}>
              Download JSON
            </a>
          ) : null}
          {preview.sheet ? (
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-ink p-2 text-[11px] text-mist">{JSON.stringify(preview.sheet, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
