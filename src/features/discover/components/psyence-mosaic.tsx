"use client";

import type {
  AdLibraryCreativeVariation,
  AdLibraryMediaItem,
} from "@/features/ad-library/types";
import { getVisiblePsyenceVariations } from "../utils/psyence-layout";

interface PsyenceTileProps {
  variation: AdLibraryCreativeVariation;
  index: number;
  total: number;
  remainingCount?: number;
  isSelected?: boolean;
  onHover?: (index: number | null) => void;
  onSelect?: (index: number) => void;
}

function getVariationMediaInfo(variation: AdLibraryCreativeVariation): {
  mediaUrl: string | null;
  isVideo: boolean;
  displayMedia: AdLibraryMediaItem | null;
} {
  const video = variation.media.find((m) => m.mediaType === "VIDEO");
  const preview = variation.media.find((m) => m.role === "preview");
  const image =
    variation.media.find((m) => m.role !== "preview") ?? variation.media[0];

  const isVideo = Boolean(video);
  const mediaUrl = preview?.mediaUrl ?? image?.mediaUrl ?? video?.mediaUrl ?? null;

  return {
    mediaUrl,
    isVideo,
    displayMedia: video ?? image ?? null,
  };
}

function PsyenceTile({
  variation,
  index,
  total,
  remainingCount = 0,
  isSelected = false,
  onHover,
  onSelect,
}: PsyenceTileProps) {
  const { mediaUrl, isVideo } = getVariationMediaInfo(variation);
  const position = index + 1;

  const handleMouseEnter = () => onHover?.(index);
  const handleMouseLeave = () => onHover?.(null);
  const handleFocus = () => onHover?.(index);
  const handleBlur = () => onHover?.(null);
  const handleClick = () => onSelect?.(index);

  return (
    <button
      type="button"
      className={`psyence-tile ${isSelected ? "ring-1 ring-[#d46b38] z-10" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleClick}
      aria-label={`Variation ${position} of ${total}: ${
        variation.headline || variation.body || "Creative execution"
      }`}
    >
      {/* Media Mount */}
      {mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl}
          alt={variation.headline || `Variation ${position}`}
          loading="lazy"
          className="w-full h-full max-w-full max-h-full object-contain object-center pointer-events-none select-none"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-mono text-[11px] text-[#686e7b]">
          Asset {position}
        </div>
      )}

      {/* Video Indicator Cue */}
      {isVideo && (
        <span className="absolute bottom-2 left-2 font-mono text-[10px] text-[#8e95a2] bg-[#07080a]/85 px-1.5 py-0.5 border border-[#1b1e28]/80 pointer-events-none">
          VIDEO
        </span>
      )}

      {/* Local NOTICE Positional Cue */}
      <span className="psyence-tile-cue absolute top-2 right-2 font-mono text-[11px] text-[#f3f4f6] bg-[#07080a]/90 px-1.5 py-0.5 border border-[#20242e] tabular-nums pointer-events-none">
        {position} / {total}
      </span>

      {/* Restrained Overflow Pill (+N more on 4th tile) */}
      {remainingCount > 0 && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <span className="font-mono text-xs sm:text-sm font-medium text-[#f3f4f6] bg-[#07080a]/95 border border-[#2e3340] px-2.5 py-1 shadow-lg">
            +{remainingCount} more
          </span>
        </div>
      )}
    </button>
  );
}

export interface PsyenceMosaicProps {
  variations: AdLibraryCreativeVariation[];
  selectedIndex?: number;
  onHoverVariation?: (index: number | null) => void;
  onSelectVariation?: (index: number) => void;
  maxVisible?: number;
}

export function PsyenceMosaic({
  variations,
  selectedIndex,
  onHoverVariation,
  onSelectVariation,
  maxVisible = 4,
}: PsyenceMosaicProps) {
  const { visibleVariations, remainingCount, layoutType } =
    getVisiblePsyenceVariations(variations, maxVisible);
  const total = variations.length;

  if (visibleVariations.length === 0) {
    return null;
  }

  return (
    <div data-psyence-mosaic className="absolute inset-0 w-full h-full">
      {/* 2-Variation Asymmetric Duo (~62% Left Anchor, ~38% Right) */}
      {layoutType === "duo" && (
        <div className="grid grid-cols-12 w-full h-full">
          <div className="col-span-7 h-full border-r border-[#161820]">
            <PsyenceTile
              variation={visibleVariations[0]}
              index={0}
              total={total}
              isSelected={selectedIndex === 0}
              onHover={onHoverVariation}
              onSelect={onSelectVariation}
            />
          </div>
          <div className="col-span-5 h-full">
            <PsyenceTile
              variation={visibleVariations[1]}
              index={1}
              total={total}
              isSelected={selectedIndex === 1}
              onHover={onHoverVariation}
              onSelect={onSelectVariation}
            />
          </div>
        </div>
      )}

      {/* 3-Variation Asymmetric Trio (Large Left Anchor, 2 Stacked Right) */}
      {layoutType === "trio" && (
        <div className="grid grid-cols-12 w-full h-full">
          <div className="col-span-7 h-full border-r border-[#161820]">
            <PsyenceTile
              variation={visibleVariations[0]}
              index={0}
              total={total}
              isSelected={selectedIndex === 0}
              onHover={onHoverVariation}
              onSelect={onSelectVariation}
            />
          </div>
          <div className="col-span-5 grid grid-rows-2 h-full">
            <div className="row-span-1 h-full border-b border-[#161820]">
              <PsyenceTile
                variation={visibleVariations[1]}
                index={1}
                total={total}
                isSelected={selectedIndex === 1}
                onHover={onHoverVariation}
                onSelect={onSelectVariation}
              />
            </div>
            <div className="row-span-1 h-full">
              <PsyenceTile
                variation={visibleVariations[2]}
                index={2}
                total={total}
                isSelected={selectedIndex === 2}
                onHover={onHoverVariation}
                onSelect={onSelectVariation}
              />
            </div>
          </div>
        </div>
      )}

      {/* 4-Variation Quad & 5+ Overflow (2x2 Grid with Optional +N on tile 4) */}
      {(layoutType === "quad" || layoutType === "overflow") && (
        <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
          <div className="h-full border-r border-b border-[#161820]">
            <PsyenceTile
              variation={visibleVariations[0]}
              index={0}
              total={total}
              isSelected={selectedIndex === 0}
              onHover={onHoverVariation}
              onSelect={onSelectVariation}
            />
          </div>
          <div className="h-full border-b border-[#161820]">
            <PsyenceTile
              variation={visibleVariations[1]}
              index={1}
              total={total}
              isSelected={selectedIndex === 1}
              onHover={onHoverVariation}
              onSelect={onSelectVariation}
            />
          </div>
          <div className="h-full border-r border-[#161820]">
            <PsyenceTile
              variation={visibleVariations[2]}
              index={2}
              total={total}
              isSelected={selectedIndex === 2}
              onHover={onHoverVariation}
              onSelect={onSelectVariation}
            />
          </div>
          <div className="h-full">
            <PsyenceTile
              variation={visibleVariations[3]}
              index={3}
              total={total}
              remainingCount={remainingCount}
              isSelected={selectedIndex === 3}
              onHover={onHoverVariation}
              onSelect={onSelectVariation}
            />
          </div>
        </div>
      )}
    </div>
  );
}
