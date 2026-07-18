import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { DesktopInputEvent } from './vite-env';

type DesktopBridge = NonNullable<Window['trainerDesktop']>;

type TauriGlobalInputPayload = {
  source: 'desktop';
  event_type?: DesktopInputEvent['type'];
  type?: DesktopInputEvent['type'];
  code: string;
  time: number;
};

type OverlayBounds = { x: number; y: number; width: number; height: number };
type DisplaySize = { width: number; height: number };
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

  return {
    isDesktop: true,
    setOverlayVisible: (visible: boolean) => invoke('set_overlay_visible', { visible }),
    setOverlayClickThrough: (enabled: boolean) => invoke('set_overlay_click_through', { enabled }),
    setOverlayBounds: (bounds: OverlayBounds) => invoke('set_overlay_bounds', { bounds }),
    setOverlayPosition: (position: OverlayPosition) => invoke('set_overlay_position', { position }),
    getOverlayBounds: () => invoke<OverlayBounds>('get_overlay_bounds'),
    getDisplaySize: () => invoke<DisplaySize>('get_display_size'),
    updateOverlay: (payload: unknown) => invoke('update_overlay', { payload }),
    setRhythmFeedbackVisible: (visible: boolean) => invoke('set_rhythm_feedback_visible', { visible }),
    updateRhythmFeedback: (payload: unknown) => invoke('update_rhythm_feedback', { payload }),
    setRhythmFeedbackBounds: (bounds: OverlayBounds) => invoke('set_rhythm_feedback_bounds', { bounds }),
    getRhythmFeedbackBounds: () => invoke<OverlayBounds>('get_rhythm_feedback_bounds'),
    setKeyMappingVisible: (visible: boolean) => invoke('set_key_mapping_visible', { visible }),
    updateKeyMapping: (payload: unknown) => invoke('update_key_mapping', { payload }),
    setKeyMappingBounds: (bounds: OverlayBounds) => invoke('set_key_mapping_bounds', { bounds }),
    getKeyMappingBounds: () => invoke<OverlayBounds>('get_key_mapping_bounds'),
    onOverlayBoundsChanged: (callback: (bounds: OverlayBounds) => void) => listenUntilDisposed<OverlayBounds>('overlay:bounds-changed', callback),
    onOverlayMoveModeRequested: (callback: (enabled: boolean) => void) => listenUntilDisposed<{ enabled: boolean }>('overlay:move-mode', (payload) => callback(payload.enabled)),
    onRhythmFeedbackBoundsChanged: (callback: (bounds: OverlayBounds) => void) => listenUntilDisposed<OverlayBounds>('rhythm-feedback:bounds-changed', callback),
    onKeyMappingBoundsChanged: (callback: (bounds: OverlayBounds) => void) => listenUntilDisposed<OverlayBounds>('key-mapping:bounds-changed', callback),
    startGlobalInput: () => invoke<{ ok: boolean; reason?: string }>('start_global_input'),
    getGlobalInputStatus: () => invoke<{ started: boolean; status: string; eventCount: number }>('global_input_status'),
    stopGlobalInput: async () => undefined,
    saveExportFile: (directory: string, filename: string, bytes: Uint8Array) => invoke<{ path: string }>('save_export_file', { directory, filename, bytes: Array.from(bytes) }),
    saveExportMp4: (directory: string, filename: string, bytes: Uint8Array) => invoke<{ path: string }>('save_export_mp4', { directory, filename, bytes: Array.from(bytes) }),
    onGlobalInput: (callback: (event: DesktopInputEvent) => void) => listenUntilDisposed<TauriGlobalInputPayload>('global-input', (payload) => {
      callback({
        source: 'desktop',
        type: payload.type ?? payload.event_type ?? 'keydown',
        code: payload.code,
        time: tauriEventTimeToPerformance(payload.time)
      });
    })
  };
}

export function createOverlayBridge() {
  if (window.trainerOverlay) return window.trainerOverlay;
  if (!isTauriRuntime()) return null;

  return {
    setOverlayBounds: (bounds: OverlayBounds) => invoke('set_overlay_bounds', { bounds }),
    setOverlayPosition: (position: OverlayPosition) => invoke('set_overlay_position', { position }),
    requestOverlayMoveMode: (enabled: boolean) => invoke('request_overlay_move_mode', { enabled }),
    notifyOverlayBoundsChanged: (bounds: OverlayBounds) => invoke('notify_overlay_bounds_changed', { bounds }),
    onWindowBlur: (callback: () => void) => listenUntilDisposed('tauri://blur', callback),
    onUpdate: (callback: (payload: unknown) => void) => listenUntilDisposed<unknown>('overlay:update', callback)
  };
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
