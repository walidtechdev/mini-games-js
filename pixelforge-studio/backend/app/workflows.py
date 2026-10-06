"""Discover workflow adapters. The frontend only sees the published input schema."""

from __future__ import annotations

import importlib.util
import sys
from typing import Any

from app.config import WORKFLOWS_DIR
from app.workflow_support import WorkflowAdapter

_registry: dict[str, WorkflowAdapter] | None = None


def load_registry() -> dict[str, WorkflowAdapter]:
    global _registry
    found: dict[str, WorkflowAdapter] = {}
    if not WORKFLOWS_DIR.exists():
        _registry = found
        return found
    for folder in sorted(WORKFLOWS_DIR.iterdir()):
        adapter_path = folder / "adapter.py"
        if not folder.is_dir() or not adapter_path.exists():
            continue
        spec = importlib.util.spec_from_file_location(f"pixelforge_workflow_{folder.name}", adapter_path)
        if spec is None or spec.loader is None:
            continue
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        adapter = module.Adapter()
        found[adapter.id] = adapter
    _registry = found
    return found


def get_registry() -> dict[str, WorkflowAdapter]:
    if _registry is None:
        return load_registry()
    return _registry


def get_adapter(workflow_id: str) -> WorkflowAdapter:
    registry = get_registry()
    adapter = registry.get(workflow_id)
    if adapter is None:
        raise KeyError(workflow_id)
    return adapter


def list_workflows() -> list[dict[str, Any]]:
    return [adapter.public_info() for adapter in get_registry().values()]
