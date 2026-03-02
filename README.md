# Centerline PNG → SVG Webapp

A minimal webapp that turns PNGs/JPGs/SVGs into **centerline (skeleton) SVGs** using a Python backend, with optional **Perfect Circle (Fit)** and **Rect** detection for clean geometric outputs.

## Demo

GitHub Pages (UI only):

```
https://amosjerbi.github.io/tracer/
```
## Local run

For full functionality, you need the backend (local or hosted).

1.This will create a venv folder with all dependencies within it
```
cd /Users/amosjerbi/Desktop/tracer
python3 -m venv venv
source venv/bin/activate
pip install numpy pillow scikit-image opencv-python-headless svgwrite cairosvg skan
```

2. Start the server

```
python3 server.py
```

3. Open

  http://localhost:8000/index.html


## Features

- Drag & drop PNG/JPG/SVG → auto‑generates centerline preview
- Adjustable **white threshold**, **vector points**, **epsilon**, **curve smoothing**, and **stroke width**
- Presets: **Clean**, **Angular**, **Smooth**, **Bold**, **Perfect Circle (Fit)**
- Toggle **Add shapes behind lines** for circle/rect fills where detected
- Overlay original image (opacity dropdown) and change preview stroke color
- Download SVG after generation
- Pan/zoom the preview (drag to pan, `+`/`-` to zoom)

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

## How It Works

1. The browser sends a PNG to `server.py`.
2. The server calls `centerline.py` with your slider values.
3. The SVG is returned and shown in the dropzone preview.

## CLI (optional)

```bash
python3 centerline.py /path/to/image.png -preview 240 6 2 15 centerline
```

Args:
- `-preview` output suffix
- `240` white threshold (200–255)
- `6` epsilon
- `2` curve smoothing iterations
- `15` stroke width
- `centerline` or `circle` mode (circle mode fits circles/rects per component)
