const paths: Record<string, string> = {
  npc: '<path d="M5 16c-4-9 1-14 7-14s11 5 7 14l-3 1v5h-3v-3h-2v3H8v-5l-3-1Z"/><circle cx="8" cy="11" r="2"/><circle cx="16" cy="11" r="2"/><path d="m11 15 1-2 1 2"/>',
  creature:
    '<path d="m4 5 4 2 4-4 4 4 4-2-2 9-6 7-6-7-2-9Z"/><path d="m7 10 3 2m7-2-3 2m-4 4h4"/>',
  boss: '<path d="m3 5 5 4 4-7 4 7 5-4-2 14H5L3 5Zm2 14h14M8 14h8"/>',
  all: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  previous: '<path d="m15 4-8 8 8 8"/>',
  next: '<path d="m9 4 8 8-8 8"/>',
  axe: '<path d="m4 22 13-17m-5-2c5-3 11 2 10 6l-5 4-3-5-6-2 4-3Z"/>',
  mace: '<path d="m4 22 11-12m-4-7 6-2 5 6-3 6-7-2-2-5 1-3Z"/>',
  dagger: '<path d="M18 2v7l-8 8-3-3 8-9 3-3ZM4 12l8 8m-9 1 5-5"/>',
  polearm: '<path d="m3 22 15-18m-1-3 5 1-1 6-4 1-2-4 2-4Z"/>',
  bow: '<path d="M5 2c19 5 19 15 0 20l7-10L5 2Zm2 10h15m-4-3 4 3-4 3"/>',
  crossbow: '<path d="M2 13C8 0 16 0 22 13L12 7 2 13Zm10-6v15m-3-3h6M12 1v6"/>',
  gun: '<path d="m3 16 6-5 3 3-5 7-4-5Zm5-6L20 2l2 3-11 9m4-6 3 4-3 2-2-3"/>',
  wand: '<path d="m4 22 13-14m0-7v4m-5-3 2 3m7-3-2 3m3 3h-3m-9-1 3 1"/>',
  fist: '<path d="M6 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v7-3a2 2 0 0 1 4 0v7l-5 6H8l-5-8a2 2 0 0 1 3-3Z"/>',
  warglaive:
    '<path d="M2 3c8 0 8 8 10 9 1-4 5-6 10-9-1 8-5 13-10 9 2 6-3 8-8 10 2-5 6-8 8-10-8 2-9-3-10-9Z"/>',
  thrown:
    '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/><circle cx="12" cy="12" r="2"/>',
  fishing: '<path d="m3 22 9-19 6 7m-6-7c7 0 9 5 9 9v5a3 3 0 0 1-6 0v-2"/>',
  held: '<path d="m3 4 9 3 9-3v16l-9 3-9-3V4Zm9 3v16M6 8l3 1m-3 3 3 1m6-4 3-1m-3 5 3-1"/>',
  misc: '<path d="m12 2 3 6 7 4-7 4-3 6-3-6-7-4 7-4 3-6Z"/>',
  oneHand: '<path d="m5 20 8-8m-5-3 7 7m-4-5 8-8 2-1-1 5-6 6"/>',
  twoHand: '<path d="m2 22 9-9m-5-5 9 9m-5-7L20 2h2v3L13 14M4 17l3 3"/>',
  cloth:
    '<path d="m8 3-5 4 3 5 2-2v11h8V10l2 2 3-5-5-4c0 5-8 5-8 0Z"/><path d="M8 17h8"/>',
  leather:
    '<path d="m8 3-4 4 3 4v10h10V11l3-4-4-4-4 5-4-5Zm4 5v13m-3-8h6m-6 4h6"/>',
  mail: '<path d="m8 3-5 4 3 5 2-2v11h8V10l2 2 3-5-5-4-4 3-4-3Z"/><path d="M8 10h8m-8 4h8m-8 4h8m-6-8v11m4-11v11"/>',
  plate: '<path d="m8 3-5 4 4 5 1 9h8l1-9 4-5-5-4-4 3-4-3Zm4 3v15m-4-7h8"/>',
  cosmetic:
    '<path d="m12 2 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Zm7 13 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/>',
  gem: '<path d="m7 3-5 7 10 12 10-12-5-7H7Zm-5 7h20M7 3l5 19 5-19"/>',
  shoulders: '<path d="m2 8 6-4 4 5 4-5 6 4-2 9-5-1-3-5-3 5-5 1-2-9Z"/>',
  chest: '<path d="m8 3-5 4 3 5 2-2v11h8V10l2 2 3-5-5-4-4 3-4-3Z"/>',
  legs: '<path d="M5 3h14l-1 19h-5l-1-12-1 12H6L5 3Zm0 4h14"/>',
  hands:
    '<path d="M5 12V7a2 2 0 0 1 3 0V4a2 2 0 0 1 3 0v6-7a2 2 0 0 1 3 0v7-5a2 2 0 0 1 3 0v8l2-3a2 2 0 0 1 3 2l-5 9H8l-5-7a2 2 0 0 1 2-2Z"/>',
  feet: '<path d="M8 2h10l-1 12 5 5v3H3v-5l6-4L8 2Zm0 5h10"/>',
  waist: '<path d="M2 8h20v9H2V8Zm7-2h6v13H9V6Zm3 6h5"/>',
  cloak: '<path d="M9 3h6l7 19H2L9 3Zm0 0c0 5 6 5 6 0m-5 8-2 8m6-8 2 8"/>',
  wrists:
    '<path d="m6 3 14 3-3 15-14-3L6 3Zm-1 4 14 3M4 14l14 3M8 8l-1 7m5-6-1 7"/>',
  shirt: '<path d="m8 3-6 4 3 5 3-2v12h8V10l3 2 3-5-6-4c0 4-8 4-8 0Z"/>',
  tabard: '<path d="M7 2h10l3 5-4 3v12l-4-3-4 3V10L4 7l3-5Zm5 4v10m-3-7h6"/>',
  mainHand: '<path d="m4 22 7-7m-5-5 8 8M10 12 20 2l1 5-8 8"/>',
  offHand: '<path d="m12 2 9 4v7c0 5-9 9-9 9s-9-4-9-9V6l9-4Zm0 4v12"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4m-11-8 5 4-5 4V8Z"/>',
  record:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  race: '<circle cx="12" cy="6" r="3"/><path d="M5 22v-5a7 7 0 0 1 14 0v5M8 16v6m8-6v6"/>',
  head: '<path d="M8 21v-4c-3-2-4-6-3-10 2-6 11-6 13 0l2 6h-3v4h-4v4"/><path d="M8 6c2-2 5-2 7 0"/>',
  body: '<path d="m8 3-5 4 3 5 2-2-1 12h10l-1-12 2 2 3-5-5-4c-1 4-7 4-8 0Z"/>',
  armor:
    '<path d="M8 3 3 7l3 4 2-2v12h8V9l2 2 3-4-5-4c0 4-8 4-8 0Z"/><path d="M8 14h8m-8 3h8m-4-9v13"/>',
  weapons:
    '<path d="m4 21 4-4m-3-3 5 5M8 16 20 4l1-1-1 6-9 9M4 3l5 1 11 12m-1-2-5 5m3-2 4 4"/>',
  poses:
    '<circle cx="13" cy="4" r="2"/><path d="m9 8 5 1 5-3m-6 3-3 6m-1-7-5 4m6 3 5 2 1 5m-6-7-5 6"/>',
  token:
    '<circle cx="12" cy="12" r="9"/><path d="M12 6v12m-6-6h12M5 5l14 14m0-14L5 19"/>',
  settings:
    '<path d="m10 3-1 3-3 1-3-1-1 4 3 2v3l-2 2 3 3 3-1 2 2h3l1-3 3-1 3 1 1-4-3-2v-3l2-2-3-3-3 1-2-2Z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
  import: '<path d="M3 7h7l2 2h9v12H3V7Zm9 8V3m-4 4 4-4 4 4"/>',
  export: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 1 1 0 14"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 1 0 0 14"/>',
  reset: '<path d="M4 11a8 8 0 1 1 2 7M4 3v8h8"/>',
  front: '<circle cx="12" cy="7" r="3"/><path d="M6 22v-5a6 6 0 0 1 12 0v5"/>',
  side: '<path d="M8 21v-5c-4-2-4-10 0-12 4-2 8 1 8 5l3 4h-4v4h-3v4"/>',
  overhead:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  tilted:
    '<ellipse cx="12" cy="14" rx="9" ry="5"/><path d="m9 8 3-5 3 5M12 3v11"/>',
  play: '<path d="m8 4 12 8L8 20V4Z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  clear: '<path d="m5 5 14 14M19 5 5 19"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  empty: '<circle cx="12" cy="12" r="8"/><path d="m6 6 12 12"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  male: '<circle cx="9" cy="15" r="6"/><path d="m13 11 8-8m-7 0h7v7"/>',
  female: '<circle cx="12" cy="8" r="6"/><path d="M12 14v8m-4-4h8"/>',
  sword: '<path d="M20 3v5L9 19l-4-4L16 4l4-1ZM3 13l8 8m-9 1 5-5"/>',
  shield:
    '<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Z"/><path d="M12 3v18M4 10h16"/>',
  staff: '<path d="m5 22 10-16m-2-4 5-1 4 5-4 5-5-4V2Z"/>',
  random: '<path d="m3 5 18 14m-5 0h5v-5M3 19l6-5m6-4 6-5m-5 0h5v5"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c4 0-1-5 2-6 5 1 8-1 7-5a9 9 0 0 0-9-7Z"/><path d="M7 8h.1M12 6h.1M17 9h.1M6 13h.1"/>',
  expand: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  minus: '<path d="M4 12h16"/>',
};
export function icon(name: string, size = 24) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.body}</svg>`;
}
