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

const presetSelect = document.getElementById("presetSelect");
const includeShapes = document.getElementById("includeShapes");

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

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
]);
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);

const PRESETS = {
  balanced: {
    threshold: 240,
    pointAmount: 60,
    epsilon: 6,
    curveSmooth: 2,
    strokeWidth: 15,
    mode: "centerline",
  },
  accurate: {
    threshold: 245,
    pointAmount: 95,
    epsilon: 2.5,
    curveSmooth: 1,
    strokeWidth: 10,
    mode: "centerline",
  },
  smooth: {
    threshold: 235,
    pointAmount: 80,
    epsilon: 4,
    curveSmooth: 4,
    strokeWidth: 12,
    mode: "centerline",
  },
  clean: {
    threshold: 231,
    pointAmount: 39,
    epsilon: 7,
    curveSmooth: 2,
    strokeWidth: 15,
    mode: "centerline",
  },
  bold: {
    threshold: 230,
    pointAmount: 50,
    epsilon: 7,
    curveSmooth: 3,
    strokeWidth: 18,
    mode: "centerline",
  },
  circle: {
    threshold: 240,
    pointAmount: 80,
    epsilon: 3,
    curveSmooth: 2,
    strokeWidth: 12,
    mode: "circle",
  },
};

let outputMode = PRESETS.clean.mode;

function isSupportedFile(file) {
  if (!file) return false;
  if (file.type && SUPPORTED_MIME_TYPES.has(file.type)) return true;
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  const ext = name.slice(dot).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
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

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  syncingSliders = true;
  sliders.whiteThreshold.value = preset.threshold;
  sliders.pointAmount.value = preset.pointAmount;
  sliders.epsilon.value = preset.epsilon;
  sliders.curveSmooth.value = preset.curveSmooth;
  sliders.strokeWidth.value = preset.strokeWidth;
  outputMode = preset.mode || "centerline";
  updateReadouts();
  syncingSliders = false;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(generateCenterlinePreview, 100);
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

if (presetSelect) {
  presetSelect.addEventListener("change", () => {
    applyPreset(presetSelect.value);
  });
}

if (includeShapes) {
  includeShapes.addEventListener("change", () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(generateCenterlinePreview, 100);
  });
}

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
  fd.append("mode", outputMode);
  fd.append("shapes", includeShapes && includeShapes.checked ? "1" : "0");
  const res = await fetch(`${API_BASE}/centerline`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  const svg = await res.text();
  item.svg = svg;
  return svg;
}

async function generateCenterlinePreview() {
  if (isStaticDemo && !API_BASE) {
    preview.textContent = "Preview requires the Python server. Run server.py locally or set API_BASE to your Render URL.";
    return;
  }
  if (!selectedId) {
    preview.textContent = "Drag & drop an image to auto‑generate the centerline preview.";
    preview.style.display = "none";
    setPillDisabled(downloadLink, true);
    setPillDisabled(copyBtn, true);
    return;
  }
  preview.textContent = "Generating centerline...";
  try {
    const svg = await generateCenterlineFor(selectedId);
    const item = state.get(selectedId);
    preview.classList.remove("pending");
    setPreviewContent(svg);
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
  if (!API_BASE) return;
  const fd = new FormData();
  fd.append("file", new Blob([], { type: "image/png" }), "warmup.png");
  fd.append("threshold", sliders.whiteThreshold.value);
  fd.append("epsilon", sliders.epsilon.value || mapPointsToEpsilon(sliders.pointAmount.value));
  fd.append("curve", sliders.curveSmooth.value);
  fd.append("stroke", sliders.strokeWidth.value);
  fd.append("mode", outputMode);
  fd.append("shapes", includeShapes && includeShapes.checked ? "1" : "0");
  fetch(`${API_BASE}/centerline`, { method: "POST", body: fd }).catch(() => {});
}

async function copySvgToClipboard() {
  if (!selectedId) return;
  const item = state.get(selectedId);
  if (!item) return;
  let svg = item.svg;
  if (!svg) {
    try {
      svg = await generateCenterlineFor(selectedId);
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
  if (presetSelect) {
    applyPreset(presetSelect.value);
  }
  warmBackend();
});
