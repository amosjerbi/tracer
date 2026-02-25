# Centerline PNG → SVG Webapp

A minimal webapp that turns PNGs into **centerline (skeleton) SVGs** using a Python backend.

## Demo

GitHub Pages (UI only):

```
https://amosjerbi.github.io/tracer/
```

For full functionality, you need the backend (local or hosted).

## Features

- Drag & drop a PNG → auto‑generates centerline preview
- Adjustable **white threshold**, **vector points**, **epsilon**, **curve smoothing**, and **stroke width**
- Download SVG after generation
- Pan/zoom the preview (drag to pan, `+`/`-` to zoom)

## Run Locally

```bash
cd /Users/amosjerbi/Desktop/rubber
. .venv/bin/activate
python3 server.py
```

Open:

```
http://localhost:8000/index.html
```

## Deploy Backend on Render (Recommended)

1. Create a new **Web Service** on Render.
2. Connect the repo: `https://github.com/amosjerbi/tracer`
3. Set **Build Command**:

```
pip install -r requirements.txt
```

4. Set **Start Command**:

```
python3 server.py
```

5. Once deployed, copy your Render URL and set it in `app.js`:

```
const API_BASE = "https://YOUR-RENDER-URL";
```

Commit + push, and GitHub Pages will now use the hosted backend.

## Requirements (Backend)

- `numpy`
- `pillow`
- `scikit-image`
- `opencv-python-headless`
- `svgwrite`
- `cairosvg`
- `skan`

Install locally:

```bash
python -m pip install -r requirements.txt
```

## How It Works

1. The browser sends a PNG to `server.py`.
2. The server calls `centerline.py` with your slider values.
3. The SVG is returned and shown in the dropzone preview.

## CLI (optional)

```bash
python3 centerline.py /path/to/image.png -preview 240 6 2 15
```

Args:
- `-preview` output suffix
- `240` white threshold (200–255)
- `6` epsilon
- `2` curve smoothing iterations
- `15` stroke width
