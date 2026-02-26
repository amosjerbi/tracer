# Centerline PNG → SVG Webapp

A minimal webapp that turns PNGs into **centerline (skeleton) SVGs** using a Python backend.
Load images faster by typing in console - generateCenterlinePreview()

## Demo

GitHub Pages (UI only):

```
https://amosjerbi.github.io/tracer/
```
## Local run

For full functionality, you need the backend (local or hosted).
Downloads/tracer-master:

1. Create and activate a venv, install deps
2. 
```
cd /Users/amosjerbi/Downloads/tracer-master
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

2. Start the server

```
. .venv/bin/activate && python server.py
```

```
python server.py
```

3. Open

  http://localhost:8000/index.html

  If install fails on cairosvg, you likely need system libs (macOS):

  brew install cairo pango gdk-pixbuf libffi

  If you want me to run anything for you, say which Python you want to use
  (system, Homebrew, or an existing venv) and whether I should set it up
  in .venv.


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
