const P: Record<string, string> = {
  select: 'M5 3l13 7.5-5.7 1.3 3.3 6.4-2.5 1.3-3.3-6.4L5 17z',
  node: 'M4 4l6 16 2-7 7-2z M17 17h4v4h-4z',
  pen: 'M12 19l7-7 3 3-7 7z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z M2 2l7.6 7.6 M11 11a1.5 1.5 0 1 0 0 .01',
  pencil: 'M17 3l4 4L8 20H4v-4z M14 6l4 4',
  rect: 'M4 5h16v14H4z',
  ellipse: 'M12 5c5 0 9 3.1 9 7s-4 7-9 7-9-3.1-9-7 4-7 9-7z',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z',
  text: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  gradient: 'M4 4h16v16H4z M4 20L20 4 M8 20L20 8 M4 16L16 4',
  eyedropper: 'M15 4l5 5-2 2-5-5z M13 6l-8 8v3h3l8-8 M5 17l-2 4',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11 M11 10V4.5a1.5 1.5 0 0 1 3 0V11 M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L2.6 15a1.5 1.5 0 0 1 2.3-2L8 16',
  zoom: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5L21 21 M8 10.5h5 M10.5 8v5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  rectsel: 'M4 4h3 M10 4h4 M17 4h3v3 M20 10v4 M20 17v3h-3 M14 20h-4 M7 20H4v-3 M4 14v-4 M4 7V4',
  ellsel: 'M12 4a8 8 0 0 1 0 0 M5 8.5A8 8 0 0 1 9 4.7 M15 4.7a8 8 0 0 1 4 3.8 M20 12a8 8 0 0 1-1 3.5 M15 19.3a8 8 0 0 1-6 0 M5 15.5A8 8 0 0 1 4 12',
  lasso: 'M7 17c-3-1.5-4-3.5-4-6 0-4 4-7 9-7s9 3 9 7-4 7-9 7c-1 0-2 0-3-.3 M7 17a2 2 0 1 0 0 .01 M7 19c0 1.5 1 2.5 2 3',
  wand: 'M4 20L15 9 M15 5V3 M19 9h2 M17.8 6.2l1.4-1.4 M17.8 11.8l1.4 1.4 M12.2 6.2L10.8 4.8 M13 7l4 4',
  brush: 'M9.1 14.6a3 3 0 0 0-4.2 0C3.5 16 4 19 2 20c3 1 6.5.6 8-.9a3 3 0 0 0-.9-4.5z M9.5 13.5L20 3 M11 16l9.5-9.5',
  eraser: 'M7 21h11 M4.5 15.5L14 6l5 5-9.5 9.5H7z M9.5 11l5 5',
  smudge: 'M8 11V5.5a1.5 1.5 0 0 1 3 0V10 M11 9.5V4a1.5 1.5 0 0 1 3 0v6 M14 10V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6H10 M3 18c2-1 3-3 6-3',
  clone: 'M9 9h11v11H9z M5 15H4V4h11v1',
  dodge: 'M12 3a5 5 0 0 1 0 10 5 5 0 0 1 0-10z M12 13v8 M9 18h6',
  burn: 'M12 2c1 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 2 0-2-1-3 0-5z',
  bucket: 'M5 12l7-7 7 7-7 7z M5 12h14 M20 15c0 1.5 1 2 1 3a1 1 0 0 1-2 0c0-1 1-1.5 1-3z',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14 M18 22V8a2 2 0 0 0-2-2H2',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeoff: 'M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9 M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2 M1 1l22 22',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 7.9-1',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  trash: 'M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14',
  up: 'M12 19V5 M5 12l7-7 7 7',
  down: 'M12 5v14 M19 12l-7 7-7-7',
  chevron: 'M9 6l6 6-6 6',
  chevdown: 'M6 9l6 6 6-6',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7z M13 4h4v16h-4z',
  stop: 'M6 6h12v12H6z',
  prev: 'M19 20L9 12l10-8z M5 19V5',
  next: 'M5 4l10 8-10 8z M19 5v14',
  stepb: 'M15 18l-6-6 6-6',
  stepf: 'M9 18l6-6-6-6',
  scissors: 'M6 6a3 3 0 1 0 0 .01 M6 18a3 3 0 1 0 0 .01 M20 4L8.1 15.9 M14.5 14.5L20 20 M8.1 8.1L12 12',
  key: 'M12 2l10 10-10 10L2 12z',
  loop: 'M17 2l4 4-4 4 M3 11V9a3 3 0 0 1 3-3h15 M7 22l-4-4 4-4 M21 13v2a3 3 0 0 1-3 3H3',
  magnet: 'M6 15a6 6 0 0 0 12 0V3h-4v12a2 2 0 0 1-4 0V3H6z M6 7h4 M14 7h4',
  film: 'M3 3h18v18H3z M7 3v18 M17 3v18 M3 8h4 M3 16h4 M17 8h4 M17 16h4 M3 12h18',
  music: 'M9 18V5l12-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  image: 'M3 3h18v18H3z M8.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M21 15l-5-5L5 21',
  layers: 'M12 2L2 7l10 5 10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  pages: 'M8 2h10a2 2 0 0 1 2 2v14 M4 6h12v16H4z',
  type: 'M4 7V4h16v3 M9 20h6 M12 4v16',
  swap: 'M7 4L3 8l4 4 M3 8h14 M17 20l4-4-4-4 M21 16H7',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18 M6 6l12 12',
  alignL: 'M4 3v18 M8 6h10v4H8z M8 14h6v4H8z',
  alignCH: 'M12 3v18 M6 6h12v4H6z M8 14h8v4H8z',
  alignR: 'M20 3v18 M6 6h10v4H6z M10 14h6v4h-6z',
  alignT: 'M3 4h18 M6 8h4v10H6z M14 8h4v6h-4z',
  alignCV: 'M3 12h18 M6 6h4v12H6z M14 8h4v8h-4z',
  alignB: 'M3 20h18 M6 6h4v10H6z M14 10h4v6h-4z',
  distH: 'M4 3v18 M20 3v18 M10 7h4v10h-4z',
  distV: 'M3 4h18 M3 20h18 M7 10h10v4H7z',
  flipH: 'M12 3v18 M8 7L3 12l5 5z M16 7l5 5-5 5z',
  flipV: 'M3 12h18 M7 8l5-5 5 5z M7 16l5 5 5-5z',
  unite: 'M3 3h11v5h7v13H8v-5H3z',
  subtract: 'M3 3h13v13H3z M16 8h5v13H8v-5',
  intersect: 'M3 3h13v13H3z M8 8h13v13H8z M8 8h8v8H8z',
  exclude: 'M3 3h13v5H8v8H3z M16 8h5v13H8v-5h8z',
  divide: 'M3 3h13v13H3z M8 8h13v13H8z',
  raise: 'M8 8h12v12H8z M4 4h12v2 M4 4v12h2',
  lower: 'M4 4h12v12H4z M8 20h12V8',
  grid: 'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  warn: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
  frame: 'M3 3h18v18H3z M7 7h10 M7 11h10 M7 15h6',
  place: 'M3 3h18v18H3z M3 15l5-5 4 4 3-3 6 6',
  keyboard: 'M2 6h20v12H2z M6 10h.01 M10 10h.01 M14 10h.01 M18 10h.01 M7 14h10',
  wave: 'M2 12h2l2-6 3 12 3-15 3 18 3-12 2 3h2',
  smooth: 'M3 17c4 0 5-10 9-10s5 10 9 10',
  corner: 'M3 18L12 6l9 12',
  sparkle: 'M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z',
};

export function Icon({ name, size = 18, className, fill }: { name: string; size?: number; className?: string; fill?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.sparkle} />
    </svg>
  );
}

/** The ProMake mark: a nib whose stroke becomes a film frame. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-2)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <path d="M16 3 L27 27 Q16 21 5 27 Z" fill="none" stroke="url(#lg)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M16 3 L16 17" stroke="url(#lg)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="19" r="2.4" fill="url(#lg)" />
    </svg>
  );
}
