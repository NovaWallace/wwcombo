declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    trainerDesktop?: {
      isDesktop: true;
      setOverlayVisible(visible: boolean): Promise<void>;
      setOverlayClickThrough(enabled: boolean): Promise<void>;
      setOverlayBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      setOverlayPosition?(position: { x: number; y: number }): Promise<void>;
      getOverlayBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      getDisplaySize?(): Promise<{ width: number; height: number }>;
      updateOverlay(payload: unknown): Promise<void>;
      setRhythmFeedbackVisible?(visible: boolean): Promise<void>;
      updateRhythmFeedback?(payload: unknown): Promise<void>;
      setRhythmFeedbackBounds?(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      getRhythmFeedbackBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      setKeyMappingVisible?(visible: boolean): Promise<void>;
      updateKeyMapping?(payload: unknown): Promise<void>;
      setKeyMappingBounds?(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      getKeyMappingBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      onOverlayBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      onOverlayMoveModeRequested?(callback: (enabled: boolean) => void): () => void;
      onRhythmFeedbackBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      onKeyMappingBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      startGlobalInput(): Promise<{ ok: boolean; reason?: string }>;
      getGlobalInputStatus(): Promise<{ started: boolean; status: string; eventCount: number }>;
      stopGlobalInput(): Promise<void>;
      saveExportFile?(directory: string, filename: string, bytes: Uint8Array): Promise<{ path: string }>;
      saveExportMp4?(directory: string, filename: string, bytes: Uint8Array): Promise<{ path: string }>;
      onGlobalInput(callback: (event: DesktopInputEvent) => void): () => void;
    };
    trainerOverlay?: {
      setOverlayBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      setOverlayPosition?(position: { x: number; y: number }): Promise<void>;
      requestOverlayMoveMode(enabled: boolean): Promise<void>;
      notifyOverlayBoundsChanged(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      onWindowBlur?(callback: () => void): () => void;
      onUpdate(callback: (payload: unknown) => void): () => void;
    };
    rhythmFeedbackOverlay?: {
      getState(): Promise<unknown>;
      getBounds(): Promise<{ x: number; y: number; width: number; height: number }>;
      setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      setPosition(position: { x: number; y: number }): Promise<void>;
      startDrag(): Promise<void>;
      startResize(edge: string): Promise<void>;
      notifyBoundsChanged(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      onUpdate(callback: (payload: unknown) => void): () => void;
    };
    keyMappingOverlay?: {
      getState(): Promise<unknown>;
      getBounds(): Promise<{ x: number; y: number; width: number; height: number }>;
      setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      setPosition(position: { x: number; y: number }): Promise<void>;
      startDrag(): Promise<void>;
      startResize(edge: string): Promise<void>;
      notifyBoundsChanged(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
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
