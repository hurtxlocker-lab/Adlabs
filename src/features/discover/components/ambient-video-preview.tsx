"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  registerAmbientCandidate,
  updateAmbientCandidate,
  notifyClusterFocus,
  subscribeClusterFocus,
  notifyActiveFullPlayback,
} from "../utils/ambient-preview-coordinator";
import {
  notifyDiscoverVideoPlay,
  subscribeDiscoverVideoPlay,
} from "../utils/video-coordinator";

interface AmbientVideoPreviewProps {
  id: string;
  clusterId?: string;
  originalVideoUrl: string;
  previewLoopUrl?: string | null;
  posterUrl?: string;
  title?: string;
  isLead?: boolean;
  onEngageChange?: (isEngaged: boolean) => void;
}

function subscribeTouchOrReducedMotion(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const touchMedia = window.matchMedia("(hover: none), (pointer: coarse)");
  const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

  touchMedia.addEventListener("change", callback);
  motionMedia.addEventListener("change", callback);

  return () => {
    touchMedia.removeEventListener("change", callback);
    motionMedia.removeEventListener("change", callback);
  };
}

function getTouchOrReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(hover: none), (pointer: coarse)").matches ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function getServerSnapshot(): boolean {
  return false;
}

export function AmbientVideoPreview({
  id,
  clusterId,
  originalVideoUrl,
  previewLoopUrl,
  posterUrl,
  title,
  isLead = false,
  onEngageChange,
}: AmbientVideoPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [mode, setMode] = useState<"ambient" | "engaged">("ambient");
  const [isEligible, setIsEligible] = useState(false);
  const [isClusterPaused, setIsClusterPaused] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // 1. Detect Touch / Reduced Motion Environment
  const isTouchOrReducedMotion = useSyncExternalStore(
    subscribeTouchOrReducedMotion,
    getTouchOrReducedMotionSnapshot,
    getServerSnapshot,
  );

  // Has a valid PREVIEW_LOOP derivative available
  const hasPreviewLoop = Boolean(previewLoopUrl && previewLoopUrl.trim() !== "");

  // 2. Viewport Intersection & Max-3 Concurrency Registration
  useEffect(() => {
    if (isTouchOrReducedMotion || mode === "engaged" || !hasPreviewLoop) return;

    const el = containerRef.current;
    if (!el) return;

    let domOrder = 0;
    if (typeof document !== "undefined") {
      const allCards = document.querySelectorAll("[data-artifact]");
      for (let i = 0; i < allCards.length; i++) {
        if (allCards[i].contains(el)) {
          domOrder = i;
          break;
        }
      }
    }

    const unregister = registerAmbientCandidate(
      {
        id,
        clusterId,
        isFocused: false,
        isLead,
        domOrder,
        isVisible: false,
      },
      (isAllowed) => {
        setIsEligible(isAllowed);
      },
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const isVisible = entry.isIntersecting && entry.intersectionRatio > 0.15;
          updateAmbientCandidate(id, { isVisible });
        }
      },
      { threshold: [0, 0.2, 0.5] },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      unregister();
    };
  }, [id, clusterId, isLead, isTouchOrReducedMotion, mode, hasPreviewLoop]);

  // 3. Cluster Neighbor Focus Subscription (Pauses sibling ambient motion on NOTICE)
  useEffect(() => {
    if (!clusterId || isTouchOrReducedMotion || mode === "engaged") return;

    return subscribeClusterFocus(clusterId, (focusedItemId) => {
      if (focusedItemId !== null && focusedItemId !== id) {
        setIsClusterPaused(true);
      } else {
        setIsClusterPaused(false);
      }
    });
  }, [id, clusterId, isTouchOrReducedMotion, mode]);

  // 4. Discover Full Video Coordination Subscription
  useEffect(() => {
    return subscribeDiscoverVideoPlay(id, () => {
      if (mode === "engaged" && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    });
  }, [id, mode]);

  // 5. Ambient Motion Playback Control
  const shouldPlayAmbient =
    mode === "ambient" &&
    hasPreviewLoop &&
    isEligible &&
    !isClusterPaused &&
    !isTouchOrReducedMotion &&
    !videoError;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || mode !== "ambient") return;

    if (shouldPlayAmbient) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay rejected safely
        });
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [shouldPlayAmbient, mode]);

  // 6. Explicit ENGAGE Transition (Full Original Video Playback from 0s)
  const handleEngage = () => {
    setMode("engaged");
    onEngageChange?.(true);
    notifyDiscoverVideoPlay(id);
    notifyActiveFullPlayback(id);

    // Let the video element mount/update to originalVideoUrl and play
    setTimeout(() => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.muted = false;
        video.controls = true;
        video.play().catch(() => {});
      }
    }, 0);
  };

  // 7. Hover / Focus NOTICE Event Handlers
  const handleMouseEnter = () => {
    if (mode !== "ambient" || isTouchOrReducedMotion) return;
    updateAmbientCandidate(id, { isFocused: true });
    if (clusterId) notifyClusterFocus(clusterId, id);
  };

  const handleMouseLeave = () => {
    if (mode !== "ambient" || isTouchOrReducedMotion) return;
    updateAmbientCandidate(id, { isFocused: false });
    if (clusterId) notifyClusterFocus(clusterId, null);
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
    >
      {/* 1. Independent Static Poster Layer (Immediate First Paint) */}
      {posterUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={posterUrl}
          alt={title || "Ad creative thumbnail"}
          loading="eager"
          decoding="async"
          className="absolute inset-0 w-full h-full max-w-full max-h-full object-contain object-center pointer-events-none"
        />
      )}

      {/* 2. Ambient Video Layer (PREVIEW_LOOP derivative only, mounted when eligible) */}
      {mode === "ambient" && hasPreviewLoop && isEligible && !videoError && (
        <video
          ref={videoRef}
          src={previewLoopUrl!}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setIsVideoLoaded(true)}
          onError={() => setVideoError(true)}
          className={`absolute inset-0 w-full h-full max-w-full max-h-full object-contain object-center cursor-pointer transition-opacity duration-200 ${
            isVideoLoaded ? "opacity-100" : "opacity-0"
          }`}
          onClick={handleEngage}
        />
      )}

      {/* 3. Engaged Full Original Video Player (Full Quality / Full Duration) */}
      {mode === "engaged" && (
        <video
          ref={videoRef}
          src={originalVideoUrl}
          poster={posterUrl}
          controls
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full max-w-full max-h-full object-contain object-center z-20"
        />
      )}

      {/* 4. Touch / Mobile / Fallback Play Button Overlay */}
      {(isTouchOrReducedMotion || videoError || !hasPreviewLoop || (!isEligible && mode === "ambient")) &&
        mode === "ambient" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none z-10">
            <button
              type="button"
              aria-label={`Play video for ${title || "Commercial creative"}`}
              onClick={handleEngage}
              className="w-11 h-11 rounded-full bg-[#07080a]/90 border border-[#20242e] hover:border-[#3a4154] focus-visible:border-[#d46b38] text-[#f3f4f6] hover:text-white flex items-center justify-center transition-colors pointer-events-auto cursor-pointer"
            >
              <svg
                className="w-4 h-4 text-current ml-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
        )}

      {/* 5. Ambient Preview NOTICE Quiet Affordance ("Watch ↗") */}
      {mode === "ambient" && hasPreviewLoop && isEligible && !isTouchOrReducedMotion && !videoError && (
        <button
          type="button"
          aria-label={`Watch full video for ${title || "Commercial creative"}`}
          onClick={handleEngage}
          className="absolute bottom-3 right-3 z-10 font-mono text-xs text-[#f3f4f6] bg-[#07080a]/90 border border-[#2e3340] hover:border-[#d46b38] px-2.5 py-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-1.5 shadow-lg cursor-pointer"
        >
          <span>Watch</span>
          <span aria-hidden="true">↗</span>
        </button>
      )}
    </div>
  );
}
