# ProMake

ProMake is one browser studio that combines four kinds of creative editor. Every mode works on the **same document**, so a graphic drawn in one mode appears, live, in all the others.

| Mode | Kind | Inspired by | What it does |
|---|---|---|---|
| **Motion** | Video | Shotcut | Multi-track timeline, keyframe animation, titles, media clips, fades, speed, filters, WebM/MP4 export |
| **Ink** | Vector | Inkscape | Bézier pen, pencil, shapes, stars and polygons, node editing, gradients, boolean path operations, SVG import/export |
| **Print** | Layout | Scribus | Multi-page documents, master pages, margins, columns and bleed, threaded text frames, paragraph styles, preflight, PDF export |
| **Grain** | Pixel | GIMP | Brushes, eraser, smudge, clone, dodge and burn, selections (rectangle, ellipse, lasso, fuzzy), bucket and gradient fills, 16 filters, cropping |

Switch modes from the top bar, or press **Alt+1 … Alt+4**.

## How the modes connect

- **Pages are artboards.** The page you draw on in Ink is the canvas you paint on in Grain.
- **Print places pages inside pages.** In the sample, the *Field Notes* layout contains a live placement of the *Balloon Journey* artwork.
- **Motion animates pages.** A *scene clip* on the timeline plays a page, with keyframes on position, rotation, scale and opacity. With auto-key on, dragging objects in the Motion preview records keyframes.
- **Vector to pixel.** *Rasterise* turns any vector, text or placed object into a pixel layer that Grain tools can paint on.

## Features

**Shared:** layers (visibility, lock, opacity, blend modes), properties inspector, colour palette, undo/redo, copy/paste/duplicate, rulers and guides, snapping, zoom and pan, keyboard shortcuts (press `?`), a parchment light theme and a dark theme, local autosave in IndexedDB, and `.promake` project files with embedded media.

**Motion:** video and audio tracks (add, rename, hide, mute, lock), drag-and-drop from the media bin, moving clips between tracks, trimming, splitting (`S`), ripple delete, snapping, fade in/out, speed, volume, brightness/contrast/saturation/hue/blur/greyscale/sepia, title generator, audio waveforms, a keyframe lane with drag-to-retime, looping, frame stepping, and real-time video rendering with audio.

**Ink:** select, move, scale and rotate (Shift to constrain, Alt-drag to duplicate); node editing (drag nodes and handles, double-click to add, Delete or Alt-click to remove, smooth/corner); Bézier pen; freehand pencil with smoothing; rectangles with corner radius; ellipses; stars and polygons; text; linear and radial gradients with stop editing; the gradient tool; eyedropper; union, difference, intersection, exclusion and division; object to path, simplify, reverse, combine and break apart; align and distribute; z-order; flip; dashes, caps and joins; SVG import and export.

**Print:** page presets (A4, A5, Letter, square, HD, story), master pages with automatic `{page}` numbers, margins, column guides, bleed, multi-column text frames, text threading across frames and pages (Link tool) with overflow markers, paragraph styles that update every frame that uses them, frame backgrounds, image placement, page thumbnails and reordering, preflight checks (overflowing text, low-resolution images, objects off the page), and multi-page PDF export at 300 ppi.

**Grain:** paintbrush (size, hardness, opacity, flow), pencil, eraser, smudge, clone (Alt-click a source), dodge, burn, bucket fill with threshold, gradient fill, rectangle, ellipse, lasso and fuzzy selection with add, subtract and intersect modes, invert, fill or clear the selection, crop a layer or the canvas, and live-preview filters: brightness/contrast, hue/saturation, levels, colour temperature, Gaussian blur, sharpen, film grain, vignette, pixelate, posterise, threshold, edge detect, emboss, invert, desaturate and sepia.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build to dist/
npm run lint
```

Built with React, TypeScript and Vite. Rendering uses Canvas 2D; [paper.js](http://paperjs.org) handles boolean path operations, path simplification and SVG parsing; [jsPDF](https://github.com/parallax/jsPDF) writes PDFs.

### Source map

| File | Responsibility |
|---|---|
| `src/model.ts` | Document types: pages, objects, layers, styles, timeline, media |
| `src/store.ts` | App state, undo history, subscriptions |
| `src/geometry.ts` | Paths, transforms, bounding boxes, keyframe interpolation |
| `src/render.ts` | Draws pages and composite video frames |
| `src/text.ts` | Text layout with columns and threading |
| `src/ops.ts` | Document operations (booleans, align, pages, layers, clips) |
| `src/grain.ts` | Pixel engine: brushes, selections, fills, filters |
| `src/playback.ts`, `src/media.ts` | Timeline playback and media elements |
| `src/io.ts` | Project files, autosave, import, PNG/JPEG/SVG/PDF/video export |
| `src/ui/` | Stage (canvas and tools), panels, timeline, controls, icons |

## Known limits

This first version covers a broad core of each editor. Next candidates: object groups, text on a path, vector text-to-outlines, layer masks and curves in Grain, transitions beyond crossfades in Motion, and CMYK/vector PDF output. PDF pages are currently rasterised at 300 ppi rather than exported as vectors.
