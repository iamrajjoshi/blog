import { useEffect, useRef, useState, useCallback, createElement } from "react";
import { useReducedMotion } from "@hooks/use-reduced-motion";

type TextScrambleProps = {
  children?: React.ReactNode;
  text?: string;
  className?: string;
  delay?: number;
  duration?: number;
  onComplete?: () => void;
  as?: "p" | "span" | "h1" | "h2" | "h3";
};

type CharState = {
  displayChar: string;
  resolved: boolean;
};

const SCRAMBLE_CHARS = ".:'-~+=*!?|/\\<>{}#@&";
const SCRAMBLE_INTERVAL_MS = 50;

function randomScrambleChar(): string {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

function measureCharWidths(text: string, font: string): number[] {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  return Array.from(text).map((char) => ctx.measureText(char).width);
}

export default function TextScramble({
  children,
  text: textProp,
  className,
  delay = 0,
  duration = 1200,
  onComplete,
  as: Tag = "p",
}: TextScrambleProps) {
  // Resolve text from explicit prop or string children (Astro passes children as React nodes)
  const text = textProp ?? (typeof children === "string" ? children : "");
  const reducedMotion = useReducedMotion();
  const [chars, setChars] = useState<CharState[]>([]);
  const [charWidths, setCharWidths] = useState<number[]>([]);
  const [fontsReady, setFontsReady] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveTimesRef = useRef<number[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Wait for fonts to load before measuring
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect font string from the rendered element
  const containerRef = useRef<HTMLElement | null>(null);
  const [font, setFont] = useState<string | null>(null);

  const refCallback = useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
    if (node && fontsReady) {
      const style = getComputedStyle(node);
      const size = style.fontSize;
      const weight = style.fontWeight;
      const fontStyle = style.fontStyle;
      const family = style.fontFamily.split(",")[0].trim().replace(/['"]/g, "");
      // Build CSS font shorthand: [style] [weight] size family
      const parts: string[] = [];
      if (fontStyle && fontStyle !== "normal") parts.push(fontStyle);
      if (weight && weight !== "400") parts.push(weight);
      parts.push(size);
      parts.push(family);
      setFont(parts.join(" "));
    }
  }, [fontsReady]);

  // Measure character widths and initialize state when font is ready
  useEffect(() => {
    if (!font || !text) return;

    const widths = measureCharWidths(text, font);
    setCharWidths(widths);

    if (reducedMotion) {
      setChars(
        Array.from(text).map((ch) => ({
          displayChar: ch,
          resolved: true,
        })),
      );
      return;
    }

    // Initialize all characters as scrambled (spaces start resolved)
    const initial: CharState[] = Array.from(text).map((ch) => ({
      displayChar: ch === " " ? " " : randomScrambleChar(),
      resolved: ch === " ",
    }));
    setChars(initial);

    // Compute resolve times for each character
    const textLen = text.length;
    const times: number[] = [];
    const now = performance.now();
    for (let i = 0; i < textLen; i++) {
      if (text[i] === " ") {
        times.push(now); // spaces resolve immediately
      } else {
        const jitter = (Math.random() - 0.5) * 100; // -50 to +50ms
        times.push(now + delay + (i / textLen) * duration + jitter);
      }
    }
    resolveTimesRef.current = times;

    // Start the scramble interval after the delay
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        const t = performance.now();
        setChars((prev) => {
          let allResolved = true;
          const next = prev.map((c, i) => {
            if (c.resolved) return c;
            if (t >= resolveTimesRef.current[i]) {
              return { displayChar: text[i], resolved: true };
            }
            allResolved = false;
            return { displayChar: randomScrambleChar(), resolved: false };
          });

          if (allResolved) {
            // Clear the interval from within setState callback
            if (intervalRef.current !== null) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            onCompleteRef.current?.();
          } else {
            allResolved = false;
          }

          return next;
        });
      }, SCRAMBLE_INTERVAL_MS);
    }, delay);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [font, text, delay, duration, reducedMotion]);

  // Handle empty string
  if (!text) {
    return createElement(Tag, { className });
  }

  // Reduced motion: render plain text
  if (reducedMotion) {
    return createElement(Tag, { className, ref: refCallback }, text);
  }

  // Before fonts are ready or widths measured, render invisible text for sizing
  if (!fontsReady || charWidths.length === 0 || chars.length === 0) {
    return createElement(
      Tag,
      { className, ref: refCallback },
      // Render the text invisibly so the element exists for font measurement
      createElement(
        "span",
        { style: { visibility: "hidden" } },
        text,
      ),
    );
  }

  return createElement(
    Tag,
    { className, ref: refCallback },
    chars.map((c, i) =>
      createElement(
        "span",
        {
          key: i,
          style: {
            display: "inline-block",
            width: charWidths[i],
            textAlign: "center" as const,
            color: c.resolved ? undefined : "#52525b",
            transition: "color 0.15s ease",
          },
        },
        c.displayChar,
      ),
    ),
  );
}
