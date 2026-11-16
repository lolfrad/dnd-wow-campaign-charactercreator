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
    autoframe?: boolean;
    outline?: { enabled: boolean; width: number; style: "crisp" | "soft" };
    shadow?: { enabled: boolean; opacity: number };
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
  const pivot = {
    x: size * (0.5 + options.offset.x),
    y: size * (0.5 + options.offset.y),
  };
  let scale = (size * (0.5 - options.padding / 100) * options.zoom) / extent;
  if (options.autoframe) {
    const glow = options.outline?.enabled
      ? ((options.outline.width * size) / 512) *
        (options.outline.style === "soft" ? 3 : 1)
      : 0;
    const margin = Math.max(size * 0.025, glow + size * 0.012);
    let left = margin,
      top = margin,
      right = size - margin,
      bottom = size - margin;
    if (options.shadow?.enabled && options.shadow.opacity > 0) {
      const blur = (6 * size) / 512;
      left = Math.max(left, (blur - size * 0.015) / 1.02);
      right = Math.min(right, (size - blur - size * 0.015) / 1.02);
      top = Math.max(top, (blur - size * 0.12) / 0.9);
      bottom = Math.min(bottom, (size - blur - size * 0.12) / 0.9);
    }
    const limits = [
      [anchor.x - bounds.left, pivot.x - left],
      [bounds.right - anchor.x, right - pivot.x],
      [anchor.y - bounds.top, pivot.y - top],
      [bounds.bottom - anchor.y, bottom - pivot.y],
    ].filter(([distance]) => distance > 0);
    scale = Math.max(
      0.001,
      Math.min(...limits.map(([distance, space]) => space / distance)),
    );
  }
  return {
    scale,
    x: pivot.x - anchor.x * scale,
    y: pivot.y - anchor.y * scale,
    anchor: pivot,
    tracked: options.anchor === "head" && !!head,
  };
}
