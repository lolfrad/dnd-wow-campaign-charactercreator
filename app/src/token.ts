import type { Camera, CharacterConfig } from "./types";
import type { ViewerAdapter } from "./viewer-adapter";
import { outlinePixels } from "./outline";
import { tokenLayout } from "./token-layout";
import type { Point } from "./token-layout";

export interface PixelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  visible: number;
  transparent: number;
  partial: number;
}
export function pixelBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): PixelBounds {
  let left = width,
    top = height,
    right = -1,
    bottom = -1,
    visible = 0,
    transparent = 0,
    partial = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === 0) transparent++;
      if (alpha > 0 && alpha < 255) partial++;
      if (alpha > 2) {
        visible++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  return { left, top, right, bottom, visible, transparent, partial };
}
async function decode(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  return {
    image,
    canvas,
    bounds: pixelBounds(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    ),
  };
}
export interface TokenSource {
  canvas: HTMLCanvasElement;
  bounds: PixelBounds;
  head: Point | null;
  camera?: Camera;
}
export function composeToken(
  source: TokenSource,
  config: CharacterConfig,
  size: number,
) {
  const { canvas, bounds, head } = source;
  const layout = tokenLayout(bounds, head, size, config.token);
  const output = document.createElement("canvas");
  output.width = output.height = size;
  const context = output.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    canvas,
    layout.x,
    layout.y,
    canvas.width * layout.scale,
    canvas.height * layout.scale,
  );
  if (config.token.outline.enabled) {
    const image = context.getImageData(0, 0, size, size);
    image.data.set(
      outlinePixels(
        image.data,
        size,
        size,
        (config.token.outline.width * size) / 512,
        config.token.outline.color,
      ),
    );
    context.putImageData(image, 0, 0);
  }
  const pixels = pixelBounds(
    context.getImageData(0, 0, size, size).data,
    size,
    size,
  );
  if (pixels.visible < 20)
    throw new Error(
      "Final token is empty. Move or zoom out to bring it back into view.",
    );
  return {
    url: output.toDataURL("image/png"),
    pixels,
    source,
    anchor: layout.anchor,
    tracked: layout.tracked,
  };
}
export async function renderThumbnail(
  adapter: ViewerAdapter,
  config: CharacterConfig,
) {
  const frame = await adapter.captureFrame(256, {
    ...config.token,
    zoom: 0.65,
  });
  const raw = await decode(frame.url),
    b = raw.bounds;
  if (
    b.visible < 20 ||
    b.left < 2 ||
    b.top < 2 ||
    b.right > 253 ||
    b.bottom > 253
  )
    return renderToken(adapter, config, 256, true);
  return composeToken(
    { canvas: raw.canvas, bounds: b, head: null },
    config,
    256,
  );
}
export async function renderToken(
  adapter: ViewerAdapter,
  config: CharacterConfig,
  size: number,
  preview = false,
) {
  const wasPaused = config.pose.paused;
  adapter.pause(true);
  try {
    const sampleSize = preview
      ? size
      : Math.min(
          size * config.settings.exportScale,
          adapter.maximumCaptureSize(),
        );
    const camera: Camera = { ...config.token, zoom: 0.3 };
    const capture = async () => {
      const frame = await adapter.captureFrame(sampleSize, camera);
      return { ...(await decode(frame.url)), head: frame.head };
    };
    let raw = await capture();
    if (raw.bounds.visible < 20 || raw.bounds.transparent < 100)
      throw new Error(
        "PNG validation failed: expected transparent pixels and a visible character.",
      );
    // Start wide enough to include gear outside the character's model bounds.
    // Then move closer for useful output resolution, with a conservative margin.
    const extent = Math.max(
      sampleSize / 2 - raw.bounds.left,
      raw.bounds.right - sampleSize / 2,
      sampleSize / 2 - raw.bounds.top,
      raw.bounds.bottom - sampleSize / 2,
    );
    camera.zoom = Math.min(2.5, 0.3 * ((sampleSize * 0.39) / extent));
    raw = await capture();
    for (
      let attempt = 0;
      attempt < 3 &&
      (raw.bounds.left < 3 ||
        raw.bounds.top < 3 ||
        raw.bounds.right > sampleSize - 4 ||
        raw.bounds.bottom > sampleSize - 4);
      attempt++
    ) {
      camera.zoom *= 0.7;
      raw = await capture();
    }
    if (
      raw.bounds.left < 2 ||
      raw.bounds.top < 2 ||
      raw.bounds.right > sampleSize - 3 ||
      raw.bounds.bottom > sampleSize - 3
    )
      throw new Error(
        "Equipment still touches the capture edge. Reduce framing or choose another pose.",
      );
    return composeToken(
      {
        canvas: raw.canvas,
        bounds: raw.bounds,
        head: raw.head,
        camera: { ...camera },
      },
      config,
      size,
    );
  } finally {
    adapter.pause(wasPaused);
  }
}

export function download(url: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
