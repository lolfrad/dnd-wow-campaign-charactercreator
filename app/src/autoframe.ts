import type { ViewerAdapter } from "./viewer-adapter";
import type { CharacterConfig, Camera } from "./types";
import { pixelBounds, type PixelBounds } from "./token";

type Envelope = {
  camera: Camera;
  bounds: PixelBounds;
  relative: PixelBounds;
  size: number;
};
const envelopes = new WeakMap<ViewerAdapter, Map<string, Envelope>>();
function check(signal?: AbortSignal) {
  signal?.throwIfAborted();
}
async function pixels(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = image.width;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  return pixelBounds(
    context.getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
  );
}

/** Calibrate once per model, pose and viewing angle, without moving its pivot. */
export async function animationEnvelope(
  adapter: ViewerAdapter,
  config: CharacterConfig,
  signal?: AbortSignal,
): Promise<Envelope> {
  const key = JSON.stringify([
    config.pose.animation,
    config.token.elevation,
    config.token.facing,
    config.token.animation.includePose,
  ]);
  let cache = envelopes.get(adapter);
  if (!cache) {
    cache = new Map();
    envelopes.set(adapter, cache);
  }
  const existing = cache.get(key);
  if (existing) return existing;
  const size = 160;
  const camera: Camera = {
    elevation: config.token.elevation,
    facing: config.token.facing,
    zoom: 0.3,
  };
  const duration = adapter.animationDuration(config.pose.animation);
  const animate = config.token.animation.includePose && !!duration;
  const count = animate
    ? /^(Stand|Ready)/.test(config.pose.animation)
      ? 16
      : 32
    : 1;
  for (let attempt = 0; attempt < 4; attempt++) {
    check(signal);
    let recording:
      Awaited<ReturnType<ViewerAdapter["beginPoseRecording"]>> | undefined;
    const bounds = {
      left: Infinity,
      top: Infinity,
      right: -Infinity,
      bottom: -Infinity,
      visible: 0,
      transparent: 0,
      partial: 0,
    };
    const relative = { ...bounds };
    let clipped = false;
    try {
      if (animate)
        recording = await adapter.beginPoseRecording(config.pose.animation);
      const step =
        ((duration ?? 0) * 1000) / config.token.animation.speed / count;
      for (let i = 0; i < count; i++) {
        check(signal);
        if (i) recording?.advance(step);
        const frame = await adapter.captureFrame(size, camera);
        check(signal);
        const b = await pixels(frame.url);
        if (b.visible < 20) continue;
        if (
          b.left < 3 ||
          b.top < 3 ||
          b.right > size - 4 ||
          b.bottom > size - 4
        ) {
          clipped = true;
          break;
        }
        const head = frame.head ?? { x: size / 2, y: size / 2 };
        bounds.left = Math.min(bounds.left, b.left);
        bounds.top = Math.min(bounds.top, b.top);
        bounds.right = Math.max(bounds.right, b.right);
        bounds.bottom = Math.max(bounds.bottom, b.bottom);
        relative.left = Math.min(relative.left, b.left - head.x);
        relative.top = Math.min(relative.top, b.top - head.y);
        relative.right = Math.max(relative.right, b.right - head.x);
        relative.bottom = Math.max(relative.bottom, b.bottom - head.y);
      }
    } finally {
      recording?.restore();
    }
    check(signal);
    if (clipped) {
      camera.zoom *= 0.55;
      continue;
    }
    if (!Number.isFinite(bounds.left))
      throw new Error("The character could not be measured for autoframe.");
    // Expand a little between samples, then use a closer capture so exports
    // retain detail. The output fit additionally reserves space for effects.
    const margin = 4;
    bounds.left -= margin;
    bounds.top -= margin;
    bounds.right += margin;
    bounds.bottom += margin;
    relative.left -= margin;
    relative.top -= margin;
    relative.right += margin;
    relative.bottom += margin;
    const extent = Math.max(
      size / 2 - bounds.left,
      size / 2 - bounds.top,
      bounds.right - size / 2,
      bounds.bottom - size / 2,
    );
    const scale = Math.min(6, (size * 0.4) / extent);
    const fitted: Envelope = {
      camera: { ...camera, zoom: camera.zoom * scale },
      size,
      bounds: {
        ...bounds,
        left: (bounds.left - size / 2) * scale + size / 2,
        top: (bounds.top - size / 2) * scale + size / 2,
        right: (bounds.right - size / 2) * scale + size / 2,
        bottom: (bounds.bottom - size / 2) * scale + size / 2,
      },
      relative: {
        ...relative,
        left: relative.left * scale,
        top: relative.top * scale,
        right: relative.right * scale,
        bottom: relative.bottom * scale,
      },
    };
    cache.set(key, fitted);
    return fitted;
  }
  throw new Error(
    "This pose extends beyond the available capture area. Try another angle.",
  );
}

export function envelopeBounds(
  envelope: Envelope,
  size: number,
  actual: PixelBounds,
  head: { x: number; y: number } | null,
  trackHead: boolean,
): PixelBounds {
  const ratio = size / envelope.size;
  const b = trackHead && head ? envelope.relative : envelope.bounds;
  const p = trackHead && head ? head : { x: 0, y: 0 };
  return {
    ...actual,
    left: Math.min(actual.left, b.left * ratio + p.x),
    top: Math.min(actual.top, b.top * ratio + p.y),
    right: Math.max(actual.right, b.right * ratio + p.x),
    bottom: Math.max(actual.bottom, b.bottom * ratio + p.y),
  };
}
