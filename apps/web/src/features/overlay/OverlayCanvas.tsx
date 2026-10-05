// The canvas drawn on top of the full-screen camera: corner-bracket boxes
// for highlighted parts, wire polylines and label chips. All coordinate
// math (including the object-fit: cover crop and the front-camera mirror)
// lives in geometry.ts so it is unit tested without a real canvas.
//
// Taps are only captured while the agent has asked the user to point at a
// wire (mark_wire); otherwise the canvas lets every touch through.

import { type RefObject, useEffect, useRef, useState } from "react";
import type { Point1000 } from "../../lib/types";
import { useOverlayStore } from "../../store/overlayStore";
import {
  colorForIndex,
  type FrameFit,
  frameBoxToScreen,
  framePointToScreen,
  screenPointToFrame,
} from "./geometry";

interface OverlayCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  mirrored: boolean;
  /** Called with a 0-1000 frame point when the user taps while a wire tap is requested. */
  onTapPoint?: (point: Point1000) => void;
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

export function OverlayCanvas({ videoRef, mirrored, onTapPoint }: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxes = useOverlayStore((s) => s.boxes);
  const wires = useOverlayStore((s) => s.wires);
  const waitingForTap = useOverlayStore((s) => s.pendingWireHintEn !== null);
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 });
  // Bumped when the video learns its real dimensions or they change
  // (camera flip, screen share), so boxes are redrawn with the new crop.
  const [videoTick, setVideoTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const measure = () => {
      const rect = parent.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height, dpr: Math.min(window.devicePixelRatio || 1, 3) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const bump = () => setVideoTick((n) => n + 1);
    video.addEventListener("loadedmetadata", bump);
    video.addEventListener("resize", bump);
    return () => {
      video.removeEventListener("loadedmetadata", bump);
      video.removeEventListener("resize", bump);
    };
  }, [videoRef]);

  function currentFit(): FrameFit {
    const video = videoRef.current;
    return {
      containerWidth: size.width,
      containerHeight: size.height,
      videoWidth: video?.videoWidth ?? 0,
      videoHeight: video?.videoHeight ?? 0,
      mirrored,
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const fit = currentFit();

    boxes.forEach((box, index) => {
      const color = colorForIndex(index);
      const rect = frameBoxToScreen(box.box, fit);
      const pad = 4;
      const x = rect.x - pad;
      const y = rect.y - pad;
      const w = rect.width + pad * 2;
      const h = rect.height + pad * 2;

      // Soft fill so the part reads as selected, then the crisp outline.
      ctx.fillStyle = `${color}22`;
      roundRectPath(ctx, x, y, w, h, 14);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 6;
      roundRectPath(ctx, x, y, w, h, 14);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Label chip, kept on screen.
      ctx.font = "600 14px system-ui, sans-serif";
      // The page is right-to-left in Urdu; canvas text would inherit that
      // and anchor from the right edge, so pin it explicitly.
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      const textWidth = ctx.measureText(box.label).width;
      const chipW = textWidth + 18;
      const chipH = 26;
      const chipX = Math.min(Math.max(x, 8), Math.max(8, size.width - chipW - 8));
      const chipY = y - chipH - 6 < 8 ? y + 6 : y - chipH - 6;
      ctx.fillStyle = color;
      roundRectPath(ctx, chipX, chipY, chipW, chipH, 13);
      ctx.fill();
      ctx.fillStyle = "#101010";
      ctx.textBaseline = "middle";
      ctx.fillText(box.label, chipX + 9, chipY + chipH / 2 + 0.5);
    });

    wires.forEach((wire, index) => {
      const color = wire.color ?? colorForIndex(boxes.length + index);
      const pixels = wire.polyline.map((p) => framePointToScreen(p, fit));
      if (pixels.length < 2) return;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      pixels.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      pixels.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    });
    // currentFit reads refs/props already listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes, wires, size, mirrored, videoTick]);

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!waitingForTap || !onTapPoint) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onTapPoint(screenPointToFrame(event.clientX - rect.left, event.clientY - rect.top, currentFit()));
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
