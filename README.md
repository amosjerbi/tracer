# Centerline PNG → SVG Webapp

A minimal, local webapp that turns PNGs into **centerline (skeleton) SVGs** using a Python backend.

## Demo

GitHub Pages (master / root):

```
https://amosjerbi.github.io/tracer/
```

## Features

- Drag & drop a PNG → auto‑generates centerline preview
- Adjustable **white threshold**, **vector points**, **epsilon**, **curve smoothing**, and **stroke width**
- Download SVG after generation
- Pan/zoom the preview (drag to pan, `+`/`-` to zoom)

## Requirements

Python 3 + venv with these packages:

- `numpy`
- `pillow`
- `scikit-image`
- `opencv-python-headless`
- `svgwrite`
- `cairosvg`
- `skan`

Install:

```bash
python -m pip install numpy pillow scikit-image opencv-python-headless svgwrite cairosvg skan
```

## Run

```bash
cd /Users/amosjerbi/Desktop/rubber
. .venv/bin/activate
python3 server.py
```

Open:

```
http://localhost:8000/index.html
```

## How It Works

1. The browser sends a PNG to `server.py`.
2. The server calls `centerline.py` with your slider values.
3. The SVG is returned and shown in the dropzone preview.

## Notes

- If slider changes don’t apply, restart the server and hard‑refresh the browser.
- Preview updates are triggered on slider change (debounced).

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
