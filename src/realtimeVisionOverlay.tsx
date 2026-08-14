import { StrictMode, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AlertTriangle, ScanLine } from 'lucide-react';
import { createRealtimeVisionOverlayBridge } from './desktopBridge';
import { isAppLanguage, localizeEnglish } from './i18n';
import type { AppLanguage } from './i18n';
import { formatChallengeTimerSeconds } from './realtimeVision';
import './realtimeVisionOverlay.css';

type RealtimeVisionOverlayPayload = {
  visible: boolean;
  language?: AppLanguage;
  timer: { text: string; confidence: number; stale?: boolean } | null;
  buffs: Array<{
    id: string;
    name: string;
    detectedAtTimerSeconds: number | null;
    expiresAtTimerSeconds: number | null;
    remainingSeconds: number | null;
    warning: boolean;
  }>;
};

const EMPTY_PAYLOAD: RealtimeVisionOverlayPayload = {
  visible: false,
  language: 'zh-CN',
  timer: null,
  buffs: []
};

function isPayload(value: unknown): value is RealtimeVisionOverlayPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RealtimeVisionOverlayPayload>;
  return typeof record.visible === 'boolean' && Array.isArray(record.buffs);
}

function localizedLabel(chinese: string, english: string, language: AppLanguage): string {
  return language === 'zh-CN' ? chinese : localizeEnglish(english, language);
}

function remainingLabel(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--';
  return `${Math.max(0, seconds).toFixed(seconds < 10 ? 1 : 0)}s`;
}

function RealtimeVisionOverlayApp() {
  const bridge = useMemo(createRealtimeVisionOverlayBridge, []);
  const [payload, setPayload] = useState<RealtimeVisionOverlayPayload>(EMPTY_PAYLOAD);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    const applyPayload = (next: unknown) => {
      if (!disposed && isPayload(next)) setPayload(next);
    };
    void (async () => {
      if (!bridge) return;
      stopListening = await bridge.onUpdate(applyPayload);
      applyPayload(await bridge.getState().catch(() => null));
    })();
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [bridge]);

  const language = isAppLanguage(payload.language) ? payload.language : 'zh-CN';
  if (!payload.visible) return null;
  return <main className={`realtime-vision-overlay ${payload.buffs.some((buff) => buff.warning) ? 'has-warning' : ''}`}>
    <header>
      <span><ScanLine size={16} />{localizedLabel('实时识别', 'Real-time Vision', language)}</span>
      <strong className={payload.timer?.stale ? 'stale' : ''}>{payload.timer?.text ?? '--:--'}</strong>
    </header>
    <div className="realtime-vision-overlay-buffs">
      {payload.buffs.map((buff) => {
        const expiresAt = formatChallengeTimerSeconds(buff.expiresAtTimerSeconds);
        return <div key={buff.id} className={buff.warning ? 'warning' : ''}>
          <span>{buff.warning ? <AlertTriangle size={15} /> : <i />}{buff.name}</span>
          <span className="realtime-vision-overlay-deadline">
            <strong>{expiresAt
              ? `${localizedLabel('到期时间', 'Expires at', language)} ${expiresAt}`
              : localizedLabel('到期时间不可用', 'Expiry unavailable', language)}</strong>
            <small>{localizedLabel('剩余', 'Remaining', language)} {remainingLabel(buff.remainingSeconds)}</small>
          </span>
        </div>;
      })}
      {!payload.buffs.length && <p>{localizedLabel('等待 Buff', 'Waiting for Buffs', language)}</p>}
    </div>
  </main>;
}

ReactDOM.createRoot(document.getElementById('realtime-vision-root')!).render(<StrictMode><RealtimeVisionOverlayApp /></StrictMode>);
