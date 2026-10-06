"""Runtime configuration. Environment overrides .env, and saved settings override both."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS_DIR = APP_ROOT / "workflows"

COMFY_OFFLINE_MESSAGE = (
    "ComfyUI is not running. Start ComfyUI and check that the configured address is correct."
)


class EnvSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PIXEFORGE_",
        env_file=str(APP_ROOT / ".env") if (APP_ROOT / ".env").exists() else None,
        extra="ignore",
    )

    comfyui_url: str = "http://127.0.0.1:8188"
    storage_dir: str = "storage"
    database_path: str = ""
    host: str = "127.0.0.1"
    port: int = 8787
    default_model: str = "v1-5-pruned-emaonly.safetensors"
    default_lora: str = ""
    default_width: int = 512
    default_height: int = 512
    default_steps: int = 20
    default_cfg: float = 7
    default_workflow: str = "txt2sprite"


@lru_cache
def get_env() -> EnvSettings:
    return EnvSettings()


def resolve_storage_dir(raw: str | None = None) -> Path:
    value = raw if raw else get_env().storage_dir
    path = Path(value)
    if not path.is_absolute():
        path = APP_ROOT / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_database_path() -> Path:
    raw = get_env().database_path.strip()
    if raw:
        path = Path(raw)
        if not path.is_absolute():
            path = APP_ROOT / path
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    storage = resolve_storage_dir()
    return storage / "pixelforge.db"
