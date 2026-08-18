"use client";

import Link from "next/link";
import type { AdLibraryItem } from "@/features/ad-library/types";
import { type CreativeShapeFamily } from "@/features/discover/utils/creative-shape";
import { formatDateWatermark } from "@/features/discover/utils/date-watermark";
import { AmbientVideoPreview } from "@/features/discover/components/ambient-video-preview";
import { resolveDiscoverRepresentativeCreative } from "../utils/representative-creative";
import type { PackedFieldSlot } from "../types";

interface PackedSlotCardProps {
  item: AdLibraryItem;
  slot: PackedFieldSlot;
  clusterId?: string;
  hook?: string | null;
}

function parseSlotConstraintPx(classString?: string, type: "h" | "w" = "h"): number | null {
  if (!classString) return null;
  const regex = type === "h" ? /max-h-\[(\d+)px\]/ : /max-w-\[(\d+)px\]/;
  const match = classString.match(regex);
  return match ? parseInt(match[1], 10) : null;
}

export const SLOT_MAX_HEIGHT_PX: Record<string, number> = {
  H: 460,
  C: 460,
  D: 620,
  E: 420,
  A: 220,
  F: 320,
  B: 360,
  G: 340,
};

export function getSlotPreferredWidthCss(
  slotId: string,
  shapeFamily: CreativeShapeFamily,
  aspectRatio: number,
): string {
  switch (slotId) {
    case "H":
      if (shapeFamily === "wide") return "clamp(700px, 58vw, 980px)";
      return "clamp(620px, 52vw, 900px)"; // landscape

    case "C":
      if (shapeFamily === "square" && aspectRatio < 1.0) return "clamp(280px, 24vw, 360px)";
      return "clamp(240px, 20vw, 320px)"; // portrait

    case "D":
      if (shapeFamily === "square" && aspectRatio <= 0.9) return "clamp(300px, 26vw, 380px)";
      return "clamp(260px, 22vw, 340px)"; // portrait

    case "E":
      if (shapeFamily === "square") return "clamp(360px, 32vw, 480px)";
      if (shapeFamily === "portrait") return "clamp(280px, 24vw, 360px)";
      return "clamp(420px, 38vw, 560px)"; // landscape

    case "A":
      if (shapeFamily === "portrait") return "clamp(140px, 12vw, 200px)";
      return "clamp(150px, 14vw, 220px)"; // square/balanced

    case "F":
      if (shapeFamily === "wide") return "clamp(440px, 38vw, 600px)";
      return "clamp(380px, 34vw, 520px)"; // landscape

    case "B":
      if (shapeFamily === "square") return "clamp(340px, 30vw, 460px)";
      return "clamp(400px, 36vw, 540px)"; // landscape

    case "G":
      if (shapeFamily === "wide") return "clamp(480px, 42vw, 640px)";
      return "clamp(420px, 38vw, 580px)"; // landscape

    default:
      return "100%";
  }
}

export function PackedSlotCard({
  item,
  slot,
  clusterId,
  hook = null,
}: PackedSlotCardProps) {
  const rep = resolveDiscoverRepresentativeCreative(item);
  const dateWatermark = formatDateWatermark(item.firstSeenAt);

  // Dynamic alignment classes inside the slot's territory
  const hAlignClass =
    slot.alignment.horizontal === "start"
      ? "items-start"
      : slot.alignment.horizontal === "end"
        ? "items-end"
        : "items-center";

  const vAlignClass =
    slot.alignment.vertical === "start"
      ? "justify-start"
      : slot.alignment.vertical === "end"
        ? "justify-end"
        : "justify-center";

  const maxHeightPx =
    SLOT_MAX_HEIGHT_PX[slot.id] ?? parseSlotConstraintPx(slot.maxMediaHeightClass, "h") ?? 460;

  const preferredWidthCss = getSlotPreferredWidthCss(
    slot.id,
    rep.shapeFamily,
    rep.aspectRatio,
  );
  const heightCapWidthPx = Math.round(maxHeightPx * rep.aspectRatio);

  const mediaShellStyle: React.CSSProperties = {
    aspectRatio: rep.aspectRatioCss,
    width: `min(${preferredWidthCss}, ${heightCapWidthPx}px)`,
    maxWidth: "100%",
    maxHeight: `min(${maxHeightPx}px, 70vh)`,
  };

  return (
    <div className={`w-full h-full flex flex-col ${vAlignClass} ${hAlignClass}`}>
      <div className="flex flex-col items-start w-fit max-w-full">
        {/* 1. Media Shell with Exact Physical Source Ratio */}
        <div
          className="relative bg-[#030406] border border-[#161820] overflow-hidden rounded-[6px]"
          style={mediaShellStyle}
        >
          {rep.isVideo && rep.video ? (
            /* Ambient Video Preview (Max-3 Coordinator Managed) */
            <AmbientVideoPreview
              id={item.id}
              clusterId={clusterId ?? `slot-${slot.id}`}
              originalVideoUrl={rep.video.mediaUrl}
              previewLoopUrl={rep.video.previewLoopUrl}
              posterUrl={rep.preview?.mediaUrl}
              title={item.brand.name}
              isLead={slot.weight === "anchor"}
            />
          ) : rep.displayMedia ? (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rep.displayMedia.mediaUrl}
                alt={item.brand.name}
                loading="lazy"
                className="w-full h-full max-w-full max-h-full object-contain object-center"
              />
            </div>
          ) : (
            <div className="w-full h-full min-h-32 flex items-center justify-center font-mono text-xs text-[#686e7b]">
              Creative Media
            </div>
          )}

          {/* Date Watermark (Anchored to true Media Shell silhouette) */}
          {dateWatermark && (
            <div
              className="absolute top-2 right-2 z-10 font-mono text-[10px] font-medium tracking-wide uppercase text-[#d1d5db] bg-[#07080a]/75 px-1.5 py-0.5 border border-[#ffffff12] rounded-[2px] select-none pointer-events-none"
              aria-hidden="true"
            >
              {dateWatermark}
            </div>
          )}
        </div>

        {/* 2. Caption: Brand + Optional Hook (Attached to Media Shell width) */}
        <div className="flex flex-col gap-0.5 pt-2 w-full">
          <Link
            href={`/ads/${item.id}`}
            className="inline-flex items-center text-sm font-medium font-sans text-[#f3f4f6] hover:text-[#e07945] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e07945] w-fit"
            aria-label={`Inspect ${item.brand.name} creative`}
          >
            <span>{item.brand.name}</span>
          </Link>

          {hook && hook.trim() !== "" && (
            <p className="text-xs text-[#9da2ad] font-sans leading-relaxed line-clamp-2">
              {hook}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


