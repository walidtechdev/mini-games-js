"""Checkpoint and LoRA filenames from a ComfyUI install directory.

This only reads filenames. It does not load weights and it does not install ComfyUI.
"""

from __future__ import annotations

from pathlib import Path

MODEL_EXTENSIONS = {".safetensors", ".ckpt", ".pt", ".pth", ".bin"}


def list_disk_models(install_path: str) -> tuple[list[str], list[str]]:
    root = Path(install_path).expanduser() if install_path else Path()
    return _scan(root / "models" / "checkpoints"), _scan(root / "models" / "loras")


def _scan(folder: Path) -> list[str]:
    if not folder.is_dir():
        return []
    names: list[str] = []
    try:
        paths = list(folder.rglob("*"))
    except OSError:
        return []
    for path in paths:
        try:
            if not path.is_file():
                continue
        except OSError:
            continue
        if path.suffix.lower() not in MODEL_EXTENSIONS:
            continue
        if path.name.startswith("put_"):
            continue
        try:
            names.append(path.relative_to(folder).as_posix())
        except ValueError:
            continue
    return sorted(set(names), key=str.lower)
