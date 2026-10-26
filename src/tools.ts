import type { Mode } from './model';

export interface ToolDef { id: string; label: string; icon: string; key: string; hint: string }

const T = (id: string, label: string, icon: string, key: string, hint: string): ToolDef => ({ id, label, icon, key, hint });

const select = T('select', 'Select', 'select', 'v', 'Click to select, drag to move. Use the handles to scale; drag the top dot to rotate. Shift-click adds to the selection; Alt-drag duplicates.');
const hand = T('hand', 'Pan', 'hand', 'h', 'Drag to pan the canvas. Hold Space with any tool to pan temporarily.');
const zoom = T('zoom', 'Zoom', 'zoom', 'z', 'Click to zoom in, Alt-click to zoom out. Ctrl+scroll also zooms.');
const rect = T('rect', 'Rectangle', 'rect', 'r', 'Drag to draw a rectangle. Hold Shift for a square, Alt to draw from the centre.');
const ellipse = T('ellipse', 'Ellipse', 'ellipse', 'e', 'Drag to draw an ellipse. Hold Shift for a circle.');
const text = T('text', 'Text', 'text', 't', 'Click to place a text frame, or drag to size one. Double-click any text to edit it.');
const eyedropper = T('eyedropper', 'Eyedropper', 'eyedropper', 'i', 'Click to pick a colour from the artwork. Shift-click sets the stroke/background colour.');

export const TOOLS: Record<Mode, ToolDef[]> = {
  motion: [
    select, rect, ellipse,
    T('text', 'Scene text', 'text', 't', 'Click to add text to the scene. To add a title over the video, use Title in the timeline.'),
    hand, zoom,
  ],
  ink: [
    select,
    T('node', 'Edit nodes', 'node', 'a', 'Click a shape to edit its nodes. Drag nodes or handles; double-click a segment to add a node; select a node and press Delete to remove it.'),
    T('pen', 'Bézier pen', 'pen', 'p', 'Click for corner nodes, drag for smooth curves. Click the first node to close the path; press Enter or Esc to finish.'),
    T('pencil', 'Pencil', 'pencil', 'n', 'Draw freehand. The stroke is smoothed into an editable Bézier path.'),
    T('line', 'Line', 'line', 'l', 'Drag to draw a straight line. Hold Shift to snap to 15° steps.'),
    rect, ellipse,
    T('star', 'Star / polygon', 'star', '*', 'Drag to draw a star or polygon. Set points and inner radius in the bar above.'),
    T('spiral', 'Spiral', 'spiral', 'o', 'Drag outwards from the centre to draw a spiral. Set the number of turns above.'),
    T('calli', 'Calligraphy', 'calli', 'c', 'Draw with a flat nib: the stroke thins when you move quickly. Set width and angle above.'),
    text,
    T('gradient', 'Gradient', 'gradient', 'g', 'Drag across a selected shape to give it a gradient in that direction (fill colour → stroke colour).'),
    T('measure', 'Measure', 'measure', 'm', 'Drag to measure distance, angle and offsets. Nothing is added to the document.'),
    eyedropper, hand, zoom,
  ],
  print: [
    select,
    T('text', 'Text frame', 'frame', 't', 'Drag to create a text frame. Frames can have columns and can be linked so text flows between them.'),
    T('link', 'Link frames', 'link', 'l', 'Click a text frame, then click another to thread the text from the first into the second.'),
    rect, ellipse,
    T('imgframe', 'Image frame', 'imageframe', 'i', 'Drag to make an image frame, then choose a picture. Double-click a frame to replace its picture, or drop an image on it.'),
    T('table', 'Table', 'table', 'b', 'Drag to draw a table. Set rows and columns above, then edit cells in the Properties panel.'),
    T('pen', 'Bézier pen', 'pen', 'p', 'Click for corner nodes, drag for smooth curves. Click the first node to close the path; press Enter or Esc to finish.'),
    T('line', 'Line', 'line', 'n', 'Drag to draw a straight line. Hold Shift to snap to 15° steps.'),
    T('star', 'Polygon / star', 'star', '*', 'Drag to draw a polygon or star. Set points above.'),
    T('place', 'Place file', 'place', 'k', 'Click on the page to choose a picture or SVG to place there.'),
    eyedropper, hand, zoom,
  ],
  grain: [
    T('select', 'Move / transform', 'select', 'v', 'Select and transform layers. Drag the handles to scale or rotate pixel layers.'),
    T('rectsel', 'Rectangle select', 'rectsel', 'm', 'Drag to select a rectangle. Shift adds to the selection, Alt subtracts from it.'),
    T('ellsel', 'Ellipse select', 'ellsel', 'o', 'Drag to select an ellipse. Shift adds to the selection, Alt subtracts from it.'),
    T('lasso', 'Free select', 'lasso', 'f', 'Drag a freehand outline to select.'),
    T('wand', 'Fuzzy select', 'wand', 'u', 'Click to select an area of similar colour. Set the threshold above.'),
    T('brush', 'Paintbrush', 'brush', 'b', 'Paint with the foreground colour. [ and ] change the brush size.'),
    T('pencil', 'Pencil', 'pencil', 'n', 'Paint hard-edged pixels.'),
    T('eraser', 'Eraser', 'eraser', 'e', 'Erase to transparency.'),
    T('smudge', 'Smudge', 'smudge', 's', 'Drag to smear pixels.'),
    T('clone', 'Clone', 'clone', 'c', 'Alt-click to set a source point, then paint to copy from it.'),
    T('dodge', 'Dodge', 'dodge', 'd', 'Paint to lighten.'),
    T('burn', 'Burn', 'burn', 'j', 'Paint to darken.'),
    T('bucket', 'Bucket fill', 'bucket', 'k', 'Click to fill an area of similar colour with the foreground colour.'),
    T('gradient', 'Gradient', 'gradient', 'g', 'Drag to fill with a foreground-to-background gradient.'),
    eyedropper,
    T('crop', 'Crop canvas', 'crop', 'x', 'Drag a rectangle and release to crop the canvas to it.'),
    text, hand, zoom,
  ],
};

export const MODES: { id: Mode; name: string; sub: string; icon: string }[] = [
  { id: 'motion', name: 'Motion', sub: 'Video', icon: 'film' },
  { id: 'ink', name: 'Ink', sub: 'Vector', icon: 'pen' },
  { id: 'print', name: 'Print', sub: 'Layout', icon: 'pages' },
  { id: 'grain', name: 'Grain', sub: 'Pixel', icon: 'brush' },
];
