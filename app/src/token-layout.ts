export interface Point {
  x: number;
  y: number;
}
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export function tokenLayout(
  bounds: Bounds,
  head: Point | null,
  size: number,
  options: {
    anchor: "head" | "figure";
    offset: Point;
    padding: number;
    zoom: number;
  },
) {
  const center = {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
  const anchor = options.anchor === "head" && head ? head : center;
  const extent = Math.max(
    1,
    Math.abs(bounds.left - anchor.x),
    Math.abs(bounds.right - anchor.x),
    Math.abs(bounds.top - anchor.y),
    Math.abs(bounds.bottom - anchor.y),
  );
  const scale = (size * (0.5 - options.padding / 100) * options.zoom) / extent;
  return {
    scale,
    x: size * (0.5 + options.offset.x) - anchor.x * scale,
    y: size * (0.5 + options.offset.y) - anchor.y * scale,
    anchor: {
      x: size * (0.5 + options.offset.x),
      y: size * (0.5 + options.offset.y),
    },
    tracked: options.anchor === "head" && !!head,
  };
}
