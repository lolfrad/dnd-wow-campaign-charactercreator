import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";
import { encodeAnimation } from "../server/animation";
test("animation encoder rejects malformed frames and recovers for transparent WebP and WebM", async () => {
  await assert.rejects(
    encodeAnimation({ format: "webm", size: 512, frames: [] }),
  );
  const frames = [];
  for (const color of ["red", "blue"]) {
    const png = await sharp(
      Buffer.from(
        `<svg width="512" height="512"><circle cx="256" cy="256" r="100" fill="${color}"/></svg>`,
      ),
    )
      .png()
      .toBuffer();
    frames.push({
      png: "data:image/png;base64," + png.toString("base64"),
      duration: 200,
    });
  }
  await assert.rejects(encodeAnimation({ format: "webp", size: 1024, frames }));
  const webp = await encodeAnimation({ format: "webp", size: 512, frames });
  const meta = await sharp(webp.bytes, { animated: true }).metadata();
  assert.equal(meta.pages, 2);
  assert.equal(meta.hasAlpha, true);
  assert.equal(meta.width, 512);
  const { data } = await sharp(webp.bytes, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0);
  const center = (256 * 512 + 256) * 4;
  assert.ok(data[center] > 200);
  assert.ok(data[512 * 512 * 4 + center + 2] > 200);
  const webm = await encodeAnimation({ format: "webm", size: 512, frames });
  assert.equal(webm.type, "video/webm");
  const decoded = spawnSync(
    ffmpeg!,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-c:v",
      "libvpx-vp9",
      "-i",
      "pipe:0",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ],
    { input: webm.bytes, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
  );
  assert.equal(decoded.status, 0, decoded.stderr.toString());
  assert.equal(decoded.stdout.length, 512 * 512 * 4);
  assert.equal(decoded.stdout[3], 0);
  assert.ok(decoded.stdout[center + 3] > 250);
});
