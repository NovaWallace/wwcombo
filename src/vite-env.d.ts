/// <reference types="vite/client" />

import type {
  VideoRecognitionProgress,
  VideoRecognitionRequest,
  VideoRecognitionResult
} from './videoKeyMappingRecognition';

declare global {
  const __APP_VERSION__: string;
  const __EXPERIMENTAL_ANALYSIS_LABS__: boolean;
  const __BUFF_TIMER_ENABLED__: boolean;
  const __SIMULATED_INPUT_ENABLED__: boolean;
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    trainerDesktop?: {
      isDesktop: true;
      setOverlayVisible(visible: boolean): Promise<void>;
      setOverlayClickThrough(enabled: boolean): Promise<void>;
      setOverlayNotesVisible?(visible: boolean): Promise<void>;
      setOverlayNotesClickThrough?(enabled: boolean): Promise<void>;
      setOverlayNotesBounds?(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      getOverlayNotesBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      setOverlayBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      setOverlayPosition?(position: { x: number; y: number }): Promise<void>;
      getOverlayBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      getDisplaySize?(): Promise<{ width: number; height: number; scaleFactor?: number }>;
      updateOverlay(payload: unknown): Promise<void>;
      updateOverlayVisibleNotes?(stepIds: string[]): Promise<void>;
      updateOverlayPractice?(practice: unknown): Promise<void>;
      setRhythmFeedbackVisible?(visible: boolean): Promise<void>;
      updateRhythmFeedback?(payload: unknown): Promise<void>;
      setRhythmFeedbackBounds?(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      getRhythmFeedbackBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      setKeyMappingVisible?(visible: boolean): Promise<void>;
      updateKeyMapping?(payload: unknown): Promise<void>;
      setKeyMappingBounds?(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      getKeyMappingBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      updateRecordingIndicator?(payload: unknown): Promise<void>;
      updateRealtimeVision?(payload: unknown): Promise<void>;
      setRealtimeVisionBounds?(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      setRealtimeVisionPosition?(position: { x: number; y: number }): Promise<void>;
      getRealtimeVisionBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      setRealtimeVisionClickThrough?(enabled: boolean): Promise<void>;
      startSimulatedInput?(events: Array<{ atMs: number; type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup'; code: string; cursorDx?: number; cursorDy?: number }>): Promise<{ startsInMs?: number }>;
      stopSimulatedInput?(): Promise<void>;
      onOverlayBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      onOverlayNotesBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      onOverlayMoveModeRequested?(callback: (enabled: boolean) => void): () => void;
      onOverlayNoteBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      onRhythmFeedbackBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      onKeyMappingBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      setGlobalInputMode?(mode: 'keyboard' | 'xbox' | 'playstation'): Promise<void>;
      startGlobalInput(): Promise<{ ok: boolean; reason?: string }>;
      getGlobalInputStatus(): Promise<{ started: boolean; status: string; eventCount: number }>;
      fetchRemoteCharacterAvatars?(): Promise<unknown>;
      getDlcStatus?(): Promise<{
        rootPath: string;
        ffmpegInstalled: boolean;
        live2dAssets: Array<{
          id: string;
          skeletonUrl: string;
          atlasUrl: string;
          textureUrl: string;
        }>;
      }>;
      openDlcFolder?(): Promise<string>;
      stopGlobalInput(): Promise<void>;
      pickExportDirectory?(currentDirectory?: string, title?: string): Promise<string | null>;
      pickVideoFile?(): Promise<{ path: string; name: string; url: string } | null>;
      analyzeVideoKeyMapping?(request: VideoRecognitionRequest): Promise<VideoRecognitionResult>;
      cancelVideoKeyMappingRecognition?(): Promise<void>;
      onVideoKeyMappingRecognitionProgress?(callback: (progress: VideoRecognitionProgress) => void): () => void;
      exportVideoWithOverlay?(directory: string, filename: string, sourcePath: string, overlayX: number, overlayY: number, startMs: number, durationMs: number, overlayBytes: Uint8Array): Promise<{ path: string }>;
      cancelVideoExport?(): Promise<void>;
      onVideoExportProgress?(callback: (progress: { progress: number; processedMs: number; durationMs: number }) => void): () => void;
      saveExportFile?(directory: string, filename: string, bytes: Uint8Array): Promise<{ path: string }>;
      saveExportMp4?(directory: string, filename: string, bytes: Uint8Array): Promise<{ path: string }>;
      onGlobalInput(callback: (event: DesktopInputEvent) => void): () => void;
    };
    trainerOverlay?: {
      getState(): Promise<unknown>;
      setOverlayBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      setOverlayPosition?(position: { x: number; y: number }): Promise<void>;
      getOverlayBounds?(): Promise<{ x: number; y: number; width: number; height: number }>;
      startDrag?(): Promise<void>;
      requestOverlayMoveMode(enabled: boolean): Promise<void>;
      notifyOverlayNoteBoundsChanged?(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      notifyOverlayBoundsChanged(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      startResize(edge: string): Promise<void>;
      onBoundsChanged?(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      onWindowBlur?(callback: () => void): () => void;
      onUpdate(callback: (payload: unknown) => void): () => void;
      onPracticeUpdate?(callback: (practice: unknown) => void): () => void;
      updateOverlayVisibleNotes?(stepIds: string[]): Promise<void>;
    };
    trainerOverlayNotes?: {
      getState(): Promise<unknown>;
      setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      getBounds(): Promise<{ x: number; y: number; width: number; height: number }>;
      startDrag(): Promise<void>;
      startResize(edge: string): Promise<void>;
      notifyBoundsChanged(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      onBoundsChanged(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
      onUpdate(callback: (payload: unknown) => void): () => void;
      onPracticeUpdate?(callback: (practice: unknown) => void): () => void;
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
    recordingIndicatorOverlay?: {
      getState(): Promise<unknown>;
      onUpdate(callback: (payload: unknown) => void): () => void;
    };
    realtimeVisionOverlay?: {
      getState(): Promise<unknown>;
      getBounds(): Promise<{ x: number; y: number; width: number; height: number }>;
      setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      setPosition(position: { x: number; y: number }): Promise<void>;
      onUpdate(callback: (payload: unknown) => void): () => void;
    };
  }
}

export type DesktopInputEvent = {
  source: 'desktop';
  type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'gamepadbuttondown' | 'gamepadbuttonup';
  captureMode?: 'keyboard' | 'xbox' | 'playstation';
  code: string;
  time: number;
  shiftKey?: boolean;
};

export {};
