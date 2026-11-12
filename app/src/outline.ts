/** An antialiased silhouette stroke. RGB/alpha of the original image stays intact. */
export function outlinePixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  color: string,
): Uint8ClampedArray {
  const distance = new Float32Array(width * height),
    diagonal = Math.SQRT2;
  for (let i = 0; i < distance.length; i++)
    distance[i] = source[i * 4 + 3] >= 32 ? 0 : 1e6;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let d = distance[i];
      if (x) d = Math.min(d, distance[i - 1] + 1);
      if (y) {
        d = Math.min(d, distance[i - width] + 1);
        if (x) d = Math.min(d, distance[i - width - 1] + diagonal);
        if (x + 1 < width) d = Math.min(d, distance[i - width + 1] + diagonal);
      }
      distance[i] = d;
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let d = distance[i];
      if (x + 1 < width) d = Math.min(d, distance[i + 1] + 1);
      if (y + 1 < height) {
        d = Math.min(d, distance[i + width] + 1);
        if (x) d = Math.min(d, distance[i + width - 1] + diagonal);
        if (x + 1 < width) d = Math.min(d, distance[i + width + 1] + diagonal);
      }
      distance[i] = d;
    }
  const rgb = [1, 3, 5].map((offset) =>
    parseInt(color.slice(offset, offset + 2), 16),
  );
  const output = new Uint8ClampedArray(source);
  for (let i = 0; i < distance.length; i++) {
    if (distance[i] === 0 || distance[i] > radius + 0.5) continue;
    const foreground = source[i * 4 + 3] / 255,
      stroke = Math.min(1, Math.max(0, radius + 0.5 - distance[i]));
    const alpha = foreground + stroke * (1 - foreground);
    if (!alpha) continue;
    for (let c = 0; c < 3; c++)
      output[i * 4 + c] =
        (source[i * 4 + c] * foreground + rgb[c] * stroke * (1 - foreground)) /
        alpha;
    output[i * 4 + 3] = alpha * 255;
  }
  return output;
}
