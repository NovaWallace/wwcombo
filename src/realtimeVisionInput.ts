export type RealtimeVisionInputMode = 'keyboard' | 'gamepad';

export type RealtimeVisionInputSignal = {
  id: string;
  type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'gamepadbuttondown' | 'gamepadbuttonup';
  code: string;
  time: number;
  inputMode: RealtimeVisionInputMode;
};

type RealtimeVisionInputListener = (signal: RealtimeVisionInputSignal) => void;

const listeners = new Set<RealtimeVisionInputListener>();

export function publishRealtimeVisionInput(signal: RealtimeVisionInputSignal): void {
  for (const listener of listeners) {
    try {
      listener(signal);
    } catch (error) {
      console.error('[realtime-vision-input] listener failed', error);
    }
  }
}

export function subscribeRealtimeVisionInput(listener: RealtimeVisionInputListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
