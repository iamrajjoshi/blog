import { useRef, useEffect, useCallback, useState } from "react";
import { useReducedMotion } from "@hooks/use-reduced-motion";
import {
  loadImage,
  processImage,
  floydSteinberg,
  createDotSystem,
  updateDots,
  renderDots,
  type DotSystem,
  type Shockwave,
} from "@lib/dither";

interface Props {
  src: string;
  width: number;
  height: number;
  alt?: string;
  className?: string;
}

const GRID_MAX_DIM = 250;
const THRESHOLD = 160;
const CONTRAST = 10;
const GAMMA = 1.0;
const BLUR = 2;
const DOT_SCALE = 1;

export default function DitheredImage({
  src,
  width,
  height,
  alt = "",
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const systemRef = useRef<DotSystem | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const shockwavesRef = useRef<Shockwave[]>([]);
  const animFrameRef = useRef<number>(0);
  const runningRef = useRef(false);
  const [ready, setReady] = useState(false);
  const reducedMotion = useReducedMotion();

  const startLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    const tick = () => {
      const sys = systemRef.current;
      if (!sys) {
        runningRef.current = false;
        return;
      }

      const needsMore = updateDots(
        sys,
        mouseRef.current.x,
        mouseRef.current.y,
        mouseRef.current.active,
        shockwavesRef.current,
        performance.now(),
      );

      renderDots(ctx, sys, width, height, dpr);

      if (needsMore) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        runningRef.current = false;
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [width, height]);

  useEffect(() => {
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    const init = async () => {
      const img = await loadImage(src);
      if (cancelled) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // processImage scales the longer axis to GRID_MAX_DIM,
      // shorter axis scales proportionally to preserve aspect ratio
      const processed = processImage(
        img,
        GRID_MAX_DIM,
        CONTRAST,
        GAMMA,
        BLUR,
      );

      const { positions, colors } = floydSteinberg(
        processed.grayscale,
        processed.width,
        processed.height,
        { threshold: THRESHOLD, serpentine: true, errorStrength: 1.0 },
        processed.alpha,
        processed.rgb,
      );

      const sx = width / processed.width;
      const sy = height / processed.height;
      const s = Math.min(sx, sy);
      const ox = (width - processed.width * s) / 2;
      const oy = (height - processed.height * s) / 2;

      systemRef.current = createDotSystem(
        positions,
        colors,
        s,
        DOT_SCALE,
        ox,
        oy,
      );
      setReady(true);

      const ctx = canvas.getContext("2d")!;
      renderDots(ctx, systemRef.current, width, height, dpr);
    };

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      runningRef.current = false;
    };
  }, [src, width, height, reducedMotion, startLoop]);

  // Pointer handlers
  useEffect(() => {
    if (!ready || reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.active = true;
      startLoop();
    };

    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mouseRef.current.active = false;
      startLoop();
    };

    const onUp = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      shockwavesRef.current.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        start: performance.now(),
      });
      if (e.pointerType !== "mouse") mouseRef.current.active = false;
      startLoop();
    };

    const onCancel = () => {
      mouseRef.current.active = false;
      startLoop();
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);

    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
    };
  }, [ready, reducedMotion, startLoop]);

  if (reducedMotion) {
    return (
      <img
        src={src}
        width={width}
        height={height}
        alt={alt}
        className={className}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      className={className}
      style={{ width, height, cursor: "pointer" }}
    />
  );
}
