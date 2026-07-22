# Upstream attribution

- Work: SSGI+SSR Painter
- Author: mrdoob
- Source: https://codepen.io/mrdoob_/full/LEGjpmd
- Editor source: https://codepen.io/mrdoob/pen/LEGjpmd
- Snapshot date: 2026-07-23
- License: MIT, as declared by the CodePen source page
- Runtime: Three.js 0.185.0 WebGPU / TSL

The baseline preserves the original renderer limits, SSGI/SSR/TRAA graph, TubePainter geometry, wall, RoomEnvironment, material defaults, speed-to-size mapping, rainbow time color, Draw/Orbit toggle, sliders and GLB export.

Compatibility note: the live Pen still calls the old six-argument `ssr()` signature while its unpinned r185 addon now accepts an options object, leaving `camera=null` and logging a TSL build error. The port passes the same metalness, roughness and camera nodes through the new options keys, and uses the renamed `RenderPipeline`, `packNormalToRGB` and `unpackRGBToNormal` aliases. No render parameter or graph order changes.
