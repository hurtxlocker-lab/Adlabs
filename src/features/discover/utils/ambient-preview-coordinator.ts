export const PREVIEW_DURATION_SECONDS = 3.5;
export const MAX_AMBIENT_PREVIEWS = 3;

export interface AmbientCandidate {
  id: string;
  clusterId?: string;
  isFocused: boolean;
  isLead: boolean;
  domOrder: number;
  isVisible: boolean;
}

export interface AmbientEligibilityOptions {
  isTouch?: boolean;
  isReducedMotion?: boolean;
  isDco?: boolean;
  isMultiVariation?: boolean;
  isDetail?: boolean;
}

/**
 * Pure policy helper: determines whether an item is eligible for ambient preview.
 */
export function shouldEnableAmbientPreview(
  options: AmbientEligibilityOptions,
): boolean {
  if (options.isTouch === true) return false;
  if (options.isReducedMotion === true) return false;
  if (options.isDco === true) return false;
  if (options.isMultiVariation === true) return false;
  if (options.isDetail === true) return false;
  return true;
}

/**
 * Pure helper: validates whether currentTime is within the 0s -> 3.5s preview window.
 */
export function isTimeInPreviewWindow(
  currentTime: number,
  maxDuration = PREVIEW_DURATION_SECONDS,
): boolean {
  return currentTime >= 0 && currentTime < maxDuration;
}

/**
 * Pure deterministic selector: selects up to `max` candidate IDs that may actively play.
 *
 * Priority order:
 *  1. Currently focused/hovered candidate (isFocused === true)
 *  2. Visible lead-role candidate (isLead === true)
 *  3. Visible supporting candidates in deterministic DOM order
 */
export function selectActiveAmbientPreviews(
  candidates: AmbientCandidate[],
  max = MAX_AMBIENT_PREVIEWS,
): Set<string> {
  const visible = candidates.filter((c) => c.isVisible);

  const sorted = [...visible].sort((a, b) => {
    // 1. Focused item gets top priority
    if (a.isFocused && !b.isFocused) return -1;
    if (!a.isFocused && b.isFocused) return 1;

    // 2. Lead role gets secondary priority
    if (a.isLead && !b.isLead) return -1;
    if (!a.isLead && b.isLead) return 1;

    // 3. Deterministic DOM order
    return a.domOrder - b.domOrder;
  });

  const selected = sorted.slice(0, max).map((c) => c.id);
  return new Set(selected);
}

// ---------------------------------------------------------------------------
// Client-Side Singleton Registry & Coordinator
// ---------------------------------------------------------------------------

interface RegisteredCandidate extends AmbientCandidate {
  subscriber: (isAllowed: boolean) => void;
}

class AmbientPreviewRegistry {
  private candidates = new Map<string, RegisteredCandidate>();
  private clusterFocusSubscribers = new Map<
    string,
    Set<(focusedId: string | null) => void>
  >();
  private activeFullPlaybackId: string | null = null;
  private isDocumentHidden = false;

  constructor() {
    if (typeof document !== "undefined") {
      this.isDocumentHidden = document.hidden;
      document.addEventListener("visibilitychange", () => {
        this.isDocumentHidden = document.hidden;
        this.recalculate();
      });
    }
  }

  public register(
    candidate: AmbientCandidate,
    subscriber: (isAllowed: boolean) => void,
  ): () => void {
    this.candidates.set(candidate.id, { ...candidate, subscriber });
    this.recalculate();

    return () => {
      this.candidates.delete(candidate.id);
      this.recalculate();
    };
  }

  public update(id: string, updates: Partial<AmbientCandidate>): void {
    const existing = this.candidates.get(id);
    if (!existing) return;

    this.candidates.set(id, { ...existing, ...updates });
    this.recalculate();
  }

  public setFullPlaybackActive(id: string | null): void {
    this.activeFullPlaybackId = id;
    this.recalculate();
  }

  public notifyClusterFocus(
    clusterId: string,
    focusedItemId: string | null,
  ): void {
    const subs = this.clusterFocusSubscribers.get(clusterId);
    if (subs) {
      for (const sub of subs) {
        sub(focusedItemId);
      }
    }
  }

  public subscribeClusterFocus(
    clusterId: string,
    callback: (focusedItemId: string | null) => void,
  ): () => void {
    if (!this.clusterFocusSubscribers.has(clusterId)) {
      this.clusterFocusSubscribers.set(clusterId, new Set());
    }
    const set = this.clusterFocusSubscribers.get(clusterId)!;
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.clusterFocusSubscribers.delete(clusterId);
      }
    };
  }

  private recalculate(): void {
    if (this.isDocumentHidden) {
      for (const c of this.candidates.values()) {
        c.subscriber(false);
      }
      return;
    }

    const candidateList = Array.from(this.candidates.values());
    const allowedSet = selectActiveAmbientPreviews(
      candidateList,
      MAX_AMBIENT_PREVIEWS,
    );

    for (const [id, c] of this.candidates.entries()) {
      const isAllowed = allowedSet.has(id);
      c.subscriber(isAllowed);
    }
  }
}

// Module-level coordinator singleton
let coordinatorInstance: AmbientPreviewRegistry | null = null;

function getCoordinator(): AmbientPreviewRegistry {
  if (!coordinatorInstance) {
    coordinatorInstance = new AmbientPreviewRegistry();
  }
  return coordinatorInstance;
}

export function registerAmbientCandidate(
  candidate: AmbientCandidate,
  onEligibilityChange: (isAllowed: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  return getCoordinator().register(candidate, onEligibilityChange);
}

export function updateAmbientCandidate(
  id: string,
  updates: Partial<AmbientCandidate>,
): void {
  if (typeof window === "undefined") return;
  getCoordinator().update(id, updates);
}

export function notifyActiveFullPlayback(id: string | null): void {
  if (typeof window === "undefined") return;
  getCoordinator().setFullPlaybackActive(id);
}

export function notifyClusterFocus(
  clusterId: string,
  focusedItemId: string | null,
): void {
  if (typeof window === "undefined") return;
  getCoordinator().notifyClusterFocus(clusterId, focusedItemId);
}

export function subscribeClusterFocus(
  clusterId: string,
  callback: (focusedItemId: string | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  return getCoordinator().subscribeClusterFocus(clusterId, callback);
}
