export interface DitherOptions {
  threshold: number;
  serpentine: boolean;
  errorStrength: number;
}

export interface ProcessedImage {
  grayscale: Uint8Array;
  alpha: Uint8Array;
  rgb: Uint8Array;
  width: number;
  height: number;
}

// --- Image Processing ---

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function processImage(
  img: HTMLImageElement,
  maxDimension: number,
  contrast: number,
  gamma: number,
  blur: number,
): ProcessedImage {
  const aspect = img.naturalWidth / img.naturalHeight;
  let outW: number, outH: number;
  if (aspect >= 1) {
    outW = maxDimension;
    outH = Math.round(maxDimension / aspect);
  } else {
    outH = maxDimension;
    outW = Math.round(maxDimension * aspect);
  }

  // Alpha mask from unblurred image
  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = outW;
  alphaCanvas.height = outH;
  const alphaCtx = alphaCanvas.getContext("2d")!;
  alphaCtx.imageSmoothingEnabled = true;
  alphaCtx.imageSmoothingQuality = "high";
  alphaCtx.drawImage(img, 0, 0, outW, outH);
  const alphaData = alphaCtx.getImageData(0, 0, outW, outH).data;

  // Blur at source resolution
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const pad = Math.ceil(blur * 3);
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcW + pad * 2;
  srcCanvas.height = srcH + pad * 2;
  const srcCtx = srcCanvas.getContext("2d")!;
  if (blur > 0) srcCtx.filter = `blur(${blur}px)`;
  srcCtx.drawImage(img, pad, pad, srcW, srcH);
  srcCtx.filter = "none";

  // Downsample
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(srcCanvas, pad, pad, srcW, srcH, 0, 0, outW, outH);

  const pixels = ctx.getImageData(0, 0, outW, outH).data;
  const grayscale = new Uint8Array(outW * outH);
  const alpha = new Uint8Array(outW * outH);
  const rgb = new Uint8Array(outW * outH * 3);
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const idx = (y * outW + x) * 4;
      const pixIdx = y * outW + x;
      const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
      const blurredAlpha = pixels[idx + 3] / 255;
      alpha[pixIdx] = alphaData[idx + 3];

      // Store original color from unblurred image for dot tinting
      rgb[pixIdx * 3] = alphaData[idx];
      rgb[pixIdx * 3 + 1] = alphaData[idx + 1];
      rgb[pixIdx * 3 + 2] = alphaData[idx + 2];

      let luma = blurredAlpha > 0.01
        ? (0.299 * r + 0.587 * g + 0.114 * b) / blurredAlpha
        : 0;
      if (contrast !== 0) luma = contrastFactor * (luma - 128) + 128;
      if (gamma !== 1.0) luma = 255 * Math.pow(Math.max(0, luma / 255), 1 / gamma);
      grayscale[pixIdx] = Math.max(0, Math.min(255, Math.round(luma)));
    }
  }

  return { grayscale, alpha, rgb, width: outW, height: outH };
}

// --- Floyd-Steinberg ---

export interface DitherResult {
  positions: Float32Array;
  colors: Uint8Array;
}

export function floydSteinberg(
  grayscale: Uint8Array,
  width: number,
  height: number,
  opts: DitherOptions,
  alpha: Uint8Array,
  rgb: Uint8Array,
): DitherResult {
  const errors = new Float32Array(width * height);
  for (let i = 0; i < grayscale.length; i++) errors[i] = grayscale[i];

  const positions: number[] = [];
  const colorList: number[] = [];

  for (let y = 0; y < height; y++) {
    const ltr = !opts.serpentine || y % 2 === 0;
    const startX = ltr ? 0 : width - 1;
    const endX = ltr ? width : -1;
    const step = ltr ? 1 : -1;

    for (let x = startX; x !== endX; x += step) {
      const idx = y * width + x;
      if (alpha[idx] < 128) continue;

      const oldVal = errors[idx];
      const newVal = oldVal > opts.threshold ? 255 : 0;
      const err = (oldVal - newVal) * opts.errorStrength;

      if (newVal > 0) {
        positions.push(x, y);
        colorList.push(rgb[idx * 3], rgb[idx * 3 + 1], rgb[idx * 3 + 2]);
      }

      const diffuse = (nx: number, ny: number, w: number) => {
        if (nx < 0 || nx >= width || ny >= height) return;
        const ni = ny * width + nx;
        if (alpha[ni] < 128) return;
        errors[ni] += err * w;
      };

      diffuse(x + step, y, 7 / 16);
      diffuse(x - step, y + 1, 3 / 16);
      diffuse(x, y + 1, 5 / 16);
      diffuse(x + step, y + 1, 1 / 16);
    }
  }

  return { positions: new Float32Array(positions), colors: new Uint8Array(colorList) };
}

// --- Dot System ---

export interface DotSystem {
  count: number;
  baseX: Float32Array;
  baseY: Float32Array;
  dx: Float32Array;
  dy: Float32Array;
  colors: Uint8Array;
  size: number;
}

export interface Shockwave {
  x: number;
  y: number;
  start: number;
}

const SHOCKWAVE_SPEED = 225;
const SHOCKWAVE_WIDTH = 37;
const SHOCKWAVE_STRENGTH = 20;
const SHOCKWAVE_DURATION = 675;
const MOUSE_RADIUS = 60;
const MOUSE_RADIUS_SQ = MOUSE_RADIUS * MOUSE_RADIUS;
const MOUSE_FORCE_PEAK = 30;
const EASING = 0.12;
const SNAP_THRESHOLD = 0.01;

export function createDotSystem(
  points: Float32Array,
  colors: Uint8Array,
  scaleFactor: number,
  dotScale: number,
  offsetX: number,
  offsetY: number,
): DotSystem {
  const count = points.length / 2;
  const baseX = new Float32Array(count);
  const baseY = new Float32Array(count);
  const dx = new Float32Array(count);
  const dy = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    baseX[i] = offsetX + points[i * 2] * scaleFactor;
    baseY[i] = offsetY + points[i * 2 + 1] * scaleFactor;
  }

  return { count, baseX, baseY, dx, dy, colors, size: scaleFactor * dotScale };
}

export function updateDots(
  sys: DotSystem,
  mouseX: number,
  mouseY: number,
  mouseActive: boolean,
  shockwaves: Shockwave[],
  now: number,
): boolean {
  const { count, baseX, baseY, dx, dy } = sys;

  for (let k = shockwaves.length - 1; k >= 0; k--) {
    if (now - shockwaves[k].start >= SHOCKWAVE_DURATION) shockwaves.splice(k, 1);
  }

  let hasMotion = false;
  const shockMult = shockwaves.length > 0 ? 1 + 0.5 * (shockwaves.length - 1) : 0;

  for (let i = 0; i < count; i++) {
    let fx = 0, fy = 0;

    if (mouseActive) {
      const vx = (baseX[i] + dx[i]) - mouseX;
      const vy = (baseY[i] + dy[i]) - mouseY;
      const d2 = vx * vx + vy * vy;
      if (d2 > 0.1 && d2 < MOUSE_RADIUS_SQ) {
        const d = Math.sqrt(d2);
        const f = (1 - d / MOUSE_RADIUS);
        const force = f * f * f * MOUSE_FORCE_PEAK;
        fx += (vx / d) * force;
        fy += (vy / d) * force;
      }
    }

    for (const sw of shockwaves) {
      const elapsed = now - sw.start;
      const radius = (elapsed / 1000) * SHOCKWAVE_SPEED;
      const life = 1 - elapsed / SHOCKWAVE_DURATION;
      const sx = baseX[i] - sw.x;
      const sy = baseY[i] - sw.y;
      const dist = Math.sqrt(sx * sx + sy * sy);
      if (dist >= 0.1) {
        const band = Math.abs(dist - radius);
        if (band < SHOCKWAVE_WIDTH) {
          const wf = (1 - band / SHOCKWAVE_WIDTH) * life * SHOCKWAVE_STRENGTH * shockMult;
          fx += (sx / dist) * wf;
          fy += (sy / dist) * wf;
        }
      }
    }

    dx[i] += (fx - dx[i]) * EASING;
    dy[i] += (fy - dy[i]) * EASING;
    if (Math.abs(dx[i]) < SNAP_THRESHOLD) dx[i] = 0;
    if (Math.abs(dy[i]) < SNAP_THRESHOLD) dy[i] = 0;
    if (dx[i] !== 0 || dy[i] !== 0) hasMotion = true;
  }

  return hasMotion || shockwaves.length > 0 || mouseActive;
}

export function renderDots(
  ctx: CanvasRenderingContext2D,
  sys: DotSystem,
  canvasW: number,
  canvasH: number,
  dpr: number,
): void {
  ctx.clearRect(0, 0, canvasW * dpr, canvasH * dpr);

  const size = sys.size * dpr;
  const pad = 0.25 * dpr;
  const padSize = 0.5 * dpr;

  // Bucket dots by quantized color to minimize fillStyle changes
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < sys.count; i++) {
    const r = sys.colors[i * 3];
    const g = sys.colors[i * 3 + 1];
    const b = sys.colors[i * 3 + 2];
    const key = (r << 16) | (g << 8) | b;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(i);
  }

  buckets.forEach((indices, key) => {
    const r = (key >> 16) & 0xff;
    const g = (key >> 8) & 0xff;
    const b = key & 0xff;
    ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
    for (let j = 0; j < indices.length; j++) {
      const i = indices[j];
      const rx = (sys.baseX[i] + sys.dx[i]) * dpr;
      const ry = (sys.baseY[i] + sys.dy[i]) * dpr;
      ctx.fillRect(rx - pad, ry - pad, size + padSize, size + padSize);
    }
  });
}
