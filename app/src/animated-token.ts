import type { CharacterConfig, Camera } from "./types";
import type { ViewerAdapter } from "./viewer-adapter";
import {
  renderToken,
  composeToken,
  pixelBounds,
  type TokenSource,
} from "./token";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function source(
  url: string,
  head: TokenSource["head"],
): Promise<TokenSource> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = image.width;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  return {
    canvas,
    head,
    bounds: pixelBounds(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    ),
  };
}
export async function recordAnimatedToken(
  adapter: ViewerAdapter,
  config: CharacterConfig,
  signal: AbortSignal,
  onProgress: (fraction: number, label: string) => void,
) {
  const settings = config.token.animation,
    size = config.token.size,
    held = config.pose.paused;
  const poseDuration = adapter.animationDuration(config.pose.animation);
  const duration =
    settings.duration === "pose"
      ? (poseDuration ?? 2) / (settings.includePose ? settings.speed : 1)
      : settings.duration;
  if (settings.duration === "pose" && settings.includePose && !poseDuration)
    throw new Error(
      "The length of this pose is unavailable. Choose a timed export.",
    );
  if (duration > 60)
    throw new Error(
      "This pose exceeds the 60-second export limit at this speed. Increase pose speed.",
    );
  const frameCount = Math.max(
    2,
    Math.min(size === 1024 ? 80 : 240, Math.ceil(duration * settings.fps)),
  );
  const frameDuration = (duration * 1000) / frameCount;
  let poseRecording:
    Awaited<ReturnType<ViewerAdapter["beginPoseRecording"]>> | undefined;
  const check = () => {
    if (signal.aborted)
      throw new DOMException("Recording cancelled", "AbortError");
  };
  try {
    check();
    onProgress(0, "Preparing animation…");
    const calibration = await renderToken(adapter, config, size, true);
    const camera: Camera = {
      ...(calibration.source.camera ?? config.token),
      zoom: (calibration.source.camera?.zoom ?? 0.65) * 0.8,
    };
    let frames: { source: TokenSource; time: number }[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      frames = [];
      let clipped = false;
      poseRecording?.restore();
      poseRecording = undefined;
      adapter.animationSpeed(settings.speed);
      if (settings.includePose)
        poseRecording = await adapter.beginPoseRecording(config.pose.animation);
      if (!settings.includePose) adapter.pause(true);
      for (let index = 0; index < frameCount; index++) {
        check();
        if (index > 0) poseRecording?.advance(frameDuration);
        const frame = await adapter.captureFrame(size, camera),
          pixels = await source(frame.url, frame.head),
          b = pixels.bounds;
        if (
          b.left < 2 ||
          b.top < 2 ||
          b.right > size - 3 ||
          b.bottom > size - 3
        ) {
          clipped = true;
          break;
        }
        frames.push({ source: pixels, time: index * frameDuration });
        onProgress(
          Math.min(0.85, ((index + 1) / frameCount) * 0.85),
          "Recording…",
        );
        await delay(0);
      }
      if (!clipped) break;
      if (attempt === 1)
        throw new Error(
          "Animation reaches the capture edge. Choose a steadier pose or turn off pose animation.",
        );
      camera.zoom *= 0.6;
      onProgress(0, "Adjusting animation framing…");
    }
    adapter.pause(true);
    check();
    if (frames.length < 2)
      throw new Error("The renderer could not record enough animation frames.");
    // Fit the entire sequence once. Varying particle bounds must not make the
    // character grow and shrink between frames.
    const relative =
      config.token.anchor === "head" && frames.every((f) => f.source.head);
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const { source: s } of frames) {
      const p = relative ? s.head! : { x: 0, y: 0 };
      left = Math.min(left, s.bounds.left - p.x);
      top = Math.min(top, s.bounds.top - p.y);
      right = Math.max(right, s.bounds.right - p.x);
      bottom = Math.max(bottom, s.bounds.bottom - p.y);
    }
    const output = frames.map((frame, i) => {
      const p = relative ? frame.source.head! : { x: 0, y: 0 },
        fixed = {
          ...frame.source,
          bounds: {
            ...frame.source.bounds,
            left: left + p.x,
            top: top + p.y,
            right: right + p.x,
            bottom: bottom + p.y,
          },
        };
      const end = frames[i + 1]?.time ?? duration * 1000;
      return {
        png: composeToken(fixed, config, size).url,
        duration: end - frame.time,
      };
    });
    check();
    onProgress(0.9, `Encoding ${settings.format.toUpperCase()}…`);
    const response = await fetch("/api/export/animation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: settings.format, size, frames: output }),
      signal,
    });
    if (!response.ok)
      throw new Error(
        (await response.json()).error ?? "Animated export failed.",
      );
    onProgress(1, "Animation ready");
    return { blob: await response.blob(), frames: frames.length };
  } catch (error) {
    if (signal.aborted)
      throw new DOMException("Recording cancelled", "AbortError");
    throw error;
  } finally {
    poseRecording?.restore();
    adapter.pause(held);
  }
}
