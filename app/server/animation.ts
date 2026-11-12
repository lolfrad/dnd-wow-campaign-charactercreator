import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  unlink,
  rmdir,
} from "node:fs/promises";
import { resolve, sep } from "node:path";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";

let encoding = false;
export async function encodeAnimation(input: unknown) {
  if (encoding)
    throw new Error("Another animated token is encoding. Try again shortly.");
  const v = input as any;
  if (
    !v ||
    !["webm", "webp"].includes(v.format) ||
    ![512, 1024].includes(v.size) ||
    !Array.isArray(v.frames) ||
    v.frames.length < 2 ||
    v.frames.length > (v.size === 1024 ? 80 : 240)
  )
    throw new Error("Invalid animated token request.");
  encoding = true;
  const parent = resolve(import.meta.dirname, "../../.cache/exports");
  let directory = "";
  const files: string[] = [];
  try {
    await mkdir(parent, { recursive: true });
    const candidate = await mkdtemp(resolve(parent, "animation-"));
    if (!candidate.toLowerCase().startsWith((parent + sep).toLowerCase()))
      throw new Error("Invalid export directory.");
    directory = candidate;
    let duration = 0;
    const lines = ["ffconcat version 1.0"];
    for (let index = 0; index < v.frames.length; index++) {
      const frame = v.frames[index];
      if (
        typeof frame.png !== "string" ||
        !frame.png.startsWith("data:image/png;base64,") ||
        frame.png.length > 6 * 1024 * 1024 ||
        !Number.isFinite(frame.duration) ||
        frame.duration < 10 ||
        frame.duration > 30000
      )
        throw new Error("Invalid animation frame.");
      const png = Buffer.from(frame.png.slice(22), "base64"),
        meta = await sharp(png, { limitInputPixels: 1024 * 1024 }).metadata();
      if (
        meta.format !== "png" ||
        meta.width !== v.size ||
        meta.height !== v.size ||
        (meta.pages ?? 1) !== 1
      )
        throw new Error("Frame dimensions do not match token size.");
      duration += frame.duration;
      if (duration > 60001)
        throw new Error("Animated token exceeds sixty seconds.");
      const file = `frame-${String(index).padStart(4, "0")}.png`,
        path = resolve(directory, file);
      await writeFile(path, png);
      files.push(path);
      lines.push(
        `file '${file}'`,
        `duration ${(frame.duration / 1000).toFixed(4)}`,
      );
    }
    lines.push(
      `file 'frame-${String(v.frames.length - 1).padStart(4, "0")}.png'`,
    );
    const list = resolve(directory, "frames.txt"),
      output = resolve(directory, `token.${v.format}`);
    await writeFile(list, lines.join("\n"));
    files.push(list, output);
    if (!ffmpeg)
      throw new Error(
        "Video encoder is unavailable. Run the project launcher to restore it.",
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
      list,
      "-an",
      "-t",
      (duration / 1000).toFixed(4),
    ];
    if (v.format === "webm")
      args.push(
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        "yuva420p",
        "-b:v",
        "0",
        "-crf",
        "18",
        "-auto-alt-ref",
        "0",
        "-row-mt",
        "1",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
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
        "3",
        "-loop",
        "0",
      );
    args.push("-fps_mode", "vfr", "-y", output);
    await new Promise<void>((done, reject) => {
      const child = spawn(ffmpeg!, args, {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
      });
      let error = "";
      child.stderr.on(
        "data",
        (chunk) => (error = (error + chunk.toString()).slice(-6000)),
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Animation encoding timed out."));
      }, 120000);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        code === 0
          ? done()
          : reject(new Error(`Animation encoding failed: ${error || code}`));
      });
    });
    const bytes = await readFile(output);
    return {
      bytes,
      type: v.format === "webm" ? "video/webm" : "image/webp",
      extension: v.format,
    };
  } finally {
    for (const file of files) await unlink(file).catch(() => {});
    if (directory) await rmdir(directory).catch(() => {});
    encoding = false;
  }
}
