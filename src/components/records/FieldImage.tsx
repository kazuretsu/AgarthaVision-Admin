"use client";

import { useEffect, useRef, useState } from "react";
import type { BoxProvenance } from "@/domain";

export interface FieldBox {
  id: string;
  /** Box centre and size, in source pixels or normalised `0..1`. */
  x: number;
  y: number;
  w: number;
  h: number;
  counted: boolean;
  provenance: BoxProvenance;
  label: string;
}

const STROKE: Record<BoxProvenance, string> = {
  model: "var(--av-gold)",
  redrawn: "var(--primary)",
  added: "var(--ok)",
  unlocated: "var(--mid)",
  unknown: "var(--mid)",
};

/**
 * A field's frame with its egg boxes drawn over it.
 *
 * Boxes are stored as centre and size in source-image pixels (`0004`); older rows
 * were written normalised to `0..1`. The overlay reads the image's natural size
 * once it loads and scales whichever form it finds, so both line up. A rejected
 * box is dashed — kept as evidence, never counted.
 *
 * A plain `<img>`: the URL is signed and expires within a minute, which an image
 * optimiser would cache past its lifetime.
 */
export function FieldImage({
  url,
  alt,
  boxes,
}: {
  url: string | null;
  alt: string;
  boxes: FieldBox[];
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const image = useRef<HTMLImageElement>(null);

  // A cached image can finish loading before hydration attaches `onLoad`, so the
  // size is also read once on mount.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth > 0) {
      setSize({ width: element.naturalWidth, height: element.naturalHeight });
    }
  }, [url]);

  if (!url) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[10px] border border-dashed border-stone-line bg-surface-sunken text-[12px] text-stone-mid">
        Image unavailable
      </div>
    );
  }

  const normalised = boxes.every((box) => box.x <= 1 && box.y <= 1 && box.w <= 1 && box.h <= 1);
  const scaleX = normalised && size ? size.width : 1;
  const scaleY = normalised && size ? size.height : 1;

  return (
    <div className="relative w-full overflow-hidden rounded-[10px] border border-stone-hair bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, see above */}
      <img
        ref={image}
        src={url}
        alt={alt}
        className="block h-auto w-full"
        onLoad={(event) =>
          setSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
      />
      {size ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {boxes.map((box) => {
            const w = box.w * scaleX;
            const h = box.h * scaleY;
            return (
              <rect
                key={box.id}
                x={box.x * scaleX - w / 2}
                y={box.y * scaleY - h / 2}
                width={w}
                height={h}
                fill="none"
                stroke={box.counted ? STROKE[box.provenance] : "var(--danger)"}
                strokeWidth={Math.max(2, size.width / 320)}
                strokeDasharray={box.counted ? undefined : "6 4"}
              />
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
