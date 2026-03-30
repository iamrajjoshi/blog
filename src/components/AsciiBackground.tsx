import { useRef, useEffect, useCallback } from "react";
import { useReducedMotion } from "@hooks/use-reduced-motion";

const CHARS = ".:'-~+=*!?|/\\(){}[]<>#@&$%^";
const TEAL: [number, number, number] = [94, 234, 212];
const PARTICLE_COUNT_MIN = 15;
const PARTICLE_COUNT_MAX = 25;
const TARGET_PARTICLE_COUNT = 20;
const FONT_WEIGHTS = [300, 500, 800] as const;

interface Particle {
  x: number;
  y: number;
  char: string;
  weight: number;
  fontSize: number;
  opacity: number;
  maxOpacity: number;
  speed: number;
  wobblePhase: number;
  wobbleAmp: number;
  lifetime: number;
  age: number;
}

function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

function createParticle(width: number, height: number): Particle {
  return {
    x: randomRange(0, width),
    y: height + 10,
    char: randomChar(),
    weight: FONT_WEIGHTS[Math.floor(Math.random() * FONT_WEIGHTS.length)],
    fontSize: randomRange(12, 18),
    opacity: 0,
    maxOpacity: randomRange(0.03, 0.08),
    speed: randomRange(0.3, 0.8),
    wobblePhase: randomRange(0, Math.PI * 2),
    wobbleAmp: randomRange(0.3, 1.2),
    lifetime: randomRange(6, 12) * 30, // convert seconds to frames at 30fps
    age: 0,
  };
}

function createStaticParticle(width: number, height: number): Particle {
  return {
    x: randomRange(0, width),
    y: randomRange(0, height),
    char: randomChar(),
    weight: FONT_WEIGHTS[Math.floor(Math.random() * FONT_WEIGHTS.length)],
    fontSize: randomRange(12, 18),
    opacity: randomRange(0.03, 0.06),
    maxOpacity: randomRange(0.03, 0.06),
    speed: 0,
    wobblePhase: 0,
    wobbleAmp: 0,
    lifetime: Infinity,
    age: 0,
  };
}

function computeOpacity(particle: Particle): number {
  const { age, lifetime, maxOpacity } = particle;
  const progress = age / lifetime;
  if (progress < 0.2) {
    return maxOpacity * (progress / 0.2);
  }
  if (progress > 0.8) {
    return maxOpacity * ((1 - progress) / 0.2);
  }
  return maxOpacity;
}

export default function AsciiBackground({
  className,
}: {
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const frameCountRef = useRef(0);
  const rafRef = useRef<number>(0);
  const reducedMotion = useReducedMotion();

  const initParticles = useCallback(
    (width: number, height: number) => {
      const count = Math.floor(
        randomRange(PARTICLE_COUNT_MIN, PARTICLE_COUNT_MAX)
      );
      const particles: Particle[] = [];
      for (let i = 0; i < count; i++) {
        if (reducedMotion) {
          particles.push(createStaticParticle(width, height));
        } else {
          const p = createParticle(width, height);
          // Scatter initial particles across the viewport so it doesn't start empty
          p.y = randomRange(0, height);
          p.age = randomRange(0, p.lifetime * 0.6);
          p.opacity = computeOpacity(p);
          particles.push(p);
        }
      }
      particlesRef.current = particles;
    },
    [reducedMotion]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateSize();
    initParticles(window.innerWidth, window.innerHeight);

    const handleResize = () => {
      updateSize();
      initParticles(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    if (reducedMotion) {
      // Render once for static display
      const particles = particlesRef.current;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of particles) {
        ctx.font = `${p.weight} ${p.fontSize}px Inter`;
        ctx.fillStyle = `rgba(${TEAL[0]}, ${TEAL[1]}, ${TEAL[2]}, ${p.opacity})`;
        ctx.fillText(p.char, p.x, p.y);
      }
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      frameCountRef.current++;

      // Skip every other frame for 30fps target
      if (frameCountRef.current % 2 !== 0) return;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const particles = particlesRef.current;

      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age++;
        p.y -= p.speed;
        p.x += Math.sin(p.age * 0.02 + p.wobblePhase) * p.wobbleAmp;
        p.opacity = computeOpacity(p);

        if (p.age >= p.lifetime || p.y < -20) {
          particles.splice(i, 1);
          continue;
        }

        ctx.font = `${p.weight} ${p.fontSize}px Inter`;
        ctx.fillStyle = `rgba(${TEAL[0]}, ${TEAL[1]}, ${TEAL[2]}, ${p.opacity})`;
        ctx.fillText(p.char, p.x, p.y);
      }

      // Maintain target particle count
      while (particles.length < TARGET_PARTICLE_COUNT) {
        particles.push(createParticle(width, height));
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [reducedMotion, initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -3,
        pointerEvents: "none",
      }}
    />
  );
}
