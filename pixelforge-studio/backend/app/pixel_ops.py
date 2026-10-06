"""Offline pixel operations. These never call ComfyUI."""

from __future__ import annotations

import io
import json
from typing import Any

from PIL import Image

DirectionFrame = dict[str, Any]


def open_rgba(data: bytes) -> Image.Image:
    with Image.open(io.BytesIO(data)) as img:
        return img.convert("RGBA")


def png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def image_size(data: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(data)) as img:
        return img.size


def reduce_palette(image: Image.Image, colors: int) -> Image.Image:
    """Quantize RGB and put the original alpha back so sprites stay transparent."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    quantized = rgba.convert("RGB").quantize(colors=max(2, colors), method=Image.Quantize.MEDIANCUT)
    out = quantized.convert("RGBA")
    out.putalpha(alpha)
    return out


def cleanup_artifacts(image: Image.Image) -> Image.Image:
    """Replace isolated sparkle pixels with the majority color of their neighbors."""
    rgba = image.convert("RGBA")
    w, h = rgba.size
    src = rgba.load()
    dst = rgba.copy()
    out = dst.load()
    if src is None or out is None:
        return rgba
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            neighbors: list[tuple[int, int, int]] = []
            for ny in range(max(0, y - 1), min(h, y + 2)):
                for nx in range(max(0, x - 1), min(w, x + 2)):
                    if nx == x and ny == y:
                        continue
                    nr, ng, nb, na = src[nx, ny]
                    if na == 0:
                        continue
                    neighbors.append((nr, ng, nb))
            if not neighbors:
                continue
            same = sum(1 for n in neighbors if n == (r, g, b))
            if same >= 1:
                continue
            counts: dict[tuple[int, int, int], int] = {}
            for n in neighbors:
                counts[n] = counts.get(n, 0) + 1
            majority, count = max(counts.items(), key=lambda item: item[1])
            if count >= 3:
                out[x, y] = (majority[0], majority[1], majority[2], a)
    return dst


def pixelize_image(
    image: Image.Image,
    width: int,
    height: int,
    palette_colors: int = 0,
    cleanup: bool = False,
    scale_up: int = 1,
) -> Image.Image:
    """Nearest-neighbor resolution reduction, optional palette and cleanup, optional integer scale-up."""
    w = max(1, int(width))
    h = max(1, int(height))
    small = image.convert("RGBA").resize((w, h), Image.Resampling.NEAREST)
    if cleanup:
        small = cleanup_artifacts(small)
    colors = int(palette_colors or 0)
    if colors >= 2:
        small = reduce_palette(small, colors)
    factor = max(1, int(scale_up))
    if factor > 1:
        small = small.resize((w * factor, h * factor), Image.Resampling.NEAREST)
    return small


def blank_image(width: int, height: int) -> Image.Image:
    return Image.new("RGBA", (max(1, width), max(1, height)), (0, 0, 0, 0))


def _parse_color(value: str) -> tuple[int, int, int, int]:
    raw = (value or "").strip().lstrip("#")
    if len(raw) == 6:
        return (int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16), 255)
    if len(raw) == 8:
        return (int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16), int(raw[6:8], 16))
    return (0, 0, 0, 0)


def pack_spritesheet(
    frames: list[tuple[Image.Image, DirectionFrame]],
    columns: int,
    rows: int,
    padding: int,
    cell_width: int,
    cell_height: int,
    background: str,
) -> tuple[Image.Image, dict[str, Any]]:
    cols = max(1, int(columns))
    rws = max(1, int(rows))
    pad = max(0, int(padding))
    cw = max(1, int(cell_width))
    ch = max(1, int(cell_height))
    if len(frames) > cols * rws:
        raise ValueError(
            f"Sheet is {cols}x{rws} ({cols * rws} cells) but {len(frames)} frames were selected."
        )
    sheet_w = cols * cw + max(0, cols - 1) * pad
    sheet_h = rws * ch + max(0, rws - 1) * pad
    sheet = Image.new("RGBA", (sheet_w, sheet_h), _parse_color(background))
    meta_frames: list[dict[str, Any]] = []
    for index, (image, info) in enumerate(frames):
        col = index % cols
        row = index // cols
        x = col * (cw + pad)
        y = row * (ch + pad)
        cell = image.convert("RGBA").resize((cw, ch), Image.Resampling.NEAREST)
        sheet.paste(cell, (x, y), cell)
        meta_frames.append(
            {
                "frame": info.get("frame", index),
                "x": x,
                "y": y,
                "width": cw,
                "height": ch,
                "duration": int(info.get("duration", 100)),
                "animation": info.get("animation") or "",
                "direction": info.get("direction") or "",
            }
        )
    document = {
        "frames": meta_frames,
        "meta": {
            "columns": cols,
            "rows": rws,
            "padding": pad,
            "cell_width": cw,
            "cell_height": ch,
            "image_width": sheet_w,
            "image_height": sheet_h,
            "background": background,
        },
    }
    return sheet, document


def dumps_sheet(document: dict[str, Any]) -> str:
    return json.dumps(document, indent=2)
