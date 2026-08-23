"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface NativePopoverProps {
  trigger: (props: {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
  }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  width?: number | string;
  className?: string;
  alignment?: "start" | "end";
}

/**
 * Lightweight, accessible native popover for composite multi-select filters.
 *
 * Uses native DOM events (Escape key, outside pointerdown) and standard CSS
 * positioning without portals, external libraries, or focus trap complexity.
 */
export function NativePopover({
  trigger,
  children,
  width = 280,
  className = "",
  alignment = "start",
}: NativePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const toggle = () => setIsOpen((prev) => !prev);
  const close = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const widthStyle = typeof width === "number" ? `${width}px` : width;
  const alignClass = alignment === "end" ? "right-0" : "left-0";

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      {trigger({ isOpen, toggle, close })}

      {isOpen && (
        <div
          role="dialog"
          style={{ width: widthStyle }}
          className={`absolute ${alignClass} top-full mt-1.5 z-40 bg-[#090b10] border border-[#1e222d] rounded-[3px] shadow-2xl p-3 max-h-[75vh] overflow-y-auto ${className}`}
        >
          {children({ close })}
        </div>
      )}
    </div>
  );
}
