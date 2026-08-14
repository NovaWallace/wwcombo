import {
  findVisualTemplateMatchInImageData,
  recognizeChallengeTimer
} from './realtimeVision';
import type {
  TimerRecognition,
  VisualTemplate,
  VisualTemplateMatch
} from './realtimeVision';

export type RealtimeVisionWorkerImage = {
  width: number;
  height: number;
  buffer: ArrayBuffer;
};

export type RealtimeVisionWorkerRequest = {
  id: number;
  capturedAt: number;
  sourceHeight: number;
  timer: {
    image: RealtimeVisionWorkerImage;
    luminanceThreshold: number;
  } | null;
  buffs: Array<{
    id: string;
    image: RealtimeVisionWorkerImage;
    template: VisualTemplate;
  }>;
};

export type RealtimeVisionWorkerResponse = {
  id: number;
  capturedAt: number;
  timerReading: TimerRecognition | null;
  matches: Array<[string, VisualTemplateMatch]>;
  analysisMs: number;
  error?: string;
};

function restoreImageData(image: RealtimeVisionWorkerImage): ImageData {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.buffer)
  } as ImageData;
}

const workerScope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<RealtimeVisionWorkerRequest>) => void): void;
  postMessage(message: RealtimeVisionWorkerResponse): void;
};

workerScope.addEventListener('message', (event) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    const timerReading = request.timer
      ? recognizeChallengeTimer(restoreImageData(request.timer.image), request.timer.luminanceThreshold)
      : null;
    const matches = request.buffs.map(({ id, image, template }) => [
      id,
      findVisualTemplateMatchInImageData(restoreImageData(image), template, request.sourceHeight)
    ] as [string, VisualTemplateMatch]);
    workerScope.postMessage({
      id: request.id,
      capturedAt: request.capturedAt,
      timerReading,
      matches,
      analysisMs: performance.now() - startedAt
    });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      capturedAt: request.capturedAt,
      timerReading: null,
      matches: [],
      analysisMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : 'worker-analysis-failed'
    });
  }
});
