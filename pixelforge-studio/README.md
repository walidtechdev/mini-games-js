# PixelForge Studio

Personal pixel-art production studio for one artist on one machine. The app keeps projects, assets, and full generation history. ComfyUI does the AI rendering. PixelForge is not a ComfyUI replacement and it is not a hosted service.

```
Frontend (React) → FastAPI → ComfyUI → generated files on disk
```

Images live under `storage/`. SQLite (`storage/pixelforge.db`) stores projects, assets, versions, jobs, styles, and settings.

## What you need

- Ubuntu with Python 3.11+ (`python3 --version`) and Node.js 20+ (`node --version`)
- ComfyUI already installed and running on this machine, normally at `http://127.0.0.1:8188`

PixelForge only talks to ComfyUI over HTTP. It does not install ComfyUI, ROCm, or drivers, and it does not use the GPU itself. The GPU belongs to your ComfyUI process. 16 GB of VRAM is enough for SDXL sprite workflows. Set the checkpoint filename in **Settings** to a file in that ComfyUI install's `models/checkpoints` folder (the default name is `v1-5-pruned-emaonly.safetensors`).

ComfyUI is only required for AI generation (sprites, edits, directions, animation frames, upscale, background removal). Pixelize (algorithmic), the pixel editor, spritesheet export, and project/asset management work while ComfyUI is closed.

## Setup and run (Ubuntu)

From this folder (`pixelforge-studio`):

```bash
chmod +x start.sh
./start.sh
```

`start.sh` will:

1. Copy `.env.example` to `.env` if you do not have one yet
2. Create `backend/.venv` if it is missing and install Python packages
3. Run `npm install` in `frontend` the first time
4. Start the API at http://127.0.0.1:8787
5. Start the UI at http://127.0.0.1:5173

Open http://127.0.0.1:5173. Press Ctrl+C in that terminal to stop both processes.

Start ComfyUI yourself, then in PixelForge open **Settings → Test ComfyUI Connection**. The button shows **Connected** or **Offline**. On success, **GPU information** shows the device name and VRAM from ComfyUI `/system_stats`. If ComfyUI is down, that panel stays offline. Set **Default model** to your checkpoint filename and save.

### Run the two processes yourself

API:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8787
```

UI (second terminal):

```bash
cd frontend
npm install
npm run dev
```

### Windows

`start.bat` does the same setup and opens the API and UI in two command windows. The UI is still http://127.0.0.1:5173.

## Connect ComfyUI

1. Start your existing ComfyUI and confirm http://127.0.0.1:8188 loads.
2. Copy `.env.example` to `.env` if you have not already.
3. Set `PIXEFORGE_COMFYUI_URL` if ComfyUI is not on port 8188.
4. In the app, **Settings** stores the same URL, the checkpoint name, the storage directory, and the default workflow. Saved settings override `.env` after you click Save.
5. **Test ComfyUI Connection** reads device name and VRAM from ComfyUI `/system_stats`. PixelForge does not run a GPU utility of its own.

If a job cannot reach ComfyUI, the UI says: "ComfyUI is not running. Start ComfyUI and check that the configured address is correct." The developer panel (bottom bar) keeps the raw error.

## Workflows

Adapters live in `workflows/<name>/` with `adapter.py` and `workflow.json`. The UI builds forms from the adapter schema and never sees ComfyUI node ids.

| Folder | What it does | Stock ComfyUI nodes |
| --- | --- | --- |
| `txt2sprite` | Text to sprite | Yes |
| `image_edit` | Img2img edit | Yes (`LoadImage`, `ImageScale`, `VAEEncode`) |
| `directions` | One facing from a master | Yes |
| `animation` | One animation frame from a master | Yes |
| `upscale` | `ImageScale` | Yes. Replace the JSON for an ESRGAN graph |
| `pixelize` | Algorithmic offline, or AI img2img | AI path is stock nodes |
| `background_removal` | Cutout workflow | **No.** The shipped graph expects the RMBG custom node |

To point a workflow at your own graph, export it from ComfyUI in **API format** and replace that folder's `workflow.json`. Keep these placeholders where you want values injected:

`__PROMPT__` `__NEGATIVE__` `__MODEL__` `__LORA__` `__LORA_STRENGTH__` `__SEED__` `__STEPS__` `__CFG__` `__WIDTH__` `__HEIGHT__` `__SAMPLER__` `__SCHEDULER__` `__DENOISE__` `__IMAGE__` `__FILENAME__` `__METHOD__`

An empty LoRA removes a `LoraLoader` node and rewires model/clip links. Adding another folder with an `Adapter` class is enough; the frontend does not need a change.

## Assets on disk

```
storage/projects/<slug>/
  project.json
  <category>/<asset-slug>/
    asset.json
    references/
    generations/
    approved/
    animations/
```

Generations are never overwritten. Each version stores prompt, seed, workflow, parameters, model, LoRA, and time so it can be reproduced.

## Keyboard

Press `?` in the app. Editor: `B` pencil, `E` eraser, `G` fill, `I` picker, `R` rectangle, `V` selection, `M` move, `Ctrl+Z` / `Ctrl+Y`, `[` `]` zoom, `H` mirror, `Shift+R` replace color, `Ctrl+S` save a new version. `1`–`8` switch workspace modes. `Ctrl+Enter` generates. `Space` plays an animation.
