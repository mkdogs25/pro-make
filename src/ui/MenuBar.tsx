import { S, commit, emit, page, selected, toast, useStore } from '../store';
import { Menu, type MenuItem } from './controls';
import { FILTERS } from '../pixfx';
import { FILTER_CATS } from './filtercats';
import {
  addLayerMask, applyLayerMask, autocropImage, autocropLayer, borderSelection, deleteLayerMask, featherSelection, flipImage, growSelection, hasSelection, invertLayerMask,
  layerToImageSize, layerViaCopy, loadChannel, mergeDown, mergeVisible, newFromVisible, openFilter, rotateImage, saveChannel, selectAllPixels, selectFromAlpha, selectFromShapes,
  selectionBounds, selectionToPath, selectNone, invertSelection, sharpenSelection, shrinkSelection, strokeSelection, toggleQuickMask, cropPageTo, CHANNELS, fillSelection,
} from '../grain';
import { addPage, align, booleanOp, breakApart, combine, deletePage, duplicate, duplicatePage, flip, flattenPage, movePage, objectToPath, rasterise, newRasterLayer, reversePaths, simplifyPaths, zorder, paintTarget } from '../ops';
import { addNodes, autoSmooth, groupSel, offsetPaths, releaseClip, roughen, setClip, strokeToPath, textToOutlines, ungroupSel } from '../ink';
import { PAGE_PRESETS } from '../model';
import { ask } from './GrainModals';

const modal = (kind: string) => { S.ui.modal = { kind }; emit(); };
const layer = () => { const o = paintTarget(false); if (!o) toast('Select a pixel layer first'); return o; };

function objectMenu(): (MenuItem | 'sep')[] {
  const has = selected().length > 0;
  return [
    { label: 'Group', kbd: 'Ctrl+G', onClick: groupSel, disabled: selected().length < 2 },
    { label: 'Ungroup', kbd: 'Ctrl+Shift+G', onClick: ungroupSel },
    { label: 'Set clip', onClick: setClip, disabled: selected().length < 2 },
    { label: 'Release clip', onClick: releaseClip },
    'sep',
    { label: 'Duplicate', kbd: 'Ctrl+D', onClick: duplicate, disabled: !has },
    { label: 'Order', sub: [
      { label: 'Bring to front', onClick: () => zorder('top') }, { label: 'Raise', onClick: () => zorder('up') },
      { label: 'Lower', onClick: () => zorder('down') }, { label: 'Send to back', onClick: () => zorder('bottom') }] },
    { label: 'Align', sub: [
      { label: 'Left edges', onClick: () => align('left') }, { label: 'Centres horizontally', onClick: () => align('hcenter') }, { label: 'Right edges', onClick: () => align('right') },
      'sep', { label: 'Top edges', onClick: () => align('top') }, { label: 'Centres vertically', onClick: () => align('vcenter') }, { label: 'Bottom edges', onClick: () => align('bottom') },
      'sep', { label: 'Distribute horizontally', onClick: () => align('dh') }, { label: 'Distribute vertically', onClick: () => align('dv') }] },
    { label: 'Flip horizontally', onClick: () => flip('h'), disabled: !has },
    { label: 'Flip vertically', onClick: () => flip('v'), disabled: !has },
    'sep',
    { label: 'Text to outlines', onClick: textToOutlines, disabled: !selected().some(o => o.type === 'text') },
    { label: 'Rasterise for Grain', onClick: rasterise, disabled: !has },
  ];
}

function pathMenu(): (MenuItem | 'sep')[] {
  return [
    { label: 'Union', onClick: () => booleanOp('unite') }, { label: 'Difference', onClick: () => booleanOp('subtract') },
    { label: 'Intersection', onClick: () => booleanOp('intersect') }, { label: 'Exclusion', onClick: () => booleanOp('exclude') }, { label: 'Division', onClick: () => booleanOp('divide') },
    'sep',
    { label: 'Combine', onClick: combine }, { label: 'Break apart', onClick: breakApart },
    { label: 'Object to path', onClick: objectToPath }, { label: 'Stroke to path', onClick: strokeToPath },
    'sep',
    { label: 'Outset…', onClick: () => ask({ title: 'Outset path', label: 'Distance', value: 8, unit: 'px', min: 0.5, ok: 'Outset', run: v => offsetPaths(v) }) },
    { label: 'Inset…', onClick: () => ask({ title: 'Inset path', label: 'Distance', value: 8, unit: 'px', min: 0.5, ok: 'Inset', run: v => offsetPaths(-v) }) },
    { label: 'Simplify', onClick: () => simplifyPaths() }, { label: 'Reverse direction', onClick: reversePaths },
    'sep',
    { label: 'Add nodes', onClick: addNodes }, { label: 'Auto-smooth nodes', onClick: autoSmooth },
    { label: 'Roughen…', onClick: () => ask({ title: 'Roughen', label: 'Amount', value: 3, unit: 'px', min: 0.5, ok: 'Roughen', run: v => roughen(v) }) },
    'sep',
    { label: 'Tiled clones…', onClick: () => modal('tiles') },
    { label: 'Trace bitmap…', onClick: () => modal('trace') },
  ];
}

function pageMenu(): (MenuItem | 'sep')[] {
  const pg = page();
  return [
    { label: 'Add page', sub: PAGE_PRESETS.map(p => ({ label: `${p.name} (${p.w}×${p.h})`, onClick: () => addPage(p.w, p.h) })) },
    { label: 'Add page the same size', onClick: () => addPage(pg.w, pg.h) },
    { label: 'Duplicate page', onClick: () => duplicatePage() },
    { label: 'Delete page', onClick: () => deletePage(pg.id) },
    'sep',
    { label: 'Move page earlier', onClick: () => movePage(pg.id, -1) }, { label: 'Move page later', onClick: () => movePage(pg.id, 1) },
    'sep',
    { label: 'Insert table of contents…', onClick: () => modal('toc') },
    { label: 'Preflight…', onClick: () => modal('preflight') },
    { label: 'Document info…', onClick: () => modal('docinfo') },
  ];
}

function filterItems(): (MenuItem | 'sep')[] {
  return FILTER_CATS.filter(c => c.name !== 'Colours').map(c => ({
    label: c.name,
    sub: c.ids.map(id => ({ label: FILTERS.find(f => f.id === id)!.name.replace(/…$/, ''), onClick: () => openFilter(id) })),
  }));
}

function colourItems(): (MenuItem | 'sep')[] {
  const c = FILTER_CATS.find(x => x.name === 'Colours')!;
  return c.ids.map(id => ({ label: FILTERS.find(f => f.id === id)!.name.replace(/…$/, ''), onClick: () => openFilter(id) }));
}

function imageMenu(): (MenuItem | 'sep')[] {
  return [
    { label: 'Scale image…', onClick: () => modal('scale-image') },
    { label: 'Canvas size…', onClick: () => modal('canvas-size') },
    { label: 'Crop to selection', onClick: () => { const b = selectionBounds(); if (b) cropPageTo(b); else toast('Make a selection first'); }, disabled: !hasSelection() },
    { label: 'Crop to content', onClick: autocropImage },
    'sep',
    { label: 'Rotate 90° clockwise', onClick: () => rotateImage(90) }, { label: 'Rotate 90° anticlockwise', onClick: () => rotateImage(270) }, { label: 'Rotate 180°', onClick: () => rotateImage(180) },
    { label: 'Flip horizontally', onClick: () => flipImage('h') }, { label: 'Flip vertically', onClick: () => flipImage('v') },
    'sep',
    { label: 'Flatten image', onClick: flattenPage },
  ];
}

function layerMenu(): (MenuItem | 'sep')[] {
  const o = () => layer();
  const hasMask = !!paintTarget(false)?.maskSrc;
  return [
    { label: 'New pixel layer', onClick: () => newRasterLayer() },
    { label: 'New layer from visible', onClick: newFromVisible },
    { label: 'Duplicate layer', kbd: 'Ctrl+D', onClick: duplicate },
    'sep',
    { label: 'Merge down', onClick: () => { const x = o(); if (x) mergeDown(x); } },
    { label: 'Merge visible layers', onClick: mergeVisible },
    { label: 'Layer to image size', onClick: () => { const x = o(); if (x) layerToImageSize(x); } },
    { label: 'Crop layer to content', onClick: () => { const x = o(); if (x) autocropLayer(x); } },
    'sep',
    { label: 'Layer mask', sub: [
      { label: 'Add mask: white (reveal all)', onClick: () => { const x = o(); if (x) addLayerMask(x, 'white'); } },
      { label: 'Add mask: black (hide all)', onClick: () => { const x = o(); if (x) addLayerMask(x, 'black'); } },
      { label: 'Add mask: from selection', onClick: () => { const x = o(); if (x) addLayerMask(x, 'selection'); } },
      { label: 'Add mask: from layer transparency', onClick: () => { const x = o(); if (x) addLayerMask(x, 'alpha'); } },
      'sep',
      { label: 'Edit mask on/off', onClick: () => { S.ui.maskEdit = !S.ui.maskEdit; emit(); }, disabled: !hasMask },
      { label: 'Invert mask', onClick: () => { const x = o(); if (x) invertLayerMask(x); }, disabled: !hasMask },
      { label: 'Apply mask', onClick: () => { const x = o(); if (x) applyLayerMask(x); }, disabled: !hasMask },
      { label: 'Delete mask', onClick: () => { const x = o(); if (x) deleteLayerMask(x); }, disabled: !hasMask },
    ] },
    { label: 'Lock transparency on/off', onClick: () => { const x = o(); if (x) { x.lockAlpha = !x.lockAlpha; commit('Lock alpha'); } } },
    'sep',
    { label: 'New layer via copy', onClick: () => { const x = o(); if (x) layerViaCopy(x, false); }, disabled: !hasSelection() },
    { label: 'New layer via cut', onClick: () => { const x = o(); if (x) layerViaCopy(x, true); }, disabled: !hasSelection() },
    'sep',
    { label: 'Rasterise selected vector / text', onClick: rasterise },
  ];
}

function selectMenu(): (MenuItem | 'sep')[] {
  const sel = hasSelection();
  const amt = (title: string, f: (n: number) => void, v = 5) => () => ask({ title, label: 'Pixels', value: v, unit: 'px', min: 1, max: 400, ok: 'OK', run: f });
  return [
    { label: 'All', kbd: 'Ctrl+A', onClick: selectAllPixels }, { label: 'None', kbd: 'Ctrl+Shift+A', onClick: selectNone }, { label: 'Invert', kbd: 'Ctrl+Shift+I', onClick: invertSelection },
    'sep',
    { label: 'Grow…', onClick: amt('Grow selection', growSelection), disabled: !sel }, { label: 'Shrink…', onClick: amt('Shrink selection', shrinkSelection), disabled: !sel },
    { label: 'Feather…', onClick: amt('Feather selection', featherSelection, 12), disabled: !sel }, { label: 'Border…', onClick: amt('Selection border', borderSelection, 6), disabled: !sel },
    { label: 'Remove feathering', onClick: sharpenSelection, disabled: !sel },
    'sep',
    { label: 'From layer transparency', onClick: () => { const x = layer(); if (x) selectFromAlpha(x); } },
    { label: 'From selected vector shapes', onClick: selectFromShapes },
    { label: 'To path', onClick: selectionToPath, disabled: !sel },
    { label: 'Stroke selection…', onClick: () => ask({ title: 'Stroke selection', label: 'Line width', value: 3, unit: 'px', min: 1, max: 100, ok: 'Stroke', run: v => { const x = layer(); if (x) strokeSelection(x, v); } }), disabled: !sel },
    { label: 'Fill with foreground', onClick: () => { const x = layer(); if (x) fillSelection(x, S.ui.fg); }, disabled: !sel },
    { label: 'Fill with background', onClick: () => { const x = layer(); if (x) fillSelection(x, S.ui.bg); }, disabled: !sel },
    'sep',
    { label: S.ui.quickMask ? 'Leave quick mask' : 'Quick mask', kbd: 'Q', onClick: toggleQuickMask },
    { label: 'Save to channel', onClick: saveChannel, disabled: !sel },
    ...(CHANNELS.filter(c => c.pageId === S.ui.pageId).length ? [{ label: 'Load channel', sub: CHANNELS.filter(c => c.pageId === S.ui.pageId).map(c => ({ label: c.name, onClick: () => loadChannel(c.id) })) } as MenuItem] : []),
  ];
}

export function MenuBar() {
  useStore();
  const mode = S.ui.mode;
  if (mode === 'motion') return null;
  return (
    <div className="menubar" role="menubar">
      {(mode === 'ink' || mode === 'print') && <Menu label="Object" items={objectMenu()} />}
      {mode === 'ink' && <Menu label="Path" items={pathMenu()} />}
      {mode === 'print' && <Menu label="Page" items={pageMenu()} />}
      {mode === 'print' && <Menu label="Shapes" items={pathMenu().filter(x => x !== 'sep').slice(0, 5)} />}
      {mode === 'grain' && <>
        <Menu label="Image" items={imageMenu()} />
        <Menu label="Layer" items={layerMenu()} />
        <Menu label="Select" items={selectMenu()} />
        <Menu label="Colours" items={colourItems()} />
        <Menu label="Filters" items={filterItems()} />
      </>}
      <span className="grow" />
      <span className="muted small menubar-hint">{mode === 'grain' ? 'Filters apply to the selected pixel layer, within the selection.' : mode === 'ink' ? 'Hold Ctrl and click to pick an object inside a group.' : 'Pages, masters and text threading live in the right-hand panels.'}</span>
    </div>
  );
}

