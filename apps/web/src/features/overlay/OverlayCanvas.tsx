// The canvas drawn on top of the camera feed: boxes/outlines for
// highlighted parts, wire polylines, and each one's label chip. Pure
// render of overlayStore state; all coordinate math lives in
// geometry.ts so it's unit-testable without a real canvas.

import { useEffect, useRef } from "react";
import { useOverlayStore } from "../../store/overlayStore";
import { box2dToPixelRect, colorForIndex, polylineToPixels } from "./geometry";

interface OverlayCanvasProps {
  width: number;
  height: number;
}

export function OverlayCanvas({ width, height }: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxes = useOverlayStore((s) => s.boxes);
  const wires = useOverlayStore((s) => s.wires);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    boxes.forEach((box, index) => {
      const color = colorForIndex(index);
      const rect = box2dToPixelRect(box.box, width, height);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

      const chipText = box.label;
      ctx.font = "16px sans-serif";
      const textWidth = ctx.measureText(chipText).width;
      const chipHeight = 24;
      const chipY = Math.max(rect.y - chipHeight, 0);
      ctx.fillStyle = color;
      ctx.fillRect(rect.x, chipY, textWidth + 16, chipHeight);
      ctx.fillStyle = "#0B0B0B";
      ctx.fillText(chipText, rect.x + 8, chipY + 17);
    });

    wires.forEach((wire, index) => {
      const color = wire.color ?? colorForIndex(boxes.length + index);
      const pixels = polylineToPixels(wire.polyline, width, height);
      if (pixels.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pixels[0].x, pixels[0].y);
      for (const point of pixels.slice(1)) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    });
  }, [boxes, wires, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      data-testid="overlay-canvas"
    />
  );
}
