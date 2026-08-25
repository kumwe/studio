---
'@kumwe/studio': patch
---

Keep measured direct-canvas regions in the iframe's unscaled CSS-pixel coordinate space. The preview
stage now owns responsive overflow while the iframe and its explicitly viewport-sized SVG overlay
share the same scroll surface, so compact, medium, and expanded canvases remain aligned while panning.
