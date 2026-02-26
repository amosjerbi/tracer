#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, HTTPServer
import os
import tempfile
import subprocess
import sys
from pathlib import Path
from email.parser import BytesParser
from email.policy import default

ROOT = Path(__file__).resolve().parent
CENTERLINE = ROOT / "centerline.py"

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # CORS for GitHub Pages / external frontend
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != "/centerline":
            self.send_error(404)
            return

        content_type = self.headers.get("content-type")
        if not content_type or "multipart/form-data" not in content_type:
            self.send_error(400, "Expected multipart/form-data")
            return

        try:
            length = int(self.headers.get("content-length", "0"))
        except Exception:
            length = 0
        if length <= 0:
            self.send_error(400, "Empty body")
            return

        body = self.rfile.read(length)
        msg = BytesParser(policy=default).parsebytes(
            f"Content-Type: {content_type}\r\n\r\n".encode("utf-8") + body
        )

        parts = {}
        if msg.is_multipart():
            for part in msg.iter_parts():
                name = part.get_param("name", header="content-disposition")
                if not name:
                    continue
                parts[name] = part

        file_part = parts.get("file")
        if not file_part:
            self.send_error(400, "Missing file")
            return

        threshold = parts.get("threshold")
        if threshold:
            threshold = threshold.get_content()
        else:
            threshold = "240"
        epsilon = parts.get("epsilon")
        if epsilon:
            epsilon = epsilon.get_content()
        else:
            epsilon = "6.0"
        curve = parts.get("curve")
        if curve:
            curve = curve.get_content()
        else:
            curve = "2"
        stroke = parts.get("stroke")
        if stroke:
            stroke = stroke.get_content()
        else:
            stroke = "15"
        shapes = parts.get("shapes")
        if shapes:
            shapes = str(shapes.get_content()).strip().lower()
        else:
            shapes = "0"
        mode = parts.get("mode")
        if mode:
            mode = str(mode.get_content()).strip().lower()
        else:
            mode = "centerline"
        try:
            threshold = str(int(threshold))
        except Exception:
            threshold = "240"
        try:
            epsilon = str(float(epsilon))
        except Exception:
            epsilon = "6.0"
        try:
            curve = str(int(curve))
        except Exception:
            curve = "2"
        try:
            stroke = str(float(stroke))
        except Exception:
            stroke = "15.0"
        include_shapes = shapes in {"1", "true", "yes", "on"}
        if mode not in {"centerline", "circle"}:
            mode = "centerline"

        def pick_extension(part):
            filename = part.get_filename() or ""
            suffix = Path(filename).suffix.lower()
            if suffix in {".png", ".jpg", ".jpeg", ".svg"}:
                return suffix
            ctype = part.get_content_type()
            if ctype == "image/svg+xml":
                return ".svg"
            if ctype == "image/jpeg":
                return ".jpg"
            if ctype == "image/png":
                return ".png"
            return ".png"

        with tempfile.TemporaryDirectory() as tmp:
            in_path = Path(tmp) / f"input{pick_extension(file_part)}"
            out_path = Path(tmp) / "input-preview.svg"
            with open(in_path, "wb") as f:
                f.write(file_part.get_payload(decode=True))

            cmd = [sys.executable, str(CENTERLINE), str(in_path), "-preview", threshold, epsilon, curve, stroke, mode, "1" if include_shapes else "0"]
            proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
            if proc.returncode != 0:
                self.send_error(500, proc.stderr or "Centerline failed")
                return

            if not out_path.exists():
                alt = in_path.with_name(f"{in_path.stem}-preview.svg")
                if alt.exists():
                    out_path = alt
                else:
                    self.send_error(500, "Output SVG not found")
                    return

            svg = out_path.read_text()
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(svg.encode("utf-8"))

if __name__ == "__main__":
    os.chdir(ROOT)
    port = int(os.environ.get("PORT", "8000"))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving on http://localhost:{port}")
    server.serve_forever()
