// The canvas drawn on top of the full-screen camera: corner-bracket boxes
// for highlighted parts, segmented wire outlines and label chips. All
// coordinate math (including the object-fit: cover crop and the
// front-camera mirror) lives in geometry.ts and the animation maths in
// motion.ts, so both are unit tested without a real canvas.
//
// One requestAnimationFrame loop reads the latest boxes/wires straight from
// the zustand store (no React re-render per frame) and eases what is shown
// toward them, so boxes glide to parts and wires draw themselves in.
//
// Taps are only captured while the agent has asked the user to point at a
// wire (mark_wire); otherwise the canvas lets every touch through.

import { type MutableRefObject, type RefObject, useEffect, useRef, useState } from "react";
import type { Box2D, Point1000 } from "../../lib/types";
import { useOverlayStore } from "../../store/overlayStore";
import {
  colorForIndex,
  coverTransform,
  type FrameFit,
  frameBoxToScreen,
  framePointToScreen,
  type PixelPoint,
  screenPointToFrame,
} from "./geometry";
import {
  easeOutCubic,
  lerp,
  lerpBox,
  offsetPoints,
  revealPolyline,
} from "./motion";

export interface OverlayBackdrop {
  src: string;
  width: number;
  height: number;
}

interface OverlayCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  mirrored: boolean;
  /** Called with a 0-1000 frame point when the user taps while a wire tap is requested. */
  onTapPoint?: (point: Point1000) => void;
  /** Demo scene drawn by the canvas itself (instead of a camera) so it can drift. */
  backdrop?: OverlayBackdrop;
  /** Scene drift in 0-1000 normalised units; absent means zero. */
  driftRef?: MutableRefObject<{ x: number; y: number }>;
}

const BACKDROP_ZOOM = 1.06;
const BOX_EASE = 0.22;
const BOX_IN_MS = 200;
const FADE_OUT_MS = 200;
const WIRE_IN_MS = 700;
const ZERO_DRIFT = { x: 0, y: 0 };
const CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;

interface BoxState {
  label: string;
  color: string;
  shown: Box2D;
  target: Box2D;
  born: number;
  removedAt: number | null;
}

interface WireState {
  polyline: Point1000[];
  color: string;
  label: string;
  born: number;
  removedAt: number | null;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function tracePolyline(ctx: CanvasRenderingContext2D, pts: PixelPoint[]) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
    else ctx.lineTo(pts[i].x, pts[i].y);
  }
}

/** Dark text on light colours and the reverse, for chips on any wire colour. */
function textOn(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return "#101010";
  const n = Number.parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.45 ? "#ffffff" : "#101010";
}

const CHIP_H = 26;

function chipWidth(ctx: CanvasRenderingContext2D, text: string): number {
  ctx.font = "600 14px system-ui, sans-serif";
  // Canvas text would inherit the page direction and anchor from the right
  // edge in an RTL page, so pin it explicitly.
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  return ctx.measureText(text).width + 18;
}

function drawChip(ctx: CanvasRenderingContext2D, text: string, fill: string, x: number, y: number, w: number) {
  ctx.fillStyle = fill;
  roundRectPath(ctx, x, y, w, CHIP_H, CHIP_H / 2);
  ctx.fill();
  ctx.fillStyle = textOn(fill);
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 9, y + CHIP_H / 2 + 0.5);
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  color: string,
  label: string,
  alpha: number,
  pulse: number,
  canvasWidth: number,
) {
  const { x, y, width: w, height: h } = rect;
  const r = Math.min(14, w / 2, h / 2);
  ctx.save();

  // Soft translucent fill so the part reads as selected.
  ctx.globalAlpha = alpha * 0.14;
  ctx.fillStyle = color;
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.fill();

  // Crisp outline with a gentle pulsing glow.
  ctx.globalAlpha = alpha * (0.6 + 0.4 * pulse);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6 + 10 * pulse;
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.stroke();

  // Four thick corner brackets.
  const len = Math.min(26, w / 2, h / 2);
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = 4 + 6 * pulse;
  ctx.beginPath();
  for (const [sx, sy] of CORNERS) {
    const cx = sx ? x + w : x;
    const cy = sy ? y + h : y;
    const dx = sx ? -1 : 1;
    const dy = sy ? -1 : 1;
    ctx.moveTo(cx, cy + dy * len);
    ctx.lineTo(cx, cy + dy * r);
    ctx.arcTo(cx, cy, cx + dx * r, cy, r);
    ctx.lineTo(cx + dx * len, cy);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Label chip, kept on screen.
  const chipW = chipWidth(ctx, label);
  const chipX = Math.min(Math.max(x, 8), Math.max(8, canvasWidth - chipW - 8));
  const chipY = y - CHIP_H - 6 < 8 ? y + 6 : y - CHIP_H - 6;
  drawChip(ctx, label, color, chipX, chipY, chipW);
  ctx.restore();
}

function drawWire(
  ctx: CanvasRenderingContext2D,
  pts: PixelPoint[],
  color: string,
  alpha: number,
  flowOffset: number | null,
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // (a) wide translucent segmentation mask
  ctx.globalAlpha = alpha * 0.28;
  ctx.strokeStyle = color;
  ctx.lineWidth = 18;
  tracePolyline(ctx, pts);
  ctx.stroke();

  // (b) dark thin outline so the wire reads on any background
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 7.5;
  tracePolyline(ctx, pts);
  ctx.stroke();

  // (c) crisp coloured stroke
  ctx.strokeStyle = color;
  ctx.lineWidth = 4.5;
  tracePolyline(ctx, pts);
  ctx.stroke();

  // (d) animated flow
  if (flowOffset !== null) {
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.2;
    ctx.setLineDash([2, 14]);
    ctx.lineDashOffset = flowOffset;
    tracePolyline(ctx, pts);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  // (e) end-cap dots
  ctx.globalAlpha = alpha;
  for (const p of [pts[0], pts[pts.length - 1]]) {
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function buildFit(
  video: HTMLVideoElement | null,
  backdrop: OverlayBackdrop | undefined,
  width: number,
  height: number,
  mirrored: boolean,
): FrameFit {
  return {
    containerWidth: width,
    containerHeight: height,
    videoWidth: backdrop ? backdrop.width : (video?.videoWidth ?? 0),
    videoHeight: backdrop ? backdrop.height : (video?.videoHeight ?? 0),
    mirrored,
  };
}

export function OverlayCanvas({ videoRef, mirrored, onTapPoint, backdrop, driftRef }: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waitingForTap = useOverlayStore((s) => s.pendingWireHintEn !== null);
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 });

  // Latest values for the animation loop and the tap handler.
  const sizeRef = useRef(size);
  const mirroredRef = useRef(mirrored);
  const backdropRef = useRef(backdrop);
  const driftPropRef = useRef(driftRef);
  const reducedRef = useRef(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    mirroredRef.current = mirrored;
    backdropRef.current = backdrop;
    driftPropRef.current = driftRef;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const measure = () => {
      const rect = parent.getBoundingClientRect();
      const next = { width: rect.width, height: rect.height, dpr: Math.min(window.devicePixelRatio || 1, 3) };
      sizeRef.current = next;
      setSize(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    reducedRef.current = !!mq?.matches;
    const onChange = () => {
      reducedRef.current = !!mq?.matches;
    };
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  // Decode the demo backdrop once before it is ever drawn.
  const backdropSrc = backdrop?.src;
  useEffect(() => {
    imageRef.current = null;
    if (!backdropSrc) return;
    let cancelled = false;
    const img = new Image();
    const ready = () => {
      if (!cancelled) imageRef.current = img;
    };
    img.src = backdropSrc;
    if (typeof img.decode === "function") img.decode().then(ready, ready);
    else img.onload = ready;
    return () => {
      cancelled = true;
    };
  }, [backdropSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // jsdom has no 2D context; there is nothing to animate without one.
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const boxStates = new Map<string, BoxState>();
    const wireStates = new Map<string, WireState>();
    const smoothDrift = { x: 0, y: 0 };
    let last = -1;
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const { width, height, dpr } = sizeRef.current;
      if (width === 0 || height === 0) return;
      const dt = last < 0 ? 16.667 : Math.min(64, Math.max(0, now - last));
      last = now;
      const reduced = reducedRef.current;
      const ease = reduced ? 1 : 1 - (1 - BOX_EASE) ** (dt / 16.667);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const bd = backdropRef.current;
      const fit = buildFit(videoRef.current, bd, width, height, mirroredRef.current);
      const zoom = bd ? BACKDROP_ZOOM : 1;
      const cx = width / 2;
      const cy = height / 2;
      const drift = reduced ? ZERO_DRIFT : (driftPropRef.current?.current ?? ZERO_DRIFT);

      // Backdrop, shifted by the raw drift and slightly oversized.
      const img = imageRef.current;
      if (bd && img && img.naturalWidth > 0) {
        const t = coverTransform(fit);
        ctx.save();
        if (fit.mirrored) {
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
        }
        ctx.translate(cx, cy);
        ctx.scale(zoom, zoom);
        ctx.translate(-cx, -cy);
        ctx.translate((drift.x / 1000) * t.displayWidth, (drift.y / 1000) * t.displayHeight);
        ctx.drawImage(img, t.offsetX, t.offsetY, t.displayWidth, t.displayHeight);
        ctx.restore();
      }

      const store = useOverlayStore.getState();
      const pulse = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(now / 420);

      // Sync box states with the store.
      const seenBoxes = new Set<string>();
      store.boxes.forEach((hb, index) => {
        seenBoxes.add(hb.id);
        const tgt = {
          ymin: hb.box.ymin + drift.y,
          xmin: hb.box.xmin + drift.x,
          ymax: hb.box.ymax + drift.y,
          xmax: hb.box.xmax + drift.x,
        };
        let s = boxStates.get(hb.id);
        if (!s) {
          s = { label: hb.label, color: colorForIndex(index), shown: tgt, target: tgt, born: now, removedAt: null };
          boxStates.set(hb.id, s);
        }
        s.label = hb.label;
        s.color = colorForIndex(index);
        s.target = tgt;
        s.removedAt = null;
      });
      for (const [id, s] of boxStates) {
        if (!seenBoxes.has(id) && s.removedAt === null) s.removedAt = now;
        if (s.removedAt !== null && (reduced || now - s.removedAt >= FADE_OUT_MS)) boxStates.delete(id);
      }

      // Sync wire states with the store.
      const seenWires = new Set<string>();
      store.wires.forEach((w, index) => {
        seenWires.add(w.id);
        let s = wireStates.get(w.id);
        if (!s) {
          s = { polyline: w.polyline, color: "", label: w.label, born: now, removedAt: null };
          wireStates.set(w.id, s);
        }
        s.polyline = w.polyline;
        s.label = w.label;
        s.color = w.color ?? colorForIndex(store.boxes.length + index);
        s.removedAt = null;
      });
      for (const [id, s] of wireStates) {
        if (!seenWires.has(id) && s.removedAt === null) s.removedAt = now;
        if (s.removedAt !== null && (reduced || now - s.removedAt >= FADE_OUT_MS)) wireStates.delete(id);
      }

      // Wires glide with a smoothed copy of the drift.
      smoothDrift.x = lerp(smoothDrift.x, drift.x, ease);
      smoothDrift.y = lerp(smoothDrift.y, drift.y, ease);
      const flowOffset = reduced ? null : -((now * 0.035) % 16);

      const toScreen = (p: Point1000): PixelPoint => {
        const s = framePointToScreen(p, fit);
        return { x: cx + (s.x - cx) * zoom, y: cy + (s.y - cy) * zoom };
      };

      let wireSlot = 0;
      for (const s of wireStates.values()) {
        if (s.polyline.length < 2) continue;
        const slot = wireSlot++ % 3;
        const progress = reduced ? 1 : easeOutCubic((now - s.born) / WIRE_IN_MS);
        const fade = s.removedAt === null ? 1 : 1 - (now - s.removedAt) / FADE_OUT_MS;
        const shifted = offsetPoints(revealPolyline(s.polyline, progress), smoothDrift.x, smoothDrift.y);
        const pts = shifted.map(toScreen);
        drawWire(ctx, pts, s.color, Math.max(0, fade), flowOffset);
        const labelAlpha = Math.min(1, Math.max(0, (progress - 0.7) / 0.3)) * Math.max(0, fade);
        if (s.label && labelAlpha > 0) {
          // Chips hang off the wire's END and fan out left / below / right, so
          // neighbouring wires never stack their labels on top of each other.
          const end = pts[pts.length - 1];
          const chipW = chipWidth(ctx, s.label);
          ctx.save();
          ctx.globalAlpha = labelAlpha;
          const rawX = slot === 0 ? end.x - chipW - 14 : slot === 1 ? end.x - chipW / 2 : end.x + 14;
          const rawY = slot === 1 ? end.y + 16 : end.y - CHIP_H / 2;
          const chipX = Math.min(Math.max(rawX, 8), Math.max(8, width - chipW - 8));
          const chipY = Math.min(Math.max(rawY, 8), Math.max(8, height - CHIP_H - 8));
          drawChip(ctx, s.label, s.color, chipX, chipY, chipW);
          ctx.restore();
        }
      }

      for (const s of boxStates.values()) {
        s.shown = lerpBox(s.shown, s.target, ease);
        const age = reduced ? BOX_IN_MS : now - s.born;
        const inT = easeOutCubic(age / BOX_IN_MS);
        const fade = s.removedAt === null ? 1 : Math.max(0, 1 - (now - s.removedAt) / FADE_OUT_MS);
        const r = frameBoxToScreen(s.shown, fit);
        const pad = 4;
        const grow = 1 + 0.12 * (1 - inT);
        const w = (r.width * zoom + pad * 2) * grow;
        const h = (r.height * zoom + pad * 2) * grow;
        const mx = cx + (r.x + r.width / 2 - cx) * zoom;
        const my = cy + (r.y + r.height / 2 - cy) * zoom;
        drawBox(ctx, { x: mx - w / 2, y: my - h / 2, width: w, height: h }, s.color, s.label, inT * fade, pulse, width);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!waitingForTap || !onTapPoint) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const { width, height } = sizeRef.current;
    const bd = backdropRef.current;
    const zoom = bd ? BACKDROP_ZOOM : 1;
    const drift = driftPropRef.current?.current ?? ZERO_DRIFT;
    const cx = width / 2;
    const cy = height / 2;
    const x = cx + (event.clientX - rect.left - cx) / zoom;
    const y = cy + (event.clientY - rect.top - cy) / zoom;
    const p = screenPointToFrame(x, y, buildFit(videoRef.current, bd, width, height, mirroredRef.current));
    const clamp = (n: number) => Math.min(1000, Math.max(0, n));
    onTapPoint({ x: clamp(p.x - drift.x), y: clamp(p.y - drift.y) });
  }

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(size.width * size.dpr)}
      height={Math.round(size.height * size.dpr)}
      style={{ width: size.width, height: size.height }}
      className={`absolute inset-0 ${waitingForTap ? "cursor-crosshair" : "pointer-events-none"}`}
      onPointerUp={handlePointerUp}
      aria-hidden="true"
      data-testid="overlay-canvas"
    />
  );
}
