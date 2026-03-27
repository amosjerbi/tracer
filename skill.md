---
name: lineart-colorfill-editor
description: Use when maintaining or extending the local LineArt color-fill HTML app in this workspace, especially for palette behavior, SVG import fill quality, edge sealing, outer-mask smoothing, and fill-region interactions.
---

# LineArt Color Fill Editor

Target file:
- `lineart-colorfill-v1.html`

Primary behaviors to preserve:
- Bucket fill should reach the lineart edge with same-color bleed under the black stroke.
- Imported SVG lineart should build its fill blocker from stroked paths, not filled paths.
- Imported SVGs need stronger gap sealing than raster-generated lineart.
- Large imported-SVG outer fills should be smoothed to ignore raster stair-step artifacts.
- Raster image conversion should auto-apply the `angular` preset.
- All presets and reset defaults should set `Fill Gap Seal` to `0`.

UI constraints:
- No checkerboard canvas background.
- Toolbar should not expose erase.
- Palette should show exactly 5 paint swatches.
- Double-clicking a paint swatch should edit that swatch color.
- Palette colors should persist with `localStorage`.
- There should be a dedicated `BG` swatch for canvas background color.
- Background color should persist with `localStorage`.
- PNG and SVG exports should use the selected background color.

Interaction constraints:
- Single click fills.
- Double-clicking a filled region should enter drag/move behavior for that region.
- Moving a filled region must preserve undo/redo correctly.
- Delay mouse single-click fill slightly so double-click can cancel it cleanly.

Imported SVG handling:
- Treat imported SVG art separately from generated lineart.
- Preserve imported `stroke-width`.
- Use stronger blocker stroke inflation and stronger baseline gap sealing for imported SVGs.
- Smooth fill contours for imported SVGs more aggressively than generated fills.
- Apply the strongest smoothing to the large outer region so the mask looks clean.

Implementation notes:
- Fill-region paths in this app are simple `M/L/.../Z` path data, so translation-based movement can update coordinates directly.
- When rebuilding the palette, do not remove the `BG` swatch; only rebuild paint swatches.
- Keep fill rendering/export behavior visually consistent between on-screen SVG, PNG export, and SVG export.
