import { FFmpeg } from "@ffmpeg/ffmpeg";
import classWorkerURL from "@ffmpeg/ffmpeg/worker?worker&url";
import { appUrl } from "./runtime";
export interface AnimationFrame {
  png: string;
  duration: number;
}
let encoding = false;
export async function encodeInBrowser(
  format: "webm" | "webp",
  frames: AnimationFrame[],
  signal: AbortSignal,
  progress: (fraction: number, label: string) => void,
) {
  if (encoding) throw new Error("Another animation is encoding.");
  encoding = true;
  const ffmpeg = new FFmpeg();
  const abort = () => ffmpeg.terminate();
  let logs = "";
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    progress(0.9, "Loading animation encoder…");
    ffmpeg.on("log", ({ message }) => {
      logs = (logs + "\n" + message).slice(-1800);
    });
    ffmpeg.on("progress", ({ progress: p }) =>
      progress(
        0.92 + Math.min(1, Math.max(0, p)) * 0.07,
        `Encoding ${format.toUpperCase()}…`,
      ),
    );
    await ffmpeg.load(
      {
        classWorkerURL,
        coreURL: new URL(appUrl("encoder/ffmpeg-core.js"), location.href).href,
        wasmURL: new URL(appUrl("encoder/ffmpeg-core.wasm"), location.href)
          .href,
      },
      { signal },
    );
    const list = ["ffconcat version 1.0"];
    let duration = 0;
    for (let i = 0; i < frames.length; i++) {
      signal.throwIfAborted();
      const bytes = Uint8Array.from(atob(frames[i].png.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      const name = `frame-${String(i).padStart(4, "0")}.png`;
      await ffmpeg.writeFile(name, bytes, { signal });
      duration += frames[i].duration;
      list.push(
        `file '${name}'`,
        `duration ${(frames[i].duration / 1000).toFixed(6)}`,
      );
    }
    list.push(`file 'frame-${String(frames.length - 1).padStart(4, "0")}.png'`);
    await ffmpeg.writeFile(
      "frames.txt",
      new TextEncoder().encode(list.join("\n")),
      { signal },
    );
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "1",
      "-i",
      "frames.txt",
      "-an",
      "-t",
      (duration / 1000).toFixed(6),
    ];
    if (format === "webm")
      args.push(
        "-c:v",
        "libvpx",
        "-pix_fmt",
        "yuva420p",
        "-b:v",
        "1500k",
        "-crf",
        "10",
        "-auto-alt-ref",
        "0",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-threads",
        "1",
        "-metadata:s:v:0",
        "alpha_mode=1",
      );
    else
      args.push(
        "-c:v",
        "libwebp_anim",
        "-lossless",
        "1",
        "-compression_level",
        "2",
        "-loop",
        "0",
      );
    args.push("-vsync", "vfr", `token.${format}`);
    const code = await ffmpeg.exec(args, 180000, { signal });
    if (code !== 0) {
      console.error("Browser encoder:", logs);
      throw new Error(
        "The browser could not encode this animation. Try a shorter animation or smaller size.",
      );
    }
    const output = await ffmpeg.readFile(`token.${format}`, undefined, {
      signal,
    });
    if (typeof output === "string")
      throw new Error("The encoder returned invalid data.");
    return new Blob([new Uint8Array(output)], {
      type: format === "webm" ? "video/webm" : "image/webp",
    });
  } catch (error) {
    if (signal.aborted)
      throw new DOMException("Recording cancelled", "AbortError");
    console.error("Browser encoder:", logs);
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    ffmpeg.terminate();
    encoding = false;
  }
}
