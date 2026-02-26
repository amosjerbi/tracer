from pathlib import Path
import io
import sys
import math
import numpy as np
from PIL import Image
from skimage.morphology import skeletonize, binary_erosion
from skimage.measure import label, find_contours
from skan.csr import skeleton_to_csgraph
import svgwrite
import cairosvg
import xml.etree.ElementTree as ET

# Input path (SVG or flattened PNG)
src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/Users/amosjerbi/Desktop/rubber/rubber 3 [Vectorized].svg")
OUT_SUFFIX = "-centerline"
if len(sys.argv) > 2:
    OUT_SUFFIX = sys.argv[2]

WHITE_THRESHOLD = 240
if len(sys.argv) > 3:
    try:
        WHITE_THRESHOLD = int(sys.argv[3])
    except Exception:
        WHITE_THRESHOLD = 240

# Curve simplification / smoothing (tune these for fewer points and smoother curves)
RDP_EPSILON = 6.0  # higher = fewer points
CHAIKIN_ITERS = 2  # higher = smoother curves
STROKE_WIDTH = 15.0
if len(sys.argv) > 4:
    try:
        RDP_EPSILON = float(sys.argv[4])
    except Exception:
        RDP_EPSILON = 6.0
if len(sys.argv) > 5:
    try:
        CHAIKIN_ITERS = int(sys.argv[5])
    except Exception:
        CHAIKIN_ITERS = 2
if len(sys.argv) > 6:
    try:
        STROKE_WIDTH = float(sys.argv[6])
    except Exception:
        STROKE_WIDTH = 15.0

MODE = "centerline"
if len(sys.argv) > 7:
    MODE = str(sys.argv[7]).strip().lower()
    if MODE not in {"centerline", "circle"}:
        MODE = "centerline"

INCLUDE_SHAPES = False
if len(sys.argv) > 8:
    val = str(sys.argv[8]).strip().lower()
    INCLUDE_SHAPES = val in {"1", "true", "yes", "on"}

# Load input and convert to RGBA image + size/viewBox
if src.suffix.lower() in [".png", ".jpg", ".jpeg"]:
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    viewBox = f"0 0 {w} {h}"
    # Remove white background by converting near-white to transparent
    arr = np.array(img)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    white = (r > WHITE_THRESHOLD) & (g > WHITE_THRESHOLD) & (b > WHITE_THRESHOLD)
    a[white] = 0
    arr[:, :, 3] = a
    img = Image.fromarray(arr, "RGBA")
else:
    # Read SVG size/viewBox
    root = ET.parse(src).getroot()
    viewBox = root.attrib.get("viewBox")
    w = int(float(root.attrib.get("width", "832")))
    h = int(float(root.attrib.get("height", "1248")))
    # Rasterize SVG to PNG in memory
    png_bytes = cairosvg.svg2png(bytestring=src.read_bytes(), output_width=w, output_height=h)
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")

arr = np.array(img)
alpha = arr[:, :, 3]
bw = (alpha > 0)

MAX_POINTS_PER_PATH = 500  # split long paths to avoid single giant stroke


def normalize_coords(coords):
    if isinstance(coords, tuple) or isinstance(coords, list):
        if len(coords) == 2 and hasattr(coords[0], "__len__"):
            coords = np.stack([np.asarray(coords[0]), np.asarray(coords[1])], axis=1)
    coords = np.asarray(coords)
    if coords.ndim != 2 or coords.shape[1] != 2:
        raise RuntimeError(f"Unexpected coords shape: {coords.shape}")
    return coords


def rdp(points, epsilon):
    if len(points) < 3:
        return points
    (x1, y1) = points[0]
    (x2, y2) = points[-1]
    dx = x2 - x1
    dy = y2 - y1
    denom = math.hypot(dx, dy)
    max_dist = -1
    index = -1
    for i in range(1, len(points) - 1):
        x0, y0 = points[i]
        if denom == 0:
            dist = math.hypot(x0 - x1, y0 - y1)
        else:
            dist = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / denom
        if dist > max_dist:
            max_dist = dist
            index = i
    if max_dist > epsilon:
        left = rdp(points[:index + 1], epsilon)
        right = rdp(points[index:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def chaikin(points, iterations=2):
    for _ in range(iterations):
        if len(points) < 3:
            return points
        new_pts = [points[0]]
        for i in range(len(points) - 1):
            p0 = points[i]
            p1 = points[i + 1]
            q = (0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1])
            r = (0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1])
            new_pts.extend([q, r])
        new_pts.append(points[-1])
        points = new_pts
    return points


def add_skeleton_paths(dwg, skel_mask):
    if not np.any(skel_mask):
        return
    graph, coords = skeleton_to_csgraph(skel_mask)
    coords = normalize_coords(coords)
    indptr = graph.indptr
    indices = graph.indices

    def neighbors(i):
        return indices[indptr[i]:indptr[i + 1]]

    degree = np.diff(indptr)
    visited = set()

    def mark_edge(a, b):
        visited.add((a, b))
        visited.add((b, a))

    def edge_visited(a, b):
        return (a, b) in visited

    paths = []

    # Build paths by traversing edges from branch/end nodes, using pixel coordinates directly
    start_nodes = np.where(degree != 2)[0]
    for s in start_nodes:
        for n in neighbors(s):
            if edge_visited(s, n):
                continue
            path = [s]
            prev, cur = s, n
            mark_edge(prev, cur)
            while True:
                path.append(cur)
                if degree[cur] != 2:
                    break
                neigh = neighbors(cur)
                nxt = neigh[0] if neigh[1] == prev else neigh[1]
                prev, cur = cur, nxt
                if edge_visited(prev, cur):
                    break
                mark_edge(prev, cur)
            paths.append(path)

    # Handle cycles (all degree==2)
    if start_nodes.size == 0:
        for i in range(len(degree)):
            for n in neighbors(i):
                if edge_visited(i, n):
                    continue
                path = [i]
                prev, cur = i, n
                mark_edge(prev, cur)
                while True:
                    path.append(cur)
                    neigh = neighbors(cur)
                    nxt = neigh[0] if neigh[1] == prev else neigh[1]
                    prev, cur = cur, nxt
                    if edge_visited(prev, cur):
                        break
                    mark_edge(prev, cur)
                    if cur == i:
                        break
                paths.append(path)

    for path in paths:
        if len(path) < 2:
            continue
        idx = np.array(path, dtype=int)
        if idx.max() >= coords.shape[0]:
            raise RuntimeError(
                f"Path index out of bounds: max {idx.max()} vs coords {coords.shape[0]}"
            )
        coords_path = coords[idx]
        points = [(c, r) for r, c in coords_path]
        points = rdp(points, RDP_EPSILON)
        points = chaikin(points, CHAIKIN_ITERS)
        for start in range(0, len(points) - 1, MAX_POINTS_PER_PATH):
            chunk_pts = points[start:start + MAX_POINTS_PER_PATH]
            if len(chunk_pts) < 2:
                continue
            d = "M " + " L ".join(f"{x:.3f},{y:.3f}" for x, y in chunk_pts)
            dwg.add(dwg.path(
                d=d,
                fill="none",
                stroke="black",
                stroke_width=STROKE_WIDTH,
                stroke_linecap="round",
                stroke_linejoin="round",
            ))


def fit_circle_from_mask(mask):
    edge = mask & (~binary_erosion(mask))
    ys, xs = np.nonzero(edge)
    if len(xs) < 40:
        return None
    x = xs.astype(float)
    y = ys.astype(float)
    h_box = y.max() - y.min() + 1
    w_box = x.max() - x.min() + 1
    if h_box <= 2 or w_box <= 2:
        return None
    aspect = w_box / h_box
    if aspect < 0.85 or aspect > 1.15:
        return None
    A = np.column_stack([x, y, np.ones_like(x)])
    b = x * x + y * y
    sol, _, _, _ = np.linalg.lstsq(A, b, rcond=None)
    a, bcoef, c = sol
    cx = a / 2.0
    cy = bcoef / 2.0
    r_sq = c + cx * cx + cy * cy
    if r_sq <= 0:
        return None
    r = math.sqrt(r_sq)
    radii = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    r_mean = radii.mean()
    if r_mean <= 1e-6:
        return None
    r_std = radii.std()
    tol = max(1.5, r_mean * 0.03)
    inliers = np.abs(radii - r_mean) <= tol
    inlier_ratio = float(inliers.mean())
    if (r_std / r_mean) > 0.04 or inlier_ratio < 0.85:
        return None
    angles = np.arctan2(y[inliers] - cy, x[inliers] - cx)
    counts, _ = np.histogram(angles, bins=12, range=(-math.pi, math.pi))
    if (counts > 0).sum() < 9:
        return None
    return (cx, cy, r_mean)

def fit_rect_from_mask(mask):
    edge = mask & (~binary_erosion(mask))
    ys, xs = np.nonzero(edge)
    if len(xs) < 40:
        return None
    minx = float(xs.min())
    maxx = float(xs.max())
    miny = float(ys.min())
    maxy = float(ys.max())
    width = maxx - minx + 1.0
    height = maxy - miny + 1.0
    if width < 3 or height < 3:
        return None
    tol = max(1.0, 0.015 * max(width, height))
    dx1 = np.abs(xs - minx)
    dx2 = np.abs(xs - maxx)
    dy1 = np.abs(ys - miny)
    dy2 = np.abs(ys - maxy)
    dist = np.minimum(np.minimum(dx1, dx2), np.minimum(dy1, dy2))
    inliers = dist <= tol
    if float(inliers.mean()) < 0.92:
        return None
    top = (np.abs(ys - miny) <= tol).sum()
    bottom = (np.abs(ys - maxy) <= tol).sum()
    left = (np.abs(xs - minx) <= tol).sum()
    right = (np.abs(xs - maxx) <= tol).sum()
    total = len(xs)
    edge_min = max(12, int(total * 0.08))
    if min(top, bottom, left, right) < edge_min:
        return None
    return (minx, miny, width, height)


def write_circle_svg():
    labels = label(bw, connectivity=2)
    if labels.max() == 0:
        return False
    out = src.with_name(f"{src.stem}{OUT_SUFFIX}.svg")
    dwg = svgwrite.Drawing(str(out), size=(w, h), viewBox=viewBox)
    for i in range(1, labels.max() + 1):
        mask = labels == i
        circle = fit_circle_from_mask(mask)
        if circle:
            cx, cy, r = circle
            dwg.add(dwg.circle(
                center=(cx, cy),
                r=r,
                fill="none",
                stroke="black",
                stroke_width=STROKE_WIDTH,
                stroke_linecap="round",
                stroke_linejoin="round",
            ))
        else:
            rect = fit_rect_from_mask(mask)
            if rect:
                x, y, rw, rh = rect
                dwg.add(dwg.rect(
                    insert=(x, y),
                    size=(rw, rh),
                    fill="none",
                    stroke="black",
                    stroke_width=STROKE_WIDTH,
                    stroke_linecap="round",
                    stroke_linejoin="round",
                ))
            else:
                skel = skeletonize(mask)
                add_skeleton_paths(dwg, skel)
    dwg.save()
    print(out)
    return True


def add_shapes_layer(dwg, labels):
    for i in range(1, labels.max() + 1):
        mask = labels == i
        circle = fit_circle_from_mask(mask)
        if circle:
            cx, cy, r = circle
            dwg.add(dwg.circle(
                center=(cx, cy),
                r=r,
                fill="#e5e7eb",
                stroke="none",
                opacity=0.6,
            ))
            continue
        rect = fit_rect_from_mask(mask)
        if rect:
            x, y, rw, rh = rect
            dwg.add(dwg.rect(
                insert=(x, y),
                size=(rw, rh),
                fill="#e5e7eb",
                stroke="none",
                opacity=0.6,
            ))
            continue
        contours = find_contours(mask.astype(float), 0.5)
        if not contours:
            continue
        contour = max(contours, key=len)
        points = [(p[1], p[0]) for p in contour]
        points = rdp(points, max(1.0, RDP_EPSILON * 0.5))
        if len(points) < 2:
            continue
        d = "M " + " L ".join(f"{x:.3f},{y:.3f}" for x, y in points) + " Z"
        dwg.add(dwg.path(
            d=d,
            fill="#e5e7eb",
            stroke="none",
            opacity=0.6,
        ))


if MODE == "circle":
    if INCLUDE_SHAPES:
        labels = label(bw, connectivity=2)
        out = src.with_name(f"{src.stem}{OUT_SUFFIX}.svg")
        dwg = svgwrite.Drawing(str(out), size=(w, h), viewBox=viewBox)
        if labels.max() > 0:
            add_shapes_layer(dwg, labels)
        skel = skeletonize(bw > 0)
        add_skeleton_paths(dwg, skel)
        dwg.save()
        print(out)
        sys.exit(0)
    if write_circle_svg():
        sys.exit(0)

# Skeletonize (boolean)
skel = skeletonize(bw > 0)

# Write SVG with centerlines
out = src.with_name(f"{src.stem}{OUT_SUFFIX}.svg")
dwg = svgwrite.Drawing(str(out), size=(w, h), viewBox=viewBox)
if INCLUDE_SHAPES:
    labels = label(bw, connectivity=2)
    if labels.max() > 0:
        add_shapes_layer(dwg, labels)
add_skeleton_paths(dwg, skel)
dwg.save()
print(out)
