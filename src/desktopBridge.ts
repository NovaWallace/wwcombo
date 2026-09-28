import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { DesktopInputEvent } from './vite-env';
import type {
  VideoRecognitionProgress,
  VideoRecognitionRequest,
  VideoRecognitionResult
} from './videoKeyMappingRecognition';

type DesktopBridge = NonNullable<Window['trainerDesktop']>;

type TauriGlobalInputPayload = {
  source: 'desktop';
  event_type?: DesktopInputEvent['type'];
  type?: DesktopInputEvent['type'];
  captureMode?: 'keyboard' | 'xbox' | 'playstation';
  code: string;
  time: number;
  shiftKey?: boolean;
};

type OverlayBounds = { x: number; y: number; width: number; height: number };
type OverlayNoteBounds = OverlayBounds;
type DisplaySize = { width: number; height: number; scaleFactor?: number };
type OverlayPosition = { x: number; y: number };
type ResizeDirection = 'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West';

const RESIZE_DIRECTIONS: Record<string, ResizeDirection> = {
  n: 'North',
  e: 'East',
  s: 'South',
  w: 'West',
  ne: 'NorthEast',
  nw: 'NorthWest',
  se: 'SouthEast',
  sw: 'SouthWest'
};

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

function convertDlcFileSrc(filePath: string): string {
  return convertFileSrc(filePath).replace(/%2F|%5C/gi, '/');
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke<void>('plugin:opener|open_url', { url });
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) throw new Error('popup blocked');
}

function tauriEventTimeToPerformance(time: number): number {
  if (!Number.isFinite(time)) return performance.now();
  const converted = performance.now() + (time - Date.now());
  return Number.isFinite(converted) && Math.abs(converted - performance.now()) < 5000 ? converted : performance.now();
}

function listenUntilDisposed<T>(eventName: string, callback: (payload: T) => void): () => void {
  let disposed = false;
  let unlisten: (() => void) | null = null;
  listen<T>(eventName, (event) => {
    if (!disposed) callback(event.payload);
  }).then((nextUnlisten) => {
    if (disposed) nextUnlisten();
    else unlisten = nextUnlisten;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export function createDesktopBridge(): DesktopBridge | null {
  if (window.trainerDesktop) return window.trainerDesktop;
  if (!isTauriRuntime()) return null;

  const bridge: DesktopBridge = {
    isDesktop: true,
    setOverlayVisible: (visible: boolean) => invoke('set_overlay_visible', { visible }),
    setOverlayClickThrough: (enabled: boolean) => invoke('set_overlay_click_through', { enabled }),
    setOverlayNotesVisible: (visible: boolean) => invoke('set_overlay_notes_visible', { visible }),
    setOverlayNotesClickThrough: (enabled: boolean) => invoke('set_overlay_notes_click_through', { enabled }),
    setOverlayNotesBounds: (bounds: OverlayBounds) => invoke('set_overlay_notes_bounds', { bounds }),
    getOverlayNotesBounds: () => invoke<OverlayBounds>('get_overlay_notes_bounds'),
    setOverlayBounds: (bounds: OverlayBounds) => invoke('set_overlay_bounds', { bounds }),
    setOverlayPosition: (position: OverlayPosition) => invoke('set_overlay_position', { position }),
    getOverlayBounds: () => invoke<OverlayBounds>('get_overlay_bounds'),
    getDisplaySize: () => invoke<DisplaySize>('get_display_size'),
    updateOverlay: (payload: unknown) => invoke('update_overlay', { payload }),
    updateOverlayVisibleNotes: (stepIds: string[]) => invoke('update_overlay_visible_notes', { stepIds }),
    updateOverlayPractice: (practice: unknown) => invoke('update_overlay_practice', { practice }),
    setRhythmFeedbackVisible: (visible: boolean) => invoke('set_rhythm_feedback_visible', { visible }),
    updateRhythmFeedback: (payload: unknown) => invoke('update_rhythm_feedback', { payload }),
    setRhythmFeedbackBounds: (bounds: OverlayBounds) => invoke('set_rhythm_feedback_bounds', { bounds }),
    getRhythmFeedbackBounds: () => invoke<OverlayBounds>('get_rhythm_feedback_bounds'),
    setKeyMappingVisible: (visible: boolean) => invoke('set_key_mapping_visible', { visible }),
    updateKeyMapping: (payload: unknown) => invoke('update_key_mapping', { payload }),
    setKeyMappingBounds: (bounds: OverlayBounds) => invoke('set_key_mapping_bounds', { bounds }),
    getKeyMappingBounds: () => invoke<OverlayBounds>('get_key_mapping_bounds'),
    updateRecordingIndicator: (payload: unknown) => invoke('update_recording_indicator', { payload }),
    updateRealtimeVision: (payload: unknown) => invoke('update_realtime_vision', { payload }),
    setRealtimeVisionBounds: (bounds: OverlayBounds) => invoke('set_realtime_vision_bounds', { bounds }),
    setRealtimeVisionPosition: (position: OverlayPosition) => invoke('set_realtime_vision_position', { position }),
    getRealtimeVisionBounds: () => invoke<OverlayBounds>('get_realtime_vision_bounds'),
    setRealtimeVisionClickThrough: (enabled: boolean) => invoke('set_realtime_vision_click_through', { enabled }),
    startSimulatedInput: (events) => invoke('start_simulated_input', { events }),
    stopSimulatedInput: () => invoke('stop_simulated_input'),
    onOverlayBoundsChanged: (callback: (bounds: OverlayBounds) => void) => listenUntilDisposed<OverlayBounds>('overlay:bounds-changed', callback),
    onOverlayNotesBoundsChanged: (callback: (bounds: OverlayBounds) => void) => listenUntilDisposed<OverlayBounds>('overlay:note-bounds-changed', callback),
    onOverlayMoveModeRequested: (callback: (enabled: boolean) => void) => listenUntilDisposed<{ enabled: boolean }>('overlay:move-mode', (payload) => callback(payload.enabled)),
    onOverlayNoteBoundsChanged: (callback: (bounds: OverlayNoteBounds) => void) => listenUntilDisposed<OverlayNoteBounds>('overlay:note-bounds-changed', callback),
    onRhythmFeedbackBoundsChanged: (callback: (bounds: OverlayBounds) => void) => listenUntilDisposed<OverlayBounds>('rhythm-feedback:bounds-changed', callback),
    onKeyMappingBoundsChanged: (callback: (bounds: OverlayBounds) => void) => listenUntilDisposed<OverlayBounds>('key-mapping:bounds-changed', callback),
    setGlobalInputMode: (mode: 'keyboard' | 'xbox' | 'playstation') => invoke<void>('set_global_input_mode', { mode }),
    startGlobalInput: () => invoke<{ ok: boolean; reason?: string }>('start_global_input'),
    getGlobalInputStatus: () => invoke<{ started: boolean; status: string; eventCount: number }>('global_input_status'),
    fetchRemoteCharacterAvatars: () => invoke<unknown>('fetch_remote_character_avatars'),
    getDlcStatus: async () => {
      const status = await invoke<{
        rootPath: string;
        ffmpegInstalled: boolean;
        simulatedInputInstalled: boolean;
        live2dAssets: Array<{
          id: string;
          displayName?: string;
          names?: Record<string, string>;
          skeletonPath: string;
          atlasPath: string;
          texturePath: string;
        }>;
      }>('get_dlc_status');
      return {
        rootPath: status.rootPath,
        ffmpegInstalled: status.ffmpegInstalled,
        simulatedInputInstalled: status.simulatedInputInstalled,
        live2dAssets: status.live2dAssets.map((asset) => ({
          id: asset.id,
          displayName: asset.displayName,
          names: asset.names,
          skeletonUrl: convertDlcFileSrc(asset.skeletonPath),
          atlasUrl: convertDlcFileSrc(asset.atlasPath),
          textureUrl: convertDlcFileSrc(asset.texturePath)
        }))
      };
    },
    openDlcFolder: () => invoke<string>('open_dlc_folder'),
    stopGlobalInput: () => invoke<void>('stop_global_input'),
    pickExportDirectory: (currentDirectory = '', title = 'Select Export Folder') => invoke<string | null>('pick_export_directory', { currentDirectory, title }),
    pickVideoFile: async () => {
      const picked = await invoke<{ path: string; name: string } | null>('pick_video_file');
      return picked ? { ...picked, url: convertFileSrc(picked.path) } : null;
    },
    analyzeVideoKeyMapping: (request: VideoRecognitionRequest) => invoke<VideoRecognitionResult>('analyze_video_key_mapping', { request }),
    cancelVideoKeyMappingRecognition: () => invoke<void>('cancel_video_key_mapping_recognition'),
    onVideoKeyMappingRecognitionProgress: (callback: (progress: VideoRecognitionProgress) => void) => listenUntilDisposed('video-key-recognition-progress', callback),
    exportVideoWithOverlay: (directory: string, filename: string, sourcePath: string, overlayX: number, overlayY: number, startMs: number, durationMs: number, overlayBytes: Uint8Array) => invoke<{ path: string }>('export_video_with_overlay', { directory, filename, sourcePath, overlayX, overlayY, startMs: Math.max(0, Math.round(startMs)), durationMs: Math.max(0, Math.round(durationMs)), overlayBytes: Array.from(overlayBytes) }),
    cancelVideoExport: () => invoke<void>('cancel_video_export'),
    onVideoExportProgress: (callback: (progress: { progress: number; processedMs: number; durationMs: number }) => void) => listenUntilDisposed('video-export-progress', callback),
    saveExportFile: (directory: string, filename: string, bytes: Uint8Array) => invoke<{ path: string }>('save_export_file', { directory, filename, bytes: Array.from(bytes) }),
    saveExportMp4: (directory: string, filename: string, bytes: Uint8Array) => invoke<{ path: string }>('save_export_mp4', { directory, filename, bytes: Array.from(bytes) }),
    applyIncrementalUpdate: (url: string, expectedPatchSha256: string, expectedTargetSha256: string) => invoke<{ started: boolean }>('apply_incremental_update', { url, expectedPatchSha256, expectedTargetSha256 }),
    onGlobalInput: (callback: (event: DesktopInputEvent) => void) => {
      const pressedShiftCodes = new Set<string>();
      return listenUntilDisposed<TauriGlobalInputPayload>('global-input', (payload) => {
        const type = payload.type ?? payload.event_type ?? 'keydown';
        if (payload.code === 'ShiftLeft' || payload.code === 'ShiftRight') {
          if (type === 'keydown') pressedShiftCodes.add(payload.code);
          else if (type === 'keyup') pressedShiftCodes.delete(payload.code);
        }
        callback({
          source: 'desktop',
          type,
          captureMode: payload.captureMode,
          code: payload.code,
          time: tauriEventTimeToPerformance(payload.time),
          shiftKey: payload.shiftKey ?? pressedShiftCodes.size > 0
        });
      });
    }
  };
  window.trainerDesktop = bridge;
  return bridge;
}

export function createOverlayBridge() {
  if (window.trainerOverlay) return window.trainerOverlay;
  if (!isTauriRuntime()) return null;

  return {
    getState: () => invoke<unknown>('get_overlay_state'),
    setOverlayBounds: (bounds: OverlayBounds) => invoke('set_overlay_bounds', { bounds }),
    setOverlayPosition: (position: OverlayPosition) => invoke('set_overlay_position', { position }),
    getOverlayBounds: () => invoke<OverlayBounds>('get_overlay_bounds'),
    startDrag: () => getCurrentWindow().startDragging(),
    requestOverlayMoveMode: (enabled: boolean) => invoke('request_overlay_move_mode', { enabled }),
    notifyOverlayNoteBoundsChanged: (bounds: OverlayNoteBounds) => invoke('notify_overlay_note_bounds_changed', { bounds }),
    notifyOverlayBoundsChanged: (bounds: OverlayBounds) => invoke('notify_overlay_bounds_changed', { bounds }),
    startResize: (edge: string) => {
      const direction = RESIZE_DIRECTIONS[edge];
      if (!direction) return Promise.reject(new Error(`invalid resize edge: ${edge}`));
      return getCurrentWindow().startResizeDragging(direction);
    },
    updateOverlayVisibleNotes: (stepIds: string[]) => invoke('update_overlay_visible_notes', { stepIds }),
    onBoundsChanged: (callback: (bounds: OverlayBounds) => void) => listenUntilDisposed<OverlayBounds>('overlay:bounds-changed', callback),
    onWindowBlur: (callback: () => void) => listenUntilDisposed('tauri://blur', callback),
    onUpdate: (callback: (payload: unknown) => void) => listenUntilDisposed<unknown>('overlay:update', callback),
    onPracticeUpdate: (callback: (practice: unknown) => void) => listenUntilDisposed<unknown>('overlay:practice-update', callback)
  };
}

export function createOverlayNotesBridge() {
  if (window.trainerOverlayNotes) return window.trainerOverlayNotes;
  if (!isTauriRuntime()) return null;

  const bridge = {
    getState: () => invoke<unknown>('get_overlay_notes_state'),
    setBounds: (bounds: OverlayBounds) => invoke<void>('set_overlay_notes_bounds', { bounds }),
    getBounds: () => invoke<OverlayBounds>('get_overlay_notes_bounds'),
    startDrag: () => getCurrentWindow().startDragging(),
    startResize: (edge: string) => {
      const direction = RESIZE_DIRECTIONS[edge];
      if (!direction) return Promise.reject(new Error(`invalid resize edge: ${edge}`));
      return getCurrentWindow().startResizeDragging(direction);
    },
    notifyBoundsChanged: (bounds: OverlayBounds) => invoke<void>('notify_overlay_note_bounds_changed', { bounds }),
    onBoundsChanged: (callback: (bounds: OverlayBounds) => void) => listenUntilDisposed<OverlayBounds>('overlay:note-bounds-changed', callback),
    onUpdate: (callback: (payload: unknown) => void) => listenUntilDisposed<unknown>('overlay-notes:update', callback),
    onPracticeUpdate: (callback: (practice: unknown) => void) => listenUntilDisposed<unknown>('overlay-notes:practice-update', callback)
  };
  window.trainerOverlayNotes = bridge;
  return bridge;
}

export function createRhythmFeedbackBridge() {
  if (window.rhythmFeedbackOverlay) return window.rhythmFeedbackOverlay;
  if (!isTauriRuntime()) return null;

  return {
    getState: () => invoke<unknown>('get_rhythm_feedback_state'),
    getBounds: () => invoke<OverlayBounds>('get_rhythm_feedback_bounds'),
    setBounds: (bounds: OverlayBounds) => invoke('set_rhythm_feedback_bounds', { bounds }),
    setPosition: (position: OverlayPosition) => invoke('set_rhythm_feedback_position', { position }),
    startDrag: () => invoke('start_rhythm_feedback_drag'),
    startResize: (edge: string) => {
      const direction = RESIZE_DIRECTIONS[edge];
      if (!direction) return Promise.reject(new Error(`invalid resize edge: ${edge}`));
      return getCurrentWindow().startResizeDragging(direction);
    },
    notifyBoundsChanged: (bounds: OverlayBounds) => invoke('notify_rhythm_feedback_bounds_changed', { bounds }),
    onUpdate: (callback: (payload: unknown) => void) => listenUntilDisposed<unknown>('rhythm-feedback:update', callback)
  };
}

export function createKeyMappingBridge() {
  if (window.keyMappingOverlay) return window.keyMappingOverlay;
  if (!isTauriRuntime()) return null;

  return {
    getState: () => invoke<unknown>('get_key_mapping_state'),
    getBounds: () => invoke<OverlayBounds>('get_key_mapping_bounds'),
    setBounds: (bounds: OverlayBounds) => invoke('set_key_mapping_bounds', { bounds }),
    setPosition: (position: OverlayPosition) => invoke('set_key_mapping_position', { position }),
    startDrag: () => invoke('start_key_mapping_drag'),
    startResize: (edge: string) => {
      const direction = RESIZE_DIRECTIONS[edge];
      if (!direction) return Promise.reject(new Error(`invalid resize edge: ${edge}`));
      return getCurrentWindow().startResizeDragging(direction);
    },
    notifyBoundsChanged: (bounds: OverlayBounds) => invoke('notify_key_mapping_bounds_changed', { bounds }),
    onUpdate: (callback: (payload: unknown) => void) => listenUntilDisposed<unknown>('key-mapping:update', callback)
  };
}

export function createRecordingIndicatorBridge() {
  if (window.recordingIndicatorOverlay) return window.recordingIndicatorOverlay;
  if (!isTauriRuntime()) return null;

  return {
    getState: () => invoke<unknown>('get_recording_indicator_state'),
    onUpdate: (callback: (payload: unknown) => void) => listenUntilDisposed<unknown>('recording-indicator:update', callback)
  };
}

export function createRealtimeVisionOverlayBridge() {
  if (window.realtimeVisionOverlay) return window.realtimeVisionOverlay;
  if (!isTauriRuntime()) return null;

  return {
    getState: () => invoke<unknown>('get_realtime_vision_state'),
    getBounds: () => invoke<OverlayBounds>('get_realtime_vision_bounds'),
    setBounds: (bounds: OverlayBounds) => invoke('set_realtime_vision_bounds', { bounds }),
    setPosition: (position: OverlayPosition) => invoke('set_realtime_vision_position', { position }),
    onUpdate: (callback: (payload: unknown) => void) => listenUntilDisposed<unknown>('realtime-vision:update', callback)
  };
}
