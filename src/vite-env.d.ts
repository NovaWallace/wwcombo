declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    trainerDesktop?: {
      isDesktop: true;
      setOverlayVisible(visible: boolean): Promise<void>;
      setOverlayClickThrough(enabled: boolean): Promise<void>;
      setOverlayBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      getOverlayBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      updateOverlay(payload: unknown): Promise<void>;
      onOverlayBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      onOverlayMoveModeRequested?(callback: (enabled: boolean) => void): () => void;
      startGlobalInput(): Promise<{ ok: boolean; reason?: string }>;
      getGlobalInputStatus(): Promise<{ started: boolean; status: string; eventCount: number }>;
      stopGlobalInput(): Promise<void>;
      onGlobalInput(callback: (event: DesktopInputEvent) => void): () => void;
    };
    trainerOverlay?: {
      setOverlayBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      requestOverlayMoveMode(enabled: boolean): Promise<void>;
      notifyOverlayBoundsChanged(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      onUpdate(callback: (payload: unknown) => void): () => void;
    };
  }
}

export type DesktopInputEvent = {
  source: 'desktop';
  type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup';
  code: string;
  time: number;
};

export {};
