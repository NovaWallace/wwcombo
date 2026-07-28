import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createRecordingIndicatorBridge } from './desktopBridge';
import './recordingIndicator.css';

type RecordingIndicatorPayload = {
  visible: boolean;
  recording: boolean;
};

function isPayload(value: unknown): value is RecordingIndicatorPayload {
  return typeof value === 'object' && value !== null
    && typeof (value as Partial<RecordingIndicatorPayload>).visible === 'boolean'
    && typeof (value as Partial<RecordingIndicatorPayload>).recording === 'boolean';
}

function RecordingIndicatorApp() {
  const bridge = useMemo(createRecordingIndicatorBridge, []);
  const [payload, setPayload] = useState<RecordingIndicatorPayload>({ visible: false, recording: false });

  useEffect(() => bridge?.onUpdate((next) => {
    if (isPayload(next)) setPayload(next);
  }), [bridge]);

  useEffect(() => {
    let disposed = false;
    bridge?.getState().then((next) => {
      if (!disposed && isPayload(next)) setPayload(next);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [bridge]);

  return (
    <div className={`recording-indicator-root ${payload.visible ? 'shown' : 'hidden'}`}>
      {payload.visible && <span className={`recording-status-dot ${payload.recording ? 'recording' : 'idle'}`} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('recording-indicator-root')!).render(<React.StrictMode><RecordingIndicatorApp /></React.StrictMode>);
