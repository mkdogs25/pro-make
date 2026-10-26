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

## What's in each studio

The full itemised list, including what is *not* built, is in **[FEATURES.md](FEATURES.md)**. Highlights:

- **Motion**: multi-track timeline with transitions (dissolve, wipes, slides, iris…), a per-clip filter stack including chroma key, keyframes on position/scale/rotation/opacity/volume, markers and in/out points, insert/overwrite/append from a source player, titles and generators, an audio mixer with a level meter, scopes, and export to WebM/MP4, animated GIF, PNG sequence or audio.
- **Ink**: pen, pencil, calligraphy, spiral, shapes, node editing, booleans, offset/inset, stroke to path, groups, clip masks, trace bitmap, tiled clones, text on a path, text to outlines, patterns, gradients, markers, blur and shadow, a symbols library, transform dialog with skew, SVG in and out.
- **Print**: master pages, margins/columns/bleed, threaded multi-column text with wrap-around, drop caps and rich text, paragraph styles, image frames, tables, story editor, find & replace, table of contents, preflight, and PDF export with bleed, crop marks, bookmarks and links.
- **Grain**: layers with masks and lock-alpha, a full brush engine (shapes, symmetry, pressure, airbrush, clone, heal, blur, sharpen), selections with quick mask and channels, curves/levels/colour balance and 40+ filters with live preview, gradients, image resizing and rotation, a history panel, and OpenRaster files that open in GIMP and Krita.

Shared by all four: layers, undo history, rulers in px/mm/in/pt, guides and grid, a colour mixer with CMYK values, autosave, `.promake` project files, and a script console.

## Scripting

Open **Edit → Script console…** to automate anything the editor can do. The `promake` object is also available in the browser console.

```js
// A grid of circles, then a bounce animation on the selection
for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++)
  promake.ellipse(120 + c * 90, 120 + r * 90, 70, 70, { fill: `hsl(${(r * 6 + c) * 14}, 75%, 60%)`, stroke: null, strokeWidth: 0 });
promake.commit('Script: grid');
```

Helpers: `rect`, `ellipse`, `star`, `text`, `path(d)`, `objects`, `selected()`, `commit()`, plus the modules `ops`, `ink`, `grain`, `motion`, `io` and `geometry`.

## File formats

| | Open | Save / export |
|---|---|---|
| Project | `.promake` | `.promake` |
| Vector | SVG | SVG, PDF |
| Images | PNG, JPEG, WebP, GIF, BMP | PNG, JPEG, WebP |
| Layered | OpenRaster `.ora` | OpenRaster `.ora` |
| Video | any format your browser plays | WebM/MP4, GIF, PNG sequence (.zip), audio-only |

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

## Source map (additions)

| File | Responsibility |
|---|---|
| `src/ink.ts` | Groups, clips, tiling, trace, offset, node operations, symbols |
| `src/brush.ts` | Brush engine with targets for layers, masks and quick mask |
| `src/pixfx.ts`, `src/clipfx.ts` | Pixel filters and Motion clip filters |
| `src/motion.ts`, `src/audio.ts` | Timeline operations, keyframes, mixer |
| `src/ora.ts`, `src/zip.ts`, `src/gif.ts` | OpenRaster, ZIP and GIF writers |
| `src/api.ts` | Script API |

## Known limits

ProMake does not try to be a complete replacement for the four programs that inspired it; see [FEATURES.md](FEATURES.md) for an honest list of what is built, partly built and missing. The main gaps: PDF pages are images by default (a vector option exists with standard fonts), no CMYK/spot-colour output, no non-destructive filter layers, no XCF/PSD, and video encoding runs in real time through the browser.
