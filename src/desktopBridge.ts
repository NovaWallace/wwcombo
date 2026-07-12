import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function createDesktopBridge(): DesktopBridge | null {
  if (window.trainerDesktop) return window.trainerDesktop;
  if (!isTauriRuntime()) return null;

  return {
    isDesktop: true,
    setOverlayVisible: (visible: boolean) => invoke('set_overlay_visible', { visible }),
    setOverlayClickThrough: (enabled: boolean) => invoke('set_overlay_click_through', { enabled }),
    setOverlayBounds: (bounds: OverlayBounds) => invoke('set_overlay_bounds', { bounds }),
    getOverlayBounds: () => invoke<OverlayBounds>('get_overlay_bounds'),
    updateOverlay: (payload: unknown) => invoke('update_overlay', { payload }),
    onOverlayBoundsChanged: (callback: (bounds: OverlayBounds) => void) => {
      let disposed = false;
      let unlisten: (() => void) | null = null;
      listen<OverlayBounds>('overlay:bounds-changed', (event) => {
        if (!disposed) callback(event.payload);
      }).then((nextUnlisten) => {
        if (disposed) nextUnlisten();
        else unlisten = nextUnlisten;
      });
      return () => {
        disposed = true;
        unlisten?.();
      };
    },
    onOverlayMoveModeRequested: (callback: (enabled: boolean) => void) => {
      let disposed = false;
      let unlisten: (() => void) | null = null;
      listen<{ enabled: boolean }>('overlay:move-mode', (event) => {
        if (!disposed) callback(event.payload.enabled);
      }).then((nextUnlisten) => {
        if (disposed) nextUnlisten();
        else unlisten = nextUnlisten;
      });
      return () => {
        disposed = true;
        unlisten?.();
      };
    },
    startGlobalInput: () => invoke<{ ok: boolean; reason?: string }>('start_global_input'),
    getGlobalInputStatus: () => invoke<{ started: boolean; status: string; eventCount: number }>('global_input_status'),
    stopGlobalInput: async () => undefined,
    onGlobalInput: (callback: (event: DesktopInputEvent) => void) => {
      let disposed = false;
      let unlisten: (() => void) | null = null;

      listen<TauriGlobalInputPayload>('global-input', (event) => {
        if (disposed) return;
        callback({
          source: 'desktop',
          type: event.payload.type ?? event.payload.event_type ?? 'keydown',
          code: event.payload.code,
          time: performance.now()
        });
      }).then((nextUnlisten) => {
        if (disposed) nextUnlisten();
        else unlisten = nextUnlisten;
      });

      return () => {
        disposed = true;
        unlisten?.();
      };
    }
  };
}

export function createOverlayBridge() {
  if (window.trainerOverlay) return window.trainerOverlay;
  if (!isTauriRuntime()) return null;

  return {
    setOverlayBounds: (bounds: OverlayBounds) => invoke('set_overlay_bounds', { bounds }),
    requestOverlayMoveMode: (enabled: boolean) => invoke('request_overlay_move_mode', { enabled }),
    notifyOverlayBoundsChanged: (bounds: OverlayBounds) => invoke('notify_overlay_bounds_changed', { bounds }),
    onUpdate: (callback: (payload: unknown) => void) => {
      let disposed = false;
      let unlisten: (() => void) | null = null;

      listen<unknown>('overlay:update', (event) => {
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
  };
}
