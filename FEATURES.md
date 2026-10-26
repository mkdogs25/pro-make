# Feature coverage

ProMake is one browser app inspired by four large desktop programs. Those programs have decades of work and millions of lines of code behind them, so ProMake does not match them feature for feature. This page says plainly what is in, what is partly there, and what is not.

Legend: ✅ built · 🟡 partly there (limits noted) · ⬜ not built

## Motion (video) · inspired by Shotcut

| Area | Status |
|---|---|
| Multi-track timeline: add, rename, reorder, hide, mute, **solo**, lock, tall tracks | ✅ |
| Move, trim, split, duplicate, copy/paste clips, ripple delete, ripple trim, snapping | ✅ |
| Insert, overwrite and append from the **source player** with mark in/out | ✅ |
| Markers, in/out points, play range, zoom and fit | ✅ |
| **Transitions** by overlapping clips: dissolve, 4 wipes, 2 slides, zoom, iris, barn doors, dip to black | ✅ |
| Colour grading: brightness, contrast, saturation, hue, blur, greyscale, sepia | ✅ |
| **Filter stack** per clip: chroma key, crop, mirror, flip, rotate/zoom, invert, tint, duotone, vignette, glow, sharpen, pixelate, posterise, film grain, wave | ✅ |
| **Keyframes** on position, scale, rotation, opacity and volume, with easing | ✅ |
| Animate page artwork (object keyframes) inside scene clips | ✅ |
| Titles with font, outline, shadow, box, alignment and animation (fade, slide, zoom, typewriter) | ✅ |
| Generators: colour, colour bars, countdown | ✅ |
| Speed change, freeze frame, detach audio, fade in/out | ✅ |
| Audio: waveforms, per-clip and per-track volume, pan, master volume, peak meter | ✅ |
| Scopes: histogram and brightness waveform | ✅ |
| Export: WebM/MP4 (browser dependent), animated GIF, PNG sequence (.zip), audio only; size, fps, bitrate, range | ✅ |
| Video and audio render in real time (browser recorder) | 🟡 |
| Reverse playback, LUT/3D LUT, audio EQ/compressor, keyframes on filter parameters | ⬜ |
| Proxy/hardware editing, multi-camera, subtitle tracks, MLT/EDL import-export | ⬜ |

## Ink (vector) · inspired by Inkscape

| Area | Status |
|---|---|
| Bézier pen, freehand pencil, line, rectangle (corner radius), ellipse, star/polygon, spiral, calligraphy, text | ✅ |
| Node editing: move, add, delete, smooth/corner, line/curve segments, join ends, break path | ✅ |
| Boolean operations: union, difference, intersection, exclusion, division; combine, break apart | ✅ |
| Path tools: object to path, **stroke to path**, inset/outset, simplify, reverse, add nodes, auto-smooth, roughen | ✅ |
| **Groups** and **clip masks** | ✅ |
| **Trace bitmap** (single path or colour bands) | ✅ |
| **Tiled clones** with per-step rotation, scale and fade | ✅ |
| **Text on a path**, **text to outlines** | ✅ |
| Fills: flat, linear/radial gradients with stops, **patterns**; strokes with dash, caps, joins, **line-end markers** | ✅ |
| Effects: blur, drop shadow; 16 blend modes; layer opacity and visibility | ✅ |
| Transform dialog: move, scale, rotate, **skew**; align, distribute, flip, z-order | ✅ |
| Rulers (px/mm/in/pt), guides, grid, snapping to guides, objects, page and grid | ✅ |
| Symbols library (28 shapes), colour mixer (RGB, HSL, CMYK), palettes | ✅ |
| Measure tool, eyedropper | ✅ |
| SVG import/export (gradients, patterns, clips, filters, text on path), export selection | ✅ |
| Gradient handles on the canvas | 🟡 (edited in the panel; the gradient tool sets direction) |
| Clones that stay linked to the original, opacity masks | ⬜ |
| Mesh gradients, path-effect stack, XML editor, SVG filter editor | ⬜ |
| Spray, tweak and connector tools, pattern along path, variable-width strokes | ⬜ |
| Extensions in Python | 🟡 (JavaScript script console instead) |

## Print (layout) · inspired by Scribus

| Area | Status |
|---|---|
| Multi-page documents, size presets or custom, reorder/duplicate/delete pages | ✅ |
| **Master pages** with automatic page numbers; margins, column guides, **bleed** | ✅ |
| Text frames with columns and gutters; **threaded frames** across pages; overflow markers | ✅ |
| **Text wrap** around objects; **drop caps**; first-line indent, paragraph spacing, vertical alignment, word spacing, outline | ✅ |
| Rich text markup (**bold**, *italic*); paragraph styles that update every frame using them | ✅ |
| **Story editor**, **find & replace** across the whole document | ✅ |
| **Image frames**: fit, fill, stretch, original size; zoom, rotate and pan inside the frame; replace by drop | ✅ |
| **Tables**: rows, columns, header row, shading, borders, cell editing | ✅ |
| Shapes, pen, lines, polygons, symbols, colour mixer with CMYK values | ✅ |
| Baseline grid, grid and guides with snapping; rulers in px/mm/in/pt | ✅ |
| Non-printing layers; preflight (overflow, low resolution, empty frames, objects off page) | ✅ |
| **Table of contents** generator; document statistics | ✅ |
| **PDF export**: pages, 150–450 ppi, bleed, **crop marks**, greyscale, bookmarks, clickable links, vector option | ✅ |
| PDF is image-based by default; the vector option uses standard fonts and drops some effects | 🟡 |
| Facing-page spreads, hyphenation, character styles, footnotes, OpenType features | ⬜ |
| CMYK/spot-colour output, PDF/X, EPS, forms, linked (not embedded) images, imposition | ⬜ |

## Grain (pixel) · inspired by GIMP

| Area | Status |
|---|---|
| Pixel layers with opacity, 16 blend modes, **layer masks**, **lock transparency** | ✅ |
| Merge down, merge visible, new from visible, layer to image size, crop to content, layer via copy/cut | ✅ |
| Selections: rectangle, ellipse, free, fuzzy, **by colour**; add, subtract, intersect | ✅ |
| Grow, shrink, feather, border, remove feathering; **quick mask**; save/load **channels**; from transparency, from shapes, **to path**; stroke selection | ✅ |
| Brushes: paintbrush, pencil, **airbrush**, eraser, smudge, **blur**, **sharpen**, clone, **heal**, dodge, burn | ✅ |
| Brush options: size, hardness, opacity, flow, **shapes**, angle, aspect, spacing, scatter, size variation, **symmetry** (mirror, radial), pen pressure | ✅ |
| Bucket fill (contiguous or global, from all layers), **gradients** (linear, radial, conical, square, bi-linear, repeat, to transparent), colour picker with averaging | ✅ |
| Colours: brightness/contrast, hue/saturation, **levels**, **curves editor**, colour balance, colorize, exposure, shadows/highlights, temperature, auto levels, equalise, B&W mixer, gradient map, colour to alpha, invert, sepia, posterise, threshold, solarise | ✅ |
| Filters: Gaussian, motion and zoom blur, median, sharpen, unsharp mask, noise, ripple, whirl & pinch, lens, pixelate, halftone, oilify, cartoon, emboss, dither, vignette, glow, drop shadow, edge detect, clouds, checkerboard | ✅ |
| Live preview with histogram; applied inside the selection | ✅ |
| Image: scale, canvas size, rotate, flip, crop to selection/content, flatten | ✅ |
| **Undo history** panel (jump to any step) | ✅ |
| Open PNG, JPEG, WebP, GIF, BMP, SVG and **OpenRaster (.ora)**; save PNG, JPEG, WebP, **.ora** (layers kept; opens in GIMP and Krita) | ✅ |
| Non-destructive filter layers, layer groups | ⬜ |
| Perspective, warp and cage transforms, foreground select, scissors | ⬜ |
| XCF/PSD files, ICC colour management, 16/32-bit colour | ⬜ |
| Python/Script-Fu | 🟡 (JavaScript script console instead) |

## Across the whole app

| Area | Status |
|---|---|
| One shared document: artwork carries across all four studios; pages can be placed inside other pages, animated as scenes, rasterised, and traced back to vectors | ✅ |
| **Script console** with a `promake` API for drawing, layout, pixels and video | ✅ |
| Parchment light theme and dark theme; responsive layout | ✅ |
| Autosave in the browser; `.promake` project files with embedded media | ✅ |
| Undo/redo with a labelled history; keyboard shortcuts (press `?`) | ✅ |
| Real-time collaboration, cloud storage, plug-in marketplace | ⬜ |
