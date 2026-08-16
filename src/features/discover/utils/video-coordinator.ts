export const DISCOVER_VIDEO_PLAY_EVENT = "adlabs:discover-video-play";

export interface DiscoverVideoPlayDetail {
  id: string;
}

const coordinatorTarget: EventTarget =
  typeof window !== "undefined" ? window : new EventTarget();

/**
 * Notifies all Discover video players that a specific video instance has started playing.
 */
export function notifyDiscoverVideoPlay(id: string): void {
  coordinatorTarget.dispatchEvent(
    new CustomEvent<DiscoverVideoPlayDetail>(DISCOVER_VIDEO_PLAY_EVENT, {
      detail: { id },
    }),
  );
}

/**
 * Subscribes a Discover video instance to pause if another video instance begins playback.
 */
export function subscribeDiscoverVideoPlay(
  id: string,
  onOtherPlay: () => void,
): () => void {
  const handlePlayEvent = (event: Event) => {
    const customEvent = event as CustomEvent<DiscoverVideoPlayDetail>;
    if (customEvent.detail && customEvent.detail.id !== id) {
      onOtherPlay();
    }
  };

  coordinatorTarget.addEventListener(DISCOVER_VIDEO_PLAY_EVENT, handlePlayEvent);
  return () => {
    coordinatorTarget.removeEventListener(
      DISCOVER_VIDEO_PLAY_EVENT,
      handlePlayEvent,
    );
  };
}
