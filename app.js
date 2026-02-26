const canvas = document.getElementById("canvas");
const fileInput = document.getElementById("fileInput");
const addImageBtn = document.getElementById("addImageBtn");
// thumbs removed

const sliders = {
  whiteThreshold: document.getElementById("whiteThreshold"),
  pointAmount: document.getElementById("pointAmount"),
  epsilon: document.getElementById("epsilon"),
  curveSmooth: document.getElementById("curveSmooth"),
  strokeWidth: document.getElementById("strokeWidth"),
};

const readouts = {
  whiteVal: document.getElementById("whiteVal"),
  pointVal: document.getElementById("pointVal"),
  epsilonVal: document.getElementById("epsilonVal"),
  curveVal: document.getElementById("curveVal"),
  strokeVal: document.getElementById("strokeVal"),
};

const shapeControls = {
  group: document.getElementById("shapeDetectionGroup"),
  summary: document.getElementById("shapeDetectionSummary"),
  toggle: document.getElementById("shapeDetectToggle"),
  warning: document.getElementById("shapeWarning"),
  options: document.getElementById("shapeOptions"),
  detectRects: document.getElementById("detectRects"),
  detectEllipses: document.getElementById("detectEllipses"),
  confidence: document.getElementById("shapeConfidence"),
  confidenceVal: document.getElementById("shapeConfidenceVal"),
  cornerWrap: document.getElementById("cornerToleranceWrap"),
  cornerTol: document.getElementById("cornerTolerance"),
  cornerTolVal: document.getElementById("cornerToleranceVal"),
  highlight: document.getElementById("highlightShapes"),
};

const resetBtn = document.getElementById("resetBtn");
const deleteBtn = document.getElementById("deleteBtn");
// centerlineAll removed
const preview = document.getElementById("preview");
const downloadLink = document.getElementById("downloadLink");
const copyBtn = document.getElementById("copyBtn");
let liveTimer = null;
let syncingSliders = false;
let viewScale = 1;
let viewX = 0;
let viewY = 0;

const state = new Map();
let selectedId = null;
let zCounter = 1;
const STATIC_HOSTS = new Set(["tracer.ajerbi.com", "www.tracer.ajerbi.com"]);
const isStaticDemo =
  window.location.hostname.endsWith("github.io") ||
  STATIC_HOSTS.has(window.location.hostname);
const API_BASE = isStaticDemo ? "https://tracer-backend-ib4x.onrender.com" : "";
let shapeRunId = 0;
let shapeWorker = null;
let shapeWorkerRequestId = 0;
const shapeWorkerCallbacks = new Map();

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
]);
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);

function isSupportedFile(file) {
  if (!file) return false;
  if (file.type && SUPPORTED_MIME_TYPES.has(file.type)) return true;
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  const ext = name.slice(dot).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function isShapeDetectionEnabled() {
  return !!(shapeControls.toggle && shapeControls.toggle.checked);
}

function getShapeTolerance() {
  const value = Number(shapeControls.confidence?.value || 70);
  return Math.max(0, Math.min(1, value / 100));
}

function updateShapeUI() {
  if (!shapeControls.toggle) return;
  const enabled = isShapeDetectionEnabled();
  if (shapeControls.options) shapeControls.options.hidden = !enabled;
  if (shapeControls.confidenceVal) shapeControls.confidenceVal.textContent = shapeControls.confidence.value;
  if (shapeControls.cornerTolVal) shapeControls.cornerTolVal.textContent = `${shapeControls.cornerTol.value}px`;
  if (shapeControls.cornerWrap) {
    const showCorner = shapeControls.detectRects?.checked;
    shapeControls.cornerWrap.style.display = showCorner ? "block" : "none";
  }
}

function setPillDisabled(el, disabled) {
  if (!el) return;
  el.classList.toggle("disabled", disabled);
  el.setAttribute("aria-disabled", disabled ? "true" : "false");
}

function setSelected(id) {
  selectedId = id;
  document.querySelectorAll(".draggable").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === id);
  });
  syncControls();
  const item = state.get(id);
  const hasSvg = item && item.svg;
  setPillDisabled(downloadLink, !hasSvg);
  setPillDisabled(copyBtn, !hasSvg);
}

function syncControls() {
  updateReadouts();
}

function mapPointsToEpsilon(points) {
  const p = Number(points);
  const t = Math.max(10, Math.min(100, p));
  // Map 10..100 points -> epsilon 10..1 (more points = smaller epsilon)
  const eps = 10 - ((t - 10) / 90) * 9;
  return eps.toFixed(2);
}

function mapEpsilonToPoints(epsilon) {
  const e = Number(epsilon);
  const t = Math.max(1, Math.min(10, e));
  // Map epsilon 10..1 -> points 10..100 (inverse of above)
  const pts = 10 + ((10 - t) / 9) * 90;
  return Math.round(pts);
}

function updateReadouts() {
  readouts.whiteVal.textContent = sliders.whiteThreshold.value;
  readouts.pointVal.textContent = sliders.pointAmount.value;
  readouts.epsilonVal.textContent = sliders.epsilon.value;
  readouts.curveVal.textContent = sliders.curveSmooth.value;
  readouts.strokeVal.textContent = sliders.strokeWidth.value;
}

function applyTransform(item) {
  const el = item.el;
  el.style.transform = `translate(${item.x}px, ${item.y}px)`;
  el.style.zIndex = item.z;
}

function addImage(file, dataUrl) {
  const id = crypto.randomUUID();
  const img = new Image();
  img.src = dataUrl;
  img.className = "draggable";
  img.dataset.id = id;
  img.onload = () => {
    const item = {
      src: dataUrl,
      id,
      el: img,
      z: zCounter++,
      svg: null,
      file,
    };
    state.set(id, item);
    setSelected(id);
    setPending("Upload processing — this may take a few minutes.");
    if (!isStaticDemo || API_BASE) {
      requestAnimationFrame(() => generateCenterlinePreview());
    } else {
      preview.textContent = "Preview requires the Python server. Run server.py locally or set API_BASE to your Render URL.";
    }
    // no thumbs
  };

  img.addEventListener("click", () => setSelected(id));
}

function startDrag(e, id) {
  e.preventDefault();
  const item = state.get(id);
  if (!item) return;
  setSelected(id);
  const startX = e.clientX;
  const startY = e.clientY;
  const baseX = item.x;
  const baseY = item.y;

  function onMove(ev) {
    item.x = baseX + (ev.clientX - startX);
    item.y = baseY + (ev.clientY - startY);
    applyTransform(item);
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function handleFiles(files) {
  [...files].forEach((file) => {
    if (!isSupportedFile(file)) return;
    const reader = new FileReader();
    reader.onload = (e) => addImage(file, e.target.result);
    reader.readAsDataURL(file);
  });
}

fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
if (addImageBtn) {
  addImageBtn.addEventListener("click", () => fileInput.click());
}

canvas.addEventListener("dragover", (e) => {
  e.preventDefault();
  canvas.classList.add("dragging");
});
canvas.addEventListener("dragleave", () => canvas.classList.remove("dragging"));
canvas.addEventListener("drop", (e) => {
  e.preventDefault();
  canvas.classList.remove("dragging");
  handleFiles(e.dataTransfer.files);
});

// Prevent the browser from opening the file on drop
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

Object.entries(sliders).forEach(([key, input]) => {
  input.addEventListener("input", () => {
    if (syncingSliders) return;
    syncingSliders = true;
    if (key === "pointAmount") {
      sliders.epsilon.value = mapPointsToEpsilon(input.value);
    } else if (key === "epsilon") {
      sliders.pointAmount.value = mapEpsilonToPoints(input.value);
    }
    updateReadouts();
    syncingSliders = false;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(generateCenterlinePreview, 300);
  });
});

if (shapeControls.toggle) {
  shapeControls.toggle.addEventListener("change", () => {
    if (shapeControls.warning) shapeControls.warning.hidden = true;
    updateShapeUI();
    generateCenterlinePreview();
  });
}


[
  shapeControls.detectRects,
  shapeControls.detectEllipses,
  shapeControls.confidence,
  shapeControls.cornerTol,
  shapeControls.highlight,
].forEach((input) => {
  if (!input) return;
  input.addEventListener("input", () => {
    updateShapeUI();
    clearTimeout(liveTimer);
    liveTimer = setTimeout(generateCenterlinePreview, 200);
  });
});

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    const item = state.get(selectedId);
    if (!item) return;
    applyTransform(item);
    syncControls();
  });
}

if (deleteBtn) {
  deleteBtn.addEventListener("click", () => {
    const item = state.get(selectedId);
    if (!item) return;
    item.el.remove();
    state.delete(selectedId);
    selectedId = null;
    setPillDisabled(downloadLink, true);
    setPillDisabled(copyBtn, true);
    preview.textContent = "Drag & drop a PNG, JPG, or SVG to auto‑generate the centerline preview.";
    preview.style.display = "none";
    updatePreviewBadge(null, false);
    updatePreviewLegend(false);
  });
}

async function renderSelectedToBlob(id = selectedId) {
  const item = state.get(id);
  if (!item) return null;
  const img = item.el;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cw = w;
  const ch = h;
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  return await new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

function renderSelectedToCanvas(id = selectedId) {
  const item = state.get(id);
  if (!item) return null;
  const img = item.el;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

function buildDetectionCanvas(sourceCanvas, maxDim = 1024) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const maxSide = Math.max(w, h);
  if (maxSide <= maxDim) return { canvas: sourceCanvas, scale: 1 };
  const scale = maxDim / maxSide;
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  const c = document.createElement("canvas");
  c.width = dw;
  c.height = dh;
  const ctx = c.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0, dw, dh);
  return { canvas: c, scale };
}

function getShapeWorker() {
  if (shapeWorker) return shapeWorker;
  shapeWorker = new Worker("shape-worker.js");
  shapeWorker.onmessage = (e) => {
    const { id, ok, result, error } = e.data || {};
    const handler = shapeWorkerCallbacks.get(id);
    if (!handler) return;
    shapeWorkerCallbacks.delete(id);
    if (ok) handler.resolve(result);
    else handler.reject(new Error(error || "Shape detection failed"));
  };
  shapeWorker.onerror = () => {
    shapeWorkerCallbacks.forEach(({ reject }) => reject(new Error("Shape detection worker error")));
    shapeWorkerCallbacks.clear();
  };
  return shapeWorker;
}

function runShapeWorker(imageData, scale, options) {
  let worker;
  try {
    worker = getShapeWorker();
  } catch (err) {
    return Promise.reject(err);
  }
  const id = ++shapeWorkerRequestId;
  return new Promise((resolve, reject) => {
    shapeWorkerCallbacks.set(id, { resolve, reject });
    worker.postMessage(
      {
        id,
        type: "detect",
        payload: {
          width: imageData.width,
          height: imageData.height,
          buffer: imageData.data.buffer,
          scale,
          options,
        },
      },
      [imageData.data.buffer]
    );
  });
}

async function generateCenterlineFor(id) {
  const item = state.get(id);
  if (!item) return;
  const uploadBlob = item.file || await renderSelectedToBlob(id);
  if (!uploadBlob) return;
  const fd = new FormData();
  if (uploadBlob instanceof File) {
    fd.append("file", uploadBlob, uploadBlob.name);
  } else {
    fd.append("file", uploadBlob, "preview.png");
  }
  fd.append("threshold", sliders.whiteThreshold.value);
  fd.append("epsilon", sliders.epsilon.value || mapPointsToEpsilon(sliders.pointAmount.value));
  fd.append("curve", sliders.curveSmooth.value);
  fd.append("stroke", sliders.strokeWidth.value);
  const res = await fetch(`${API_BASE}/centerline`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  const svg = await res.text();
  item.svg = svg;
  return svg;
}

async function generateShapeSvgFor(id) {
  const item = state.get(id);
  if (!item) return null;
  const canvas = renderSelectedToCanvas(id);
  if (!canvas) return null;
  const { canvas: detectCanvas, scale } = buildDetectionCanvas(canvas, 1024);
  const ctx = detectCanvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, detectCanvas.width, detectCanvas.height);
  const type = item.file?.type || "";
  const name = item.file?.name || "";
  const isJpeg = type === "image/jpeg" || name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg");
  const options = {
    threshold: Number(sliders.whiteThreshold.value),
    shapeTolerance: getShapeTolerance(),
    detectRects: !!shapeControls.detectRects?.checked,
    detectEllipses: !!shapeControls.detectEllipses?.checked,
    cornerTolerance: Number(shapeControls.cornerTol?.value || 0) * scale,
    highlight: !!shapeControls.highlight?.checked,
    pathEpsilon: Number(sliders.epsilon.value) * scale,
    curveSmooth: Number(sliders.curveSmooth.value),
    strokeWidth: Number(sliders.strokeWidth.value),
    isJpeg,
    originalWidth: canvas.width,
    originalHeight: canvas.height,
  };
  return await runShapeWorker(imageData, scale, options);
}

async function generateCenterlinePreview() {
  if (!selectedId) {
    preview.textContent = "Drag & drop an image to auto‑generate the centerline preview.";
    preview.style.display = "none";
    setPillDisabled(downloadLink, true);
    setPillDisabled(copyBtn, true);
    return;
  }
  preview.textContent = "Generating centerline...";
  try {
    const item = state.get(selectedId);
    if (!item) return;
    if (isShapeDetectionEnabled()) {
      const runId = ++shapeRunId;
      let result;
      try {
        result = await generateShapeSvgFor(selectedId);
      } catch (err) {
        if (shapeControls.warning) shapeControls.warning.hidden = false;
        if (shapeControls.toggle) {
          shapeControls.toggle.checked = false;
          shapeControls.toggle.disabled = true;
        }
        throw err;
      }
      if (runId !== shapeRunId) return;
      if (!result) throw new Error("Shape detection failed");
      item.svg = result.svg;
      item.previewSvg = result.previewSvg;
      item.shapeCounts = result.counts;
      preview.classList.remove("pending");
      setPreviewContent(result.previewSvg);
      updatePreviewBadge(result.counts, !!shapeControls.highlight?.checked);
      updatePreviewLegend(!!shapeControls.highlight?.checked);
      const blob = new Blob([result.svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      if (downloadLink) {
        downloadLink.href = url;
        downloadLink.download = `${selectedId}-centerline.svg`;
      }
      setPillDisabled(downloadLink, false);
      setPillDisabled(copyBtn, false);
      return;
    }

    if (isStaticDemo && !API_BASE) {
      preview.textContent = "Preview requires the Python server. Run server.py locally or set API_BASE to your Render URL.";
      return;
    }

    const svg = await generateCenterlineFor(selectedId);
    preview.classList.remove("pending");
    setPreviewContent(svg);
    updatePreviewBadge(null, false);
    updatePreviewLegend(false);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    if (downloadLink) {
      downloadLink.href = url;
      downloadLink.download = `${selectedId}-centerline.svg`;
    }
    setPillDisabled(downloadLink, false);
    setPillDisabled(copyBtn, false);
  } catch (err) {
    if (String(err).includes("405")) {
      preview.classList.remove("pending");
      preview.textContent = "Preview needs the local Python server (POST not allowed on GitHub Pages).";
    } else {
      preview.classList.remove("pending");
    preview.textContent = "Preview failed.";
    }
    setPillDisabled(copyBtn, true);
    updatePreviewBadge(null, false);
    updatePreviewLegend(false);
    console.error(err);
  }
}



function setPreviewContent(svgText) {
  preview.innerHTML = "";
  preview.style.display = "grid";
  const viewport = document.createElement("div");
  viewport.className = "preview-viewport";
  const content = document.createElement("div");
  content.className = "preview-content";
  content.innerHTML = svgText;
  viewport.appendChild(content);
  preview.appendChild(viewport);
  viewScale = 1;
  viewX = 0;
  viewY = 0;
  applyPreviewTransform();

  let dragging = false;
  let startX = 0;
  let startY = 0;
  viewport.addEventListener("pointerdown", (e) => {
    dragging = true;
    viewport.classList.add("grabbing");
    startX = e.clientX;
    startY = e.clientY;
  });
  window.addEventListener("pointerup", () => {
    dragging = false;
    viewport.classList.remove("grabbing");
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    viewX += e.clientX - startX;
    viewY += e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;
    applyPreviewTransform();
  });
  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * -0.1;
    viewScale = Math.max(0.2, Math.min(5, viewScale + delta));
    applyPreviewTransform();
  }, { passive: false });
}

function applyPreviewTransform() {
  const content = preview.querySelector(".preview-content");
  if (!content) return;
  content.style.transform = `translate(${viewX}px, ${viewY}px) scale(${viewScale}) translate(-50%, -50%)`;
}

function updatePreviewBadge(counts, enabled) {
  const existing = preview.querySelector(".preview-badge");
  if (!enabled || !counts) {
    if (existing) existing.remove();
    return;
  }
  const label = `${counts.rects} rects · ${counts.ellipses} ellipses · ${counts.paths} paths`;
  if (existing) {
    existing.textContent = label;
    return;
  }
  const badge = document.createElement("div");
  badge.className = "preview-badge";
  badge.textContent = label;
  preview.appendChild(badge);
}

function updatePreviewLegend(enabled) {
  const existing = preview.querySelector(".preview-legend");
  if (!enabled) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return;
  const legend = document.createElement("div");
  legend.className = "preview-legend";
  legend.innerHTML = `
    <span class="legend-item rect">Rect</span>
    <span class="legend-item ellipse">Ellipse</span>
    <span class="legend-item path">Path</span>
  `;
  preview.appendChild(legend);
}



window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if (e.key === "+" || (e.key === "=" && e.shiftKey)) {
    viewScale = Math.min(5, viewScale + 0.2);
    applyPreviewTransform();
  } else if (e.key === "-" || e.key === "_") {
    viewScale = Math.max(0.2, viewScale - 0.2);
    applyPreviewTransform();
  }
});


function setPending(message) {
  preview.classList.add("pending");
  preview.innerHTML = `
    <div class="pending-wrap">
      <div class="splash"><span></span><span></span><span></span></div>
      <div>${message}</div>
    </div>
  `;
  preview.style.display = "grid";
}


function warmBackend() {
  if (!API_BASE || isShapeDetectionEnabled()) return;
  const fd = new FormData();
  fd.append("file", new Blob([], { type: "image/png" }), "warmup.png");
  fd.append("threshold", sliders.whiteThreshold.value);
  fd.append("epsilon", sliders.epsilon.value || mapPointsToEpsilon(sliders.pointAmount.value));
  fd.append("curve", sliders.curveSmooth.value);
  fd.append("stroke", sliders.strokeWidth.value);
  fetch(`${API_BASE}/centerline`, { method: "POST", body: fd }).catch(() => {});
}

async function copySvgToClipboard() {
  if (!selectedId) return;
  const item = state.get(selectedId);
  if (!item) return;
  let svg = item.svg;
  if (!svg) {
    try {
    if (isShapeDetectionEnabled()) {
      const result = await generateShapeSvgFor(selectedId);
      svg = result?.svg;
      if (result) {
        item.svg = result.svg;
        item.previewSvg = result.previewSvg;
        item.shapeCounts = result.counts;
        setPreviewContent(result.previewSvg);
        updatePreviewBadge(result.counts, !!shapeControls.highlight?.checked);
        updatePreviewLegend(!!shapeControls.highlight?.checked);
      }
    } else {
        svg = await generateCenterlineFor(selectedId);
      }
      if (svg) item.svg = svg;
    } catch (err) {
      console.error(err);
      return;
    }
  }
  if (!svg) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(svg);
      copyBtn.textContent = "Copied";
    } else {
      const ta = document.createElement("textarea");
      ta.value = svg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      copyBtn.textContent = "Copied";
    }
  } catch (err) {
    console.error(err);
  } finally {
    setTimeout(() => {
      if (copyBtn) copyBtn.textContent = "Copy SVG";
    }, 1200);
  }
}

if (copyBtn) {
  copyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (copyBtn.classList.contains("disabled")) return;
    copySvgToClipboard();
  });
}


window.addEventListener("load", () => {
  warmBackend();
  updateShapeUI();
});
