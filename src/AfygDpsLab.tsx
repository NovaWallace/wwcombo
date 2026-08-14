import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { Calculator, CheckCircle2, Download, ExternalLink, FileInput, Link2, Lock, RefreshCw, Send, Sparkles, TriangleAlert } from 'lucide-react';
import type { CharacterSlot, ComboChart, ComboImageStyle, ComboPeriod, ComboStep } from '../combo-core';
import { AFYG_EMBED_URL, afygOperationIdForStepId, buildAfygDirectImportUrl, buildAfygProject, defaultAfygOperationKey } from './afygAdapter';
import type { AfygOperationKeyOverrides } from './afygAdapter';
import { EmbeddedBrowserExitControl } from './EmbeddedBrowserExitControl';
import { useI18n } from './i18n';

type Props = {
  chart: ComboChart | null;
  library: ComboChart[];
  style: ComboImageStyle;
  appearanceMode: 'night' | 'day' | 'night2' | 'coast';
  timelineEditor: ReactNode;
  playheadControl?: AfygPlayheadControl;
  onSelectChart: (id: string) => void;
  onUpdateStep?: (stepId: string, patch: Partial<ComboStep>) => void;
  onPeriodsChange?: (periods: ComboPeriod[]) => void;
  onExport: (filename: string, bytes: Uint8Array) => Promise<void>;
  onOpenTool: (url?: string) => void;
  onExit: () => void;
};

type FloatingPosition = { x: number; y: number };
type HostedTimelineLayout = { left: number; top: number; width: number; height: number };
type AfygPlayheadControl = { playbackMs: number; onSeek: (timeMs: number) => void; disabled?: boolean; autoFollow?: boolean };
type AdapterTab = 'direct' | 'effects';
type EntryLoadDecision = 'pending' | 'confirmed' | 'cancelled';
type EntryLoadStatus = 'idle' | 'waiting' | 'syncing' | 'done' | 'error';
type AfygSkillOption = { skillType: string; hitName: string; ratio: string; element: string };
type AfygSkillBinding = AfygSkillOption & { character: string; hits?: number };
type AfygNonDirectOption = { name: string; category: '处决' | '响应' | '效应'; maxLayers: number; element: string };
type AfygNonDirectBinding = { name: string; category?: '处决' | '响应' | '效应'; layers?: number; responders?: string[] };
type AfygBridgeStatus = 'idle' | 'checking' | 'ready' | 'no-project' | 'unavailable';
type AfygInjectedBridgeStatus = 'waiting' | 'ready' | 'missing';
type AfygBridgeResponse = {
  type: 'wwcombo:afyg-bridge-response';
  version: 1;
  requestId: string;
  action: string;
  ok: boolean;
  error?: string;
  projectId?: string;
  project?: unknown;
  binding?: unknown;
};
type PendingAfygBridgeRequest = {
  resolve: (response: AfygBridgeResponse) => void;
  reject: (error: Error) => void;
  timer: number;
};
type PendingAfygToolRequest = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
};
type AfygRemoteState = {
  project?: { id?: string; name?: string } | null;
  view?: string;
  locked?: Record<string, boolean> | null;
  panels?: Record<string, boolean>;
};
type FloatingDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  moved: boolean;
};
type AfygTimelinePanelDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  startHeight: number;
  startZoom: number;
  axis: 'horizontal' | 'vertical' | null;
  moved: boolean;
  longPressTimer: number | null;
  resetTriggered: boolean;
};
type AfygTimelinePanelControl = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onWheel: (event: ReactWheelEvent<HTMLButtonElement>) => void;
};

const AFYG_WS_TARGET = '127.0.0.1:8765';
const DEFAULT_AFYG_TIMELINE_ZOOM = 0.46;
const DEFAULT_AFYG_TIMELINE_LANE_HEIGHT = 42;
const AFYG_TIMELINE_MIN_HEIGHT = 64;
const AFYG_TIMELINE_DRAG_THRESHOLD = 4;
const AFYG_TIMELINE_RESET_HOLD_MS = 3000;
const AFYG_TIMELINE_LANE_STEP = 4;
const TIMELINE_CONTENT_OFFSET_PX = 112;

function clampAfyg(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildAfygWsEmbedUrl(baseUrl: string): string {
  return `${baseUrl.replace(/#.*$/u, '')}#websocket=${encodeURIComponent(AFYG_WS_TARGET)}&timeline_host=wwcombo`;
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'wwcombo';
}

function AfygSecondsField({ label, valueMs, onCommit, disabled = false }: { label: string; valueMs: number; onCommit: (valueMs: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(() => (Math.max(0, valueMs) / 1000).toFixed(2));

  useEffect(() => {
    setDraft((Math.max(0, valueMs) / 1000).toFixed(2));
  }, [valueMs]);

  function commit() {
    const seconds = Number(draft);
    if (!Number.isFinite(seconds) || seconds < 0) {
      setDraft((Math.max(0, valueMs) / 1000).toFixed(2));
      return;
    }
    onCommit(Math.round(seconds * 1000));
  }

  return <label className="afyg-range-field"><span>{label}</span><input type="number" min="0" step="0.01" value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); } }} /></label>;
}

function projectFromAfygFile(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-file');
  const record = value as Record<string, unknown>;
  const projectValue = Array.isArray(record.project) ? record.project[0] : record.project ?? record;
  if (!projectValue || typeof projectValue !== 'object' || Array.isArray(projectValue)) throw new Error('invalid-file');
  const project = projectValue as Record<string, unknown>;
  if (!Array.isArray(project.team) || !project.team.length) throw new Error('team-missing');
  return project;
}

function projectTimelineOperationIds(project: Record<string, unknown>): Set<string> {
  const phases = project.phases && typeof project.phases === 'object' && !Array.isArray(project.phases)
    ? project.phases as Record<string, unknown>
    : null;
  const timelinePhase = phases?.timeline && typeof phases.timeline === 'object' && !Array.isArray(phases.timeline)
    ? phases.timeline as Record<string, unknown>
    : null;
  const timeline = timelinePhase?.data && typeof timelinePhase.data === 'object' && !Array.isArray(timelinePhase.data)
    ? timelinePhase.data as Record<string, unknown>
    : null;
  const blocks = Array.isArray(timeline?.opBlocks) ? timeline.opBlocks : [];
  return new Set(blocks.flatMap((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return [];
    const id = (block as { id?: unknown }).id;
    return typeof id === 'string' && id ? [id] : [];
  }));
}

export function AfygDpsLab({ chart, library, style, appearanceMode, timelineEditor, playheadControl, onSelectChart, onUpdateStep, onPeriodsChange, onExport, onOpenTool, onExit }: Props) {
  const { text } = useI18n();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const baseProjectInputRef = useRef<HTMLInputElement | null>(null);
  const pendingBridgeRequestsRef = useRef(new Map<string, PendingAfygBridgeRequest>());
  const pendingToolRequestsRef = useRef(new Map<string, PendingAfygToolRequest>());
  const orbDragRef = useRef<FloatingDrag | null>(null);
  const drawerDragRef = useRef<FloatingDrag | null>(null);
  const autoSyncTimerRef = useRef<number | null>(null);
  const bindingSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const ensuringOperationIdRef = useRef('');
  const nonDirectDirtyRef = useRef(false);
  const entrySyncAttemptKeyRef = useRef('');
  const entrySyncCompletedRef = useRef(false);
  const suppressOrbClickRef = useRef(false);
  const suppressDrawerCollapseRef = useRef(false);
  const [roleNames, setRoleNames] = useState<Record<CharacterSlot, string>>(() => ({
    1: style.roleStyles[1].name,
    2: style.roleStyles[2].name,
    3: style.roleStyles[3].name,
    4: style.roleStyles[4].name
  }));
  const [operationKeys, setOperationKeys] = useState<AfygOperationKeyOverrides>({});
  const [exporting, setExporting] = useState(false);
  const [baseProject, setBaseProject] = useState<Record<string, unknown> | null>(null);
  const [baseProjectError, setBaseProjectError] = useState('');
  const [activeAfygProjectId, setActiveAfygProjectId] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState<AfygBridgeStatus>('idle');
  const [injectedBridgeStatus, setInjectedBridgeStatus] = useState<AfygInjectedBridgeStatus>('waiting');
  const [websocketBridgeReady, setWebsocketBridgeReady] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsTools, setWsTools] = useState<string[]>([]);
  const [wsState, setWsState] = useState<AfygRemoteState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [adapterOpen, setAdapterOpen] = useState(false);
  const [adapterTab, setAdapterTab] = useState<AdapterTab>('direct');
  const [entryLoadDecision, setEntryLoadDecision] = useState<EntryLoadDecision>(() => chart ? 'pending' : 'cancelled');
  const [entryLoadStatus, setEntryLoadStatus] = useState<EntryLoadStatus>('idle');
  const [hostedTimelineLayout, setHostedTimelineLayout] = useState<HostedTimelineLayout | null>(null);
  const [afygSidebarOverlayRight, setAfygSidebarOverlayRight] = useState(0);
  const [afygTimelineCollapsed, setAfygTimelineCollapsed] = useState(false);
  const [afygTimelineHeight, setAfygTimelineHeight] = useState(0);
  const [afygTimelineZoom, setAfygTimelineZoom] = useState(DEFAULT_AFYG_TIMELINE_ZOOM);
  const [afygTimelineLaneHeight, setAfygTimelineLaneHeight] = useState(DEFAULT_AFYG_TIMELINE_LANE_HEIGHT);
  const [hostedPlayheadLeft, setHostedPlayheadLeft] = useState<number | null>(null);
  const [damagePlayheadRange, setDamagePlayheadRange] = useState<{ top: number; bottom: number } | null>(null);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<ComboPeriod | null>(null);
  const [syncedProjectId, setSyncedProjectId] = useState('');
  const [remoteOperationIds, setRemoteOperationIds] = useState<Set<string>>(() => new Set());
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingSaving, setBindingSaving] = useState(false);
  const [bindingError, setBindingError] = useState('');
  const [directCharacter, setDirectCharacter] = useState('');
  const [skillOptions, setSkillOptions] = useState<AfygSkillOption[]>([]);
  const [skillBindings, setSkillBindings] = useState<AfygSkillBinding[]>([]);
  const [nonDirectOptions, setNonDirectOptions] = useState<AfygNonDirectOption[]>([]);
  const [nonDirectBindings, setNonDirectBindings] = useState<AfygNonDirectBinding[]>([]);
  const [bindingFocusIndex, setBindingFocusIndex] = useState(0);
  const [orbPosition, setOrbPosition] = useState<FloatingPosition | null>(null);
  const [drawerPosition, setDrawerPosition] = useState<FloatingPosition | null>(null);
  const [frameSrc, setFrameSrc] = useState(() => buildAfygWsEmbedUrl(AFYG_EMBED_URL));
  const [frameStatus, setFrameStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const desktopBridgeExpected = '__TAURI_INTERNALS__' in window;
  const afygTimelinePanelDragRef = useRef<AfygTimelinePanelDrag | null>(null);
  const afygTimelineSuppressClickRef = useRef(false);
  const timelineScrollNodeRef = useRef<HTMLDivElement | null>(null);
  const damageScrollTargetRef = useRef<number | null>(null);
  const damageScrollSuppressUntilRef = useRef(0);
  const timelineScrollUserIntentUntilRef = useRef(0);
  const timelineScrollSendFrameRef = useRef<number | null>(null);
  const timelineScrollSettleTimerRef = useRef<number | null>(null);
  const timelineScrollSequenceRef = useRef(0);
  const lastDamageScrollSequenceRef = useRef(0);
  const timelineScrollInputAtRef = useRef(0);
  const playheadControlRef = useRef(playheadControl);
  const afygTimelineDurationMs = useMemo(() => Math.max(
    3000,
    ...(chart?.steps.map((step) => step.startMax + step.durationMax + 600) ?? []),
    ...(chart?.periods?.map((period) => period.endMs + 600) ?? [])
  ), [chart]);
  const afygTimelineTrackWidth = Math.max(760, Math.ceil(afygTimelineDurationMs * afygTimelineZoom));
  const afygTimelinePixelsPerMs = afygTimelineTrackWidth / afygTimelineDurationMs;
  const afygTimelineAnchorsMs = useMemo(() => [...new Set([
    ...(chart?.steps.map((step) => Math.max(0, Math.round(step.startMin))) ?? []),
    Math.round(afygTimelineDurationMs)
  ])].sort((left, right) => left - right), [afygTimelineDurationMs, chart]);
  const afygTheme = appearanceMode === 'day' || appearanceMode === 'coast' ? 'light' : 'dark';

  function postAfygTheme() {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'wwcombo:afyg-theme',
      version: 1,
      theme: afygTheme,
      appearanceMode
    }, new URL(AFYG_EMBED_URL).origin);
  }

  useEffect(() => {
    playheadControlRef.current = playheadControl;
  }, [playheadControl]);

  useEffect(() => {
    if (frameStatus !== 'ready') return;
    postAfygTheme();
  }, [afygTheme, appearanceMode]);

  function syncHostedPlayheadLine() {
    const node = timelineScrollNodeRef.current;
    const section = pageRef.current?.querySelector<HTMLElement>('.afyg-hosted-timeline') ?? null;
    const iframeRect = iframeRef.current?.getBoundingClientRect();
    if (!node || !section || !iframeRect || afygTimelineCollapsed || !playheadControlRef.current || playheadControlRef.current.disabled) {
      setHostedPlayheadLeft(null);
      return;
    }
    const nodeRect = node.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const viewportX = nodeRect.left + TIMELINE_CONTENT_OFFSET_PX + Math.max(0, playheadControlRef.current.playbackMs) * afygTimelinePixelsPerMs - node.scrollLeft;
    setHostedPlayheadLeft((current) => {
      if (viewportX < nodeRect.left + TIMELINE_CONTENT_OFFSET_PX || viewportX > nodeRect.right) return null;
      const next = viewportX - sectionRect.left;
      return current !== null && Math.abs(current - next) < 0.1 ? current : next;
    });
    iframeRef.current?.contentWindow?.postMessage({
      type: 'wwcombo:afyg-playhead-geometry',
      version: 1,
      viewportX: viewportX - iframeRect.left
    }, new URL(AFYG_EMBED_URL).origin);
  }

  useEffect(() => () => {
    const timer = afygTimelinePanelDragRef.current?.longPressTimer;
    if (timer !== null && timer !== undefined) window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const allowedOrigins = new Set([
      new URL(AFYG_EMBED_URL).origin,
      'https://wuwa-afyg-tool.200503.xyz',
      'https://wuwa-hpyg-tool.200503.xyz'
    ]);
    const handleBridgeResponse = (event: MessageEvent) => {
      if (!allowedOrigins.has(event.origin) || event.source !== iframeRef.current?.contentWindow) return;
      const bridgeStatusMessage = event.data as { type?: string; version?: number; ready?: boolean; websocketReady?: boolean } | null;
      const damageSeekMessage = event.data as { type?: string; version?: number; timeMs?: unknown } | null;
      if (damageSeekMessage?.type === 'wwcombo:afyg-damage-seek' && damageSeekMessage.version === 1 && typeof damageSeekMessage.timeMs === 'number' && Number.isFinite(damageSeekMessage.timeMs)) {
        playheadControlRef.current?.onSeek(Math.max(0, Math.round(damageSeekMessage.timeMs)));
        return;
      }
      const damagePlayheadLayout = event.data as { type?: string; version?: number; rect?: { top?: unknown; bottom?: unknown } } | null;
      if (damagePlayheadLayout?.type === 'wwcombo:afyg-damage-playhead-layout' && damagePlayheadLayout.version === 1) {
        const top = damagePlayheadLayout.rect?.top;
        const bottom = damagePlayheadLayout.rect?.bottom;
        if (typeof top === 'number' && Number.isFinite(top) && typeof bottom === 'number' && Number.isFinite(bottom) && bottom > top) {
          setDamagePlayheadRange((current) => current && Math.abs(current.top - top) < 0.1 && Math.abs(current.bottom - bottom) < 0.1 ? current : { top, bottom });
        } else {
          setDamagePlayheadRange(null);
        }
        return;
      }
      const damageScrollMessage = event.data as { type?: string; version?: number; ratio?: unknown; viewportX?: unknown; sequence?: unknown; inputAt?: unknown } | null;
      if (damageScrollMessage?.type === 'wwcombo:afyg-damage-scroll' && damageScrollMessage.version === 1 && typeof damageScrollMessage.ratio === 'number' && Number.isFinite(damageScrollMessage.ratio)) {
        const sequence = typeof damageScrollMessage.sequence === 'number' && Number.isFinite(damageScrollMessage.sequence)
          ? Math.max(0, Math.floor(damageScrollMessage.sequence))
          : 0;
        if (sequence > 0 && sequence <= lastDamageScrollSequenceRef.current) return;
        if (sequence > 0) lastDamageScrollSequenceRef.current = sequence;
        const inputAt = typeof damageScrollMessage.inputAt === 'number' && Number.isFinite(damageScrollMessage.inputAt)
          ? Math.max(0, damageScrollMessage.inputAt)
          : 0;
        if (inputAt < timelineScrollInputAtRef.current) return;
        if (timelineScrollSendFrameRef.current !== null) {
          cancelAnimationFrame(timelineScrollSendFrameRef.current);
          timelineScrollSendFrameRef.current = null;
        }
        if (timelineScrollSettleTimerRef.current !== null) {
          window.clearTimeout(timelineScrollSettleTimerRef.current);
          timelineScrollSettleTimerRef.current = null;
        }
        const node = timelineScrollNodeRef.current;
        if (!node) return;
        const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
        const iframeRect = iframeRef.current?.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        const nextScrollLeft = typeof damageScrollMessage.viewportX === 'number'
          && Number.isFinite(damageScrollMessage.viewportX)
          && iframeRect
          ? clampAfyg(
              nodeRect.left - iframeRect.left + TIMELINE_CONTENT_OFFSET_PX - damageScrollMessage.viewportX,
              0,
              maxScrollLeft
            )
          : clampAfyg(damageScrollMessage.ratio, 0, 1) * maxScrollLeft;
        damageScrollTargetRef.current = nextScrollLeft;
        damageScrollSuppressUntilRef.current = performance.now() + 160;
        if (Math.abs(node.scrollLeft - nextScrollLeft) > 0.25) node.scrollLeft = nextScrollLeft;
        return;
      }
      if (bridgeStatusMessage?.type === 'wwcombo:afyg-bridge-status' && bridgeStatusMessage.version === 1 && bridgeStatusMessage.ready) {
        setInjectedBridgeStatus('ready');
        setWebsocketBridgeReady(bridgeStatusMessage.websocketReady === true);
        setBridgeStatus((current) => current === 'unavailable' ? 'idle' : current);
        setBaseProjectError('');
        return;
      }
      const hostLayout = event.data as { type?: string; version?: number; visible?: boolean; rect?: Partial<HostedTimelineLayout> } | null;
      const sidebarOverlay = event.data as { type?: string; version?: number; expanded?: boolean; right?: unknown } | null;
      if (sidebarOverlay?.type === 'wwcombo:afyg-sidebar-overlay' && sidebarOverlay.version === 1) {
        setAfygSidebarOverlayRight(sidebarOverlay.expanded === true && typeof sidebarOverlay.right === 'number' && Number.isFinite(sidebarOverlay.right)
          ? Math.max(0, sidebarOverlay.right)
          : 0);
        return;
      }
      if (hostLayout?.type === 'wwcombo:afyg-host-layout' && hostLayout.version === 1) {
        const rect = hostLayout.rect;
        if (!hostLayout.visible || !rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) {
          setHostedTimelineLayout(null);
        } else {
          const nextLayout = { left: Number(rect.left), top: Number(rect.top), width: Number(rect.width), height: Number(rect.height) };
          setHostedTimelineLayout((current) => current
            && current.left === nextLayout.left
            && current.top === nextLayout.top
            && current.width === nextLayout.width
            && current.height === nextLayout.height
            ? current
            : nextLayout);
        }
        return;
      }
      const upstream = event.data as { type?: string; version?: number; event?: string; data?: unknown } | null;
      if (upstream?.type === 'wwcombo:afyg-ws-upstream' && upstream.version === 1) {
        if (upstream.event === 'open') {
          setWsConnected(false);
          return;
        }
        if (upstream.event === 'close') {
          setWsConnected(false);
          setWsTools([]);
          pendingToolRequestsRef.current.forEach((pending) => {
            window.clearTimeout(pending.timer);
            pending.reject(new Error('ws-disconnected'));
          });
          pendingToolRequestsRef.current.clear();
          return;
        }
        if (upstream.event !== 'message' || typeof upstream.data !== 'string') return;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(upstream.data) as Record<string, unknown>;
        } catch {
          return;
        }
        if (message.type === 'hello' && message.app === 'wuwa-afyg') {
          const tools = Array.isArray(message.tools) ? message.tools.flatMap((item) => {
            if (!item || typeof item !== 'object') return [];
            const fn = (item as { function?: { name?: unknown } }).function;
            return typeof fn?.name === 'string' ? [fn.name] : [];
          }) : [];
          setWsTools(tools);
          setWsState(message.state && typeof message.state === 'object' ? message.state as AfygRemoteState : null);
          setWsConnected(true);
          setBridgeStatus('idle');
          setBaseProjectError('');
          return;
        }
        if (message.type === 'state') {
          setWsState(message.state && typeof message.state === 'object' ? message.state as AfygRemoteState : null);
          return;
        }
        if (message.type === 'result' && typeof message.id === 'string') {
          const pending = pendingToolRequestsRef.current.get(message.id);
          if (!pending) return;
          window.clearTimeout(pending.timer);
          pendingToolRequestsRef.current.delete(message.id);
          if (message.ok === true) pending.resolve(message.data);
          else pending.reject(new Error(typeof message.error === 'string' ? message.error : 'afyg-tool-failed'));
        }
        return;
      }
      const response = event.data as Partial<AfygBridgeResponse> | null;
      if (!response || response.type !== 'wwcombo:afyg-bridge-response' || response.version !== 1 || typeof response.requestId !== 'string') return;
      const pending = pendingBridgeRequestsRef.current.get(response.requestId);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingBridgeRequestsRef.current.delete(response.requestId);
      if (response.ok) pending.resolve(response as AfygBridgeResponse);
      else pending.reject(new Error(response.error || 'bridge-request-failed'));
    };
    window.addEventListener('message', handleBridgeResponse);
    const pendingRequests = pendingBridgeRequestsRef.current;
    return () => {
      window.removeEventListener('message', handleBridgeResponse);
      pendingRequests.forEach((pending) => {
        window.clearTimeout(pending.timer);
        pending.reject(new Error('bridge-unmounted'));
      });
      pendingRequests.clear();
      pendingToolRequestsRef.current.forEach((pending) => {
        window.clearTimeout(pending.timer);
        pending.reject(new Error('bridge-unmounted'));
      });
      pendingToolRequestsRef.current.clear();
      if (autoSyncTimerRef.current !== null) window.clearTimeout(autoSyncTimerRef.current);
      if (timelineScrollSendFrameRef.current !== null) cancelAnimationFrame(timelineScrollSendFrameRef.current);
      if (timelineScrollSettleTimerRef.current !== null) window.clearTimeout(timelineScrollSettleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (frameStatus !== 'ready') return;
    iframeRef.current?.contentWindow?.postMessage({
      type: 'wwcombo:afyg-playhead',
      version: 1,
      enabled: Boolean(playheadControl && !playheadControl.disabled),
      playbackMs: Math.max(0, Math.round(playheadControl?.playbackMs ?? 0))
    }, new URL(AFYG_EMBED_URL).origin);
  }, [frameStatus, playheadControl?.disabled, playheadControl?.playbackMs]);

  useEffect(() => {
    const frame = requestAnimationFrame(syncHostedPlayheadLine);
    return () => cancelAnimationFrame(frame);
  }, [afygTimelineCollapsed, afygTimelinePixelsPerMs, hostedTimelineLayout, playheadControl?.disabled, playheadControl?.playbackMs]);

  useEffect(() => {
    if (frameStatus !== 'ready' || !hostedTimelineLayout || afygTimelineCollapsed) return;
    const node = pageRef.current?.querySelector<HTMLDivElement>('.afyg-hosted-timeline .timeline-editor-scroll') ?? null;
    timelineScrollNodeRef.current = node;
    if (!node) return;

    const sendTimelineScroll = () => {
      timelineScrollSendFrameRef.current = null;
      const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
      const iframeRect = iframeRef.current?.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      timelineScrollSequenceRef.current += 1;
      iframeRef.current?.contentWindow?.postMessage({
        type: 'wwcombo:afyg-timeline-scroll',
        version: 1,
        source: 'timeline',
        sequence: timelineScrollSequenceRef.current,
        inputAt: timelineScrollInputAtRef.current,
        ratio: maxScrollLeft > 0 ? clampAfyg(node.scrollLeft / maxScrollLeft, 0, 1) : 0,
        scrollLeft: node.scrollLeft,
        viewportOffsetX: iframeRect ? nodeRect.left - iframeRect.left : 0,
        contentOffset: TIMELINE_CONTENT_OFFSET_PX,
        pixelsPerMs: afygTimelinePixelsPerMs,
        renderTotalMs: afygTimelineDurationMs,
        anchorsMs: afygTimelineAnchorsMs
      }, new URL(AFYG_EMBED_URL).origin);
      syncHostedPlayheadLine();
    };

    const queueTimelineScroll = () => {
      const now = performance.now();
      const target = damageScrollTargetRef.current;
      const hasUserIntent = now <= timelineScrollUserIntentUntilRef.current;
      if (target !== null && !hasUserIntent && now <= damageScrollSuppressUntilRef.current) {
        if (Math.abs(node.scrollLeft - target) > 0.25) node.scrollLeft = target;
        return;
      }
      if (hasUserIntent) {
        timelineScrollUserIntentUntilRef.current = now + 180;
        damageScrollTargetRef.current = null;
        damageScrollSuppressUntilRef.current = 0;
      } else if (target !== null && now > damageScrollSuppressUntilRef.current) {
        damageScrollTargetRef.current = null;
      }
      if (timelineScrollSendFrameRef.current === null) {
        timelineScrollSendFrameRef.current = requestAnimationFrame(sendTimelineScroll);
      }
      if (timelineScrollSettleTimerRef.current !== null) window.clearTimeout(timelineScrollSettleTimerRef.current);
      timelineScrollSettleTimerRef.current = window.setTimeout(() => {
        timelineScrollSettleTimerRef.current = null;
        if (timelineScrollSendFrameRef.current !== null) cancelAnimationFrame(timelineScrollSendFrameRef.current);
        sendTimelineScroll();
      }, 100);
    };

    const markTimelineScrollIntent = () => {
      timelineScrollInputAtRef.current = Date.now();
      timelineScrollUserIntentUntilRef.current = performance.now() + 220;
      damageScrollTargetRef.current = null;
      damageScrollSuppressUntilRef.current = 0;
    };
    const resizeObserver = new ResizeObserver(queueTimelineScroll);
    node.addEventListener('wheel', markTimelineScrollIntent, { passive: true });
    node.addEventListener('pointerdown', markTimelineScrollIntent, { passive: true });
    node.addEventListener('touchstart', markTimelineScrollIntent, { passive: true });
    node.addEventListener('keydown', markTimelineScrollIntent);
    node.addEventListener('scroll', queueTimelineScroll, { passive: true });
    resizeObserver.observe(node);
    const content = node.querySelector<HTMLElement>('.timeline-scroll-content');
    if (content) resizeObserver.observe(content);
    const initialFrame = requestAnimationFrame(sendTimelineScroll);
    return () => {
      cancelAnimationFrame(initialFrame);
      node.removeEventListener('wheel', markTimelineScrollIntent);
      node.removeEventListener('pointerdown', markTimelineScrollIntent);
      node.removeEventListener('touchstart', markTimelineScrollIntent);
      node.removeEventListener('keydown', markTimelineScrollIntent);
      node.removeEventListener('scroll', queueTimelineScroll);
      resizeObserver.disconnect();
      if (timelineScrollSendFrameRef.current !== null) {
        cancelAnimationFrame(timelineScrollSendFrameRef.current);
        timelineScrollSendFrameRef.current = null;
      }
      if (timelineScrollSettleTimerRef.current !== null) {
        window.clearTimeout(timelineScrollSettleTimerRef.current);
        timelineScrollSettleTimerRef.current = null;
      }
      if (timelineScrollNodeRef.current === node) timelineScrollNodeRef.current = null;
    };
  }, [afygTimelineAnchorsMs, afygTimelineCollapsed, afygTimelineDurationMs, afygTimelinePixelsPerMs, afygTimelineZoom, chart?.id, frameStatus, hostedTimelineLayout?.height, hostedTimelineLayout?.left, hostedTimelineLayout?.top, hostedTimelineLayout?.width]);

  useEffect(() => {
    setRoleNames({
      1: style.roleStyles[1].name,
      2: style.roleStyles[2].name,
      3: style.roleStyles[3].name,
      4: style.roleStyles[4].name
    });
  }, [chart?.id, style.roleStyles]);

  useEffect(() => {
    if (!wsConnected) return;
    const remoteProjectId = typeof wsState?.project?.id === 'string' ? wsState.project.id : '';
    if (!remoteProjectId) {
      // The remote state is briefly empty while AFYG reloads after a timeline write.
      // Keep the confirmed project until a direct read proves that it changed.
      return;
    }
    if (activeAfygProjectId && activeAfygProjectId !== remoteProjectId) {
      setBaseProject(null);
      setActiveAfygProjectId('');
      setSyncedProjectId('');
      setRemoteOperationIds(new Set());
      setBridgeStatus('idle');
    }
  }, [activeAfygProjectId, wsConnected, wsState]);

  useEffect(() => {
    if (!adapterOpen || !desktopBridgeExpected || frameStatus !== 'ready' || injectedBridgeStatus !== 'ready') return;
    if (bridgeStatus === 'checking' || bridgeStatus === 'ready') return;
    const timer = window.setTimeout(() => void readCurrentAfygProject(), wsConnected ? 0 : 80);
    return () => window.clearTimeout(timer);
  }, [adapterOpen, bridgeStatus, frameStatus, injectedBridgeStatus, wsConnected]);

  const moveRows = useMemo(() => {
    const rows = new Map<string, { moveId: string; label: string; count: number }>();
    chart?.steps.forEach((step) => {
      const current = rows.get(step.moveId);
      if (current) current.count += 1;
      else rows.set(step.moveId, { moveId: step.moveId, label: step.label || step.moveId, count: 1 });
    });
    return [...rows.values()];
  }, [chart]);

  const result = useMemo(
    () => chart ? buildAfygProject({ chart, style, roleNames, operationKeyOverrides: operationKeys, baseProject }) : null,
    [chart, style, roleNames, operationKeys, baseProject]
  );
  const chartOptions = useMemo(
    () => chart && !library.some((item) => item.id === chart.id) ? [chart, ...library] : library,
    [chart, library]
  );

  useEffect(() => {
    if (!desktopBridgeExpected || frameStatus !== 'ready' || injectedBridgeStatus !== 'waiting') return;
    let cancelled = false;
    let attempts = 0;
    const probe = async () => {
      attempts += 1;
      try {
        const response = await requestAfygBridge('ping');
        if (cancelled) return;
        setInjectedBridgeStatus('ready');
        setWebsocketBridgeReady((response as AfygBridgeResponse & { websocketReady?: boolean }).websocketReady === true);
        setBridgeStatus((current) => current === 'unavailable' ? 'idle' : current);
      } catch {
        if (cancelled) return;
        if (attempts >= 3) setInjectedBridgeStatus('missing');
        else window.setTimeout(() => void probe(), 500);
      }
    };
    const timer = window.setTimeout(() => void probe(), 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [desktopBridgeExpected, frameStatus, injectedBridgeStatus]);

  const selectedStep = useMemo(
    () => selectedStepIds.length === 1 ? chart?.steps.find((step) => step.id === selectedStepIds[0]) ?? null : null,
    [chart, selectedStepIds]
  );
  useEffect(() => {
    if (!selectedStep || selectedStep.characterSlot !== undefined) return;
    setAdapterTab('effects');
    setAdapterOpen(true);
  }, [selectedStep?.id, selectedStep?.characterSlot]);
  const selectedOperationId = selectedStep ? afygOperationIdForStepId(selectedStep.id) : '';
  const selectedOperationReady = Boolean(
    selectedOperationId
    && activeAfygProjectId
    && remoteOperationIds.has(selectedOperationId)
  );
  const selectedRangeStep = selectedStep && !selectedPeriod ? selectedStep : null;
  const timelineHostProps = isValidElement(timelineEditor) ? timelineEditor.props as { onUpdate?: (stepId: string, patch: Partial<ComboStep>) => void; onPeriodsChange?: (periods: ComboPeriod[]) => void } : null;
  const commitStepUpdate = onUpdateStep ?? timelineHostProps?.onUpdate;
  const commitPeriodsChange = onPeriodsChange ?? timelineHostProps?.onPeriodsChange;

  function updateSelectedPeriodRange(field: 'start' | 'end', valueMs: number) {
    if (afygTimelineLocked || !selectedPeriod || !chart || !commitPeriodsChange) return;
    const nextStartMs = field === 'start' ? Math.min(valueMs, selectedPeriod.endMs - 1) : selectedPeriod.startMs;
    const nextEndMs = field === 'end' ? Math.max(valueMs, selectedPeriod.startMs + 1) : selectedPeriod.endMs;
    commitPeriodsChange((chart.periods ?? []).map((period) => period.id === selectedPeriod.id
      ? { ...period, startMs: Math.max(0, nextStartMs), endMs: Math.max(nextStartMs + 1, nextEndMs) }
      : period));
  }

  function updateSelectedStepRange(field: 'start' | 'end', valueMs: number) {
    if (afygTimelineLocked || !selectedRangeStep || !commitStepUpdate) return;
    if (field === 'start') {
      const nextStartMs = Math.max(0, Math.min(valueMs, selectedRangeStep.startMin + selectedRangeStep.durationMax - 1));
      commitStepUpdate(selectedRangeStep.id, { startMin: nextStartMs, startMax: Math.max(selectedRangeStep.startMax, nextStartMs) });
      return;
    }
    const nextDurationMs = Math.max(1, valueMs - selectedRangeStep.startMin);
    commitStepUpdate(selectedRangeStep.id, { durationMax: nextDurationMs, durationMin: Math.min(selectedRangeStep.durationMin, nextDurationMs) });
  }

  const teamCharacters = useMemo(
    () => ([1, 2, 3] as CharacterSlot[]).map((slot) => roleNames[slot]).filter((name, index, names) => Boolean(name) && names.indexOf(name) === index),
    [roleNames]
  );
  const afygTimelinePanelControl: AfygTimelinePanelControl = {
    collapsed: afygTimelineCollapsed,
    onToggleCollapsed: toggleAfygTimelineCollapsed,
    onPointerDown: beginAfygTimelinePanelDrag,
    onPointerMove: moveAfygTimelinePanelDrag,
    onPointerUp: endAfygTimelinePanelDrag,
    onPointerCancel: endAfygTimelinePanelDrag,
    onWheel: changeAfygTimelineLaneHeight
  };
  const afygTimelineLocked = wsState?.locked?.timeline === true;
  const enhancedTimelineEditor = isValidElement(timelineEditor)
    ? cloneElement(timelineEditor as ReactElement<{ onSelectionChange?: (stepIds: string[]) => void; onPeriodSelectionChange?: (period: ComboPeriod | null) => void; videoCompactMode?: boolean; videoLaneHeight?: number; hideInspector?: boolean; zoom?: number; onZoomChange?: (value: number) => void; timelinePanelControl?: AfygTimelinePanelControl; playheadControl?: AfygPlayheadControl; readOnly?: boolean }>, {
        onSelectionChange: setSelectedStepIds,
        onPeriodSelectionChange: setSelectedPeriod,
        videoCompactMode: true,
        videoLaneHeight: afygTimelineLaneHeight,
        zoom: afygTimelineZoom,
        onZoomChange: setAfygTimelineZoom,
        timelinePanelControl: afygTimelinePanelControl,
        playheadControl,
        hideInspector: true,
        readOnly: afygTimelineLocked
      })
    : timelineEditor;
  const hostedTimelineStyle = hostedTimelineLayout ? (() => {
    const height = afygTimelineCollapsed ? 52 : afygTimelineHeight || hostedTimelineLayout.height;
    const bottom = hostedTimelineLayout.top + hostedTimelineLayout.height;
    const sidebarOverlap = Math.max(0, afygSidebarOverlayRight - hostedTimelineLayout.left);
    return {
      left: hostedTimelineLayout.left,
      top: bottom - height,
      width: hostedTimelineLayout.width,
      height,
      clipPath: sidebarOverlap > 0 ? `inset(0 0 0 ${sidebarOverlap}px)` : 'inset(0)',
      transition: 'clip-path .18s ease'
    } as CSSProperties;
  })() : undefined;
  const iframeViewportRect = iframeRef.current?.getBoundingClientRect();
  const pagePlayheadStyle = hostedTimelineLayout && hostedPlayheadLeft !== null && damagePlayheadRange && iframeViewportRect
    ? {
        left: hostedTimelineLayout.left + hostedPlayheadLeft,
        top: iframeViewportRect.top + damagePlayheadRange.top,
        height: Math.max(0, hostedTimelineLayout.top + hostedTimelineLayout.height - iframeViewportRect.top - damagePlayheadRange.top)
      } as CSSProperties
    : undefined;

  useEffect(() => {
    const slot = selectedStep?.characterSlot ?? 1;
    const character = roleNames[slot] || teamCharacters[0] || '';
    setDirectCharacter(character);
  }, [roleNames, selectedStep, teamCharacters]);

  function warningText(warning: NonNullable<typeof result>['report']['warnings'][number]): string {
    if (warning.code === 'character-four-omitted') return text('AFYG 当前固定为三人队，角色 4 的操作已从本次导出中略过。', 'AFYG currently uses fixed three-character teams, so Character 4 operations are omitted.');
    if (warning.code === 'timeline-truncated') return text(`AFYG 时间轴上限为 ${warning.detail} 秒，超出范围的操作或结束时间已被截断。`, `The AFYG timeline is limited to ${warning.detail} seconds. Later operations or the ending were truncated.`);
    if (warning.code === 'unknown-moves') return text(`以下自定义招式没有内置 AFYG 映射：${warning.detail}。`, `These custom actions have no built-in AFYG mapping: ${warning.detail}.`);
    if (warning.code === 'character-name-missing') return text(`角色 ${warning.detail} 没有可供 AFYG 识别的正式名称。`, `Character ${warning.detail} does not have an official name AFYG can resolve.`);
    return text('操作时间轴已转换，但伤害命中不会自动猜测；请在 AFYG 中绑定具体技能命中。', 'Operation timing is converted, but damage hits are not guessed. Bind exact skill hits in AFYG.');
  }

  function requestAfygBridge(action: string, payload: Record<string, unknown> = {}): Promise<AfygBridgeResponse> {
    if (!desktopBridgeExpected) return Promise.reject(new Error('bridge-unavailable'));
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) return Promise.reject(new Error('frame-unavailable'));
    const requestId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `wwcombo-afyg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingBridgeRequestsRef.current.delete(requestId);
        reject(new Error('bridge-timeout'));
      }, 4000);
      pendingBridgeRequestsRef.current.set(requestId, { resolve, reject, timer });
      targetWindow.postMessage({
        type: 'wwcombo:afyg-bridge-request',
        version: 1,
        requestId,
        action,
        ...payload
      }, new URL(AFYG_EMBED_URL).origin);
    });
  }

  function requestAfygTool(tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) return Promise.reject(new Error('frame-unavailable'));
    const requestId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `wwcombo-afyg-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingToolRequestsRef.current.delete(requestId);
        reject(new Error(`tool-timeout:${tool}`));
      }, tool === 'replace_timeline' ? 15000 : 8000);
      pendingToolRequestsRef.current.set(requestId, { resolve, reject, timer });
      targetWindow.postMessage({
        type: 'wwcombo:afyg-ws-downstream',
        version: 1,
        event: 'message',
        data: { type: 'exec', id: requestId, tool, args }
      }, new URL(frameSrc).origin);
    });
  }

  async function readSelectedDamageBinding(): Promise<{ skillHits?: unknown; nonDirectEntries?: unknown }> {
    if (desktopBridgeExpected && injectedBridgeStatus === 'ready') {
      const response = await requestAfygBridge('get-block-damage-binding', {
        projectId: activeAfygProjectId,
        blockId: selectedOperationId
      });
      return response.binding && typeof response.binding === 'object'
        ? response.binding as { skillHits?: unknown; nonDirectEntries?: unknown }
        : {};
    }
    const value = await requestAfygTool('get_block_damage_binding', { blockId: selectedOperationId });
    return value && typeof value === 'object' ? value as { skillHits?: unknown; nonDirectEntries?: unknown } : {};
  }

  async function loadDirectBinding() {
    if (!selectedOperationId || !directCharacter) return;
    setBindingBusy(true);
    setBindingError('');
    try {
      const [bindingValue, skillsValue] = await Promise.all([
        readSelectedDamageBinding(),
        requestAfygTool('get_char_skills', { character: directCharacter })
      ]);
      const binding = bindingValue && typeof bindingValue === 'object' ? bindingValue as { skillHits?: unknown } : {};
      setSkillBindings(Array.isArray(binding.skillHits) ? binding.skillHits as AfygSkillBinding[] : []);
      setSkillOptions(Array.isArray(skillsValue) ? skillsValue as AfygSkillOption[] : []);
    } catch (error) {
      setBindingError(error instanceof Error && error.message.startsWith('tool-unavailable:')
        ? text('当前 AFYG 版本尚未提供宿主伤害编辑接口，请先更新 AFYG 插件。', 'This AFYG build does not provide the hosted damage editor yet. Update the AFYG plugin first.')
        : text('读取直伤绑定失败，请确认当前工程已同步且排轴未锁定。', 'Could not read direct-damage bindings. Make sure the project is synced and the timeline is unlocked.'));
    } finally {
      setBindingBusy(false);
    }
  }

  async function loadEffectsBinding() {
    if (!selectedOperationId) return;
    nonDirectDirtyRef.current = false;
    setBindingBusy(true);
    setBindingError('');
    try {
      const [bindingValue, optionsValue] = await Promise.all([
        readSelectedDamageBinding(),
        requestAfygTool('get_non_direct_options')
      ]);
      const binding = bindingValue && typeof bindingValue === 'object' ? bindingValue as { nonDirectEntries?: unknown } : {};
      const options = optionsValue && typeof optionsValue === 'object' ? optionsValue as { options?: unknown } : {};
      setNonDirectBindings(Array.isArray(binding.nonDirectEntries) ? binding.nonDirectEntries as AfygNonDirectBinding[] : []);
      setNonDirectOptions(Array.isArray(options.options) ? options.options as AfygNonDirectOption[] : []);
    } catch (error) {
      setBindingError(error instanceof Error && error.message.startsWith('tool-unavailable:')
        ? text('当前 AFYG 版本尚未提供宿主伤害编辑接口，请先更新 AFYG 插件。', 'This AFYG build does not provide the hosted damage editor yet. Update the AFYG plugin first.')
        : text('读取效应与处决绑定失败，请确认当前工程已同步且排轴未锁定。', 'Could not read effect/execution bindings. Make sure the project is synced and the timeline is unlocked.'));
    } finally {
      setBindingBusy(false);
    }
  }

  useEffect(() => {
    if (!adapterOpen || !selectedOperationReady) return;
    if (adapterTab === 'direct') void loadDirectBinding();
    else void loadEffectsBinding();
  }, [adapterOpen, adapterTab, directCharacter, selectedOperationId, selectedOperationReady, wsConnected]);

  useEffect(() => {
    setBindingFocusIndex(0);
  }, [adapterTab, directCharacter, selectedOperationId]);

  useEffect(() => {
    const labels = document.querySelectorAll<HTMLElement>('.afyg-adapter-drawer .afyg-binding-list > label');
    labels.forEach((label, index) => label.classList.toggle('keyboard-focused', index === bindingFocusIndex));
  }, [adapterTab, bindingFocusIndex, directCharacter, nonDirectOptions, selectedOperationId, skillOptions]);

  useEffect(() => {
    if (!nonDirectDirtyRef.current || adapterTab !== 'effects' || !selectedOperationReady) return;
    nonDirectDirtyRef.current = false;
    persistEffectsBinding(nonDirectBindings);
  }, [adapterTab, nonDirectBindings, selectedOperationReady, selectedOperationId]);

  function queueBindingSave(task: () => Promise<void>): Promise<void> {
    bindingSaveQueueRef.current = bindingSaveQueueRef.current
      .catch(() => undefined)
      .then(task);
    return bindingSaveQueueRef.current;
  }

  function persistDirectBinding(nextBindings: AfygSkillBinding[]) {
    if (!selectedOperationId) return;
    setBindingSaving(true);
    setBindingError('');
    void queueBindingSave(async () => {
      await requestAfygTool('bind_damage_to_block', {
        blockId: selectedOperationId,
        hits: nextBindings.map((binding) => ({
          character: binding.character,
          hitName: binding.hitName,
          hits: binding.hits ?? 1
        }))
      });
    }).catch(() => {
      setBindingError(text('保存直伤绑定失败。', 'Could not save direct-damage bindings.'));
    }).finally(() => setBindingSaving(false));
  }

  function toggleSkillBinding(option: AfygSkillOption, checked: boolean) {
    const matches = (binding: AfygSkillBinding) => binding.character === directCharacter && binding.hitName === option.hitName;
    const next = checked
      ? skillBindings.some(matches) ? skillBindings : [...skillBindings, { ...option, character: directCharacter, hits: 1 }]
      : skillBindings.filter((binding) => !matches(binding));
    setSkillBindings(next);
    persistDirectBinding(next);
  }

  function setSkillHitCount(option: AfygSkillOption, count: number) {
    const next = skillBindings.map((binding) =>
      binding.character === directCharacter && binding.hitName === option.hitName
        ? { ...binding, hits: Math.max(1, Math.min(99, Math.round(count) || 1)) }
        : binding
    );
    setSkillBindings(next);
    persistDirectBinding(next);
  }

  async function applyDirectBinding() {
    if (!selectedOperationId) return;
    setBindingBusy(true);
    setBindingError('');
    try {
      await requestAfygTool('bind_damage_to_block', {
        blockId: selectedOperationId,
        hits: skillBindings.map((binding) => ({
          character: binding.character,
          hitName: binding.hitName,
          hits: binding.hits ?? 1
        }))
      });
    } catch {
      setBindingError(text('保存直伤绑定失败，AFYG 原数据未被覆盖。', 'Could not save direct-damage bindings. Existing AFYG data was not overwritten.'));
    } finally {
      setBindingBusy(false);
    }
  }

  function persistEffectsBinding(nextBindings: AfygNonDirectBinding[]) {
    if (!selectedOperationId) return;
    setBindingSaving(true);
    setBindingError('');
    void queueBindingSave(async () => {
      await requestAfygTool('bind_non_direct_to_block', {
        blockId: selectedOperationId,
        entries: nextBindings.map((binding) => ({
          name: binding.name,
          layers: binding.layers ?? 0,
          responders: binding.responders ?? []
        }))
      });
    }).catch(() => {
      setBindingError(text('保存效应 / 处决绑定失败。', 'Could not save effect/execution bindings.'));
    }).finally(() => setBindingSaving(false));
  }

  useEffect(() => {
    if (!adapterOpen || !selectedOperationReady) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const options = adapterTab === 'direct' ? skillOptions : nonDirectOptions;
      if (!options.length) return;
      const key = event.key.toLowerCase();
      if (key === 'q' || key === 'e') {
        const delta = key === 'q' ? -1 : 1;
        const nextIndex = Math.max(0, Math.min(options.length - 1, bindingFocusIndex + delta));
        setBindingFocusIndex(nextIndex);
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLElement>(`.afyg-binding-list > label:nth-child(${nextIndex + 1})`)?.scrollIntoView({ block: 'nearest' });
        });
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (event.code !== 'Space') return;
      const option = options[bindingFocusIndex];
      if (!option) return;
      if (adapterTab === 'direct') {
        const skill = option as AfygSkillOption;
        const checked = skillBindings.some((binding) => binding.character === directCharacter && binding.hitName === skill.hitName);
        toggleSkillBinding(skill, !checked);
      } else {
        const nonDirect = option as AfygNonDirectOption;
        const checked = nonDirectBindings.some((binding) => binding.name === nonDirect.name);
        toggleNonDirectBinding(nonDirect, !checked);
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [adapterOpen, adapterTab, bindingFocusIndex, directCharacter, nonDirectBindings, nonDirectOptions, selectedOperationReady, skillBindings, skillOptions]);

  function toggleNonDirectBinding(option: AfygNonDirectOption, checked: boolean) {
    nonDirectDirtyRef.current = true;
    setNonDirectBindings((current) => {
      if (!checked) return current.filter((binding) => binding.name !== option.name);
      if (current.some((binding) => binding.name === option.name)) return current;
      return [...current, {
        name: option.name,
        category: option.category,
        layers: option.category === '效应' ? 1 : 0,
        responders: option.category === '效应' || !directCharacter ? undefined : [directCharacter]
      }];
    });
  }

  function patchNonDirectBinding(name: string, patch: Partial<AfygNonDirectBinding>) {
    nonDirectDirtyRef.current = true;
    setNonDirectBindings((current) => current.map((binding) => binding.name === name ? { ...binding, ...patch } : binding));
  }

  async function applyEffectsBinding() {
    if (!selectedOperationId) return;
    setBindingBusy(true);
    setBindingError('');
    try {
      await requestAfygTool('bind_non_direct_to_block', {
        blockId: selectedOperationId,
        entries: nonDirectBindings.map((binding) => ({
          name: binding.name,
          layers: binding.layers ?? 0,
          responders: binding.responders ?? []
        }))
      });
    } catch {
      setBindingError(text('保存效应与处决绑定失败，AFYG 原数据未被覆盖。', 'Could not save effect/execution bindings. Existing AFYG data was not overwritten.'));
    } finally {
      setBindingBusy(false);
    }
  }

  function applyAfygProject(project: Record<string, unknown>, projectId: string) {
    const team = project.team as Array<Record<string, unknown>>;
    setRoleNames((current) => ({
      ...current,
      1: typeof team[0]?.character === 'string' ? team[0].character : current[1],
      2: typeof team[1]?.character === 'string' ? team[1].character : current[2],
      3: typeof team[2]?.character === 'string' ? team[2].character : current[3]
    }));
    setBaseProject(project);
    setActiveAfygProjectId(projectId);
    const operationIds = projectTimelineOperationIds(project);
    setRemoteOperationIds(operationIds);
    const expectedOperationIds = (chart?.steps ?? [])
      .filter((step) => (step.characterSlot ?? 1) <= 3)
      .map((step) => afygOperationIdForStepId(step.id));
    setSyncedProjectId((current) => expectedOperationIds.length > 0 && expectedOperationIds.every((id) => operationIds.has(id))
      ? projectId
      : current === projectId ? '' : current);
    setBaseProjectError('');
    setBridgeStatus('ready');
  }

  async function readCurrentAfygProject(): Promise<{ projectId: string; project: Record<string, unknown> } | null> {
    setBridgeStatus('checking');
    setBaseProjectError('');
    try {
      if (desktopBridgeExpected && injectedBridgeStatus === 'ready') {
        const response = await requestAfygBridge('get-current-project');
        if (typeof response.projectId !== 'string' || !response.projectId) throw new Error('no-active-project');
        const project = projectFromAfygFile(response.project);
        applyAfygProject(project, response.projectId);
        return { projectId: response.projectId, project };
      }
      if (wsConnected) {
        const value = await requestAfygTool('get_project_state');
        if (!value || typeof value !== 'object' || (value as { hasProject?: boolean }).hasProject !== true) {
          throw new Error('no-active-project');
        }
        const state = value as { id?: unknown; name?: unknown; team?: unknown };
        const projectId = typeof state.id === 'string' ? state.id : '';
        if (!projectId || !Array.isArray(state.team)) throw new Error('no-active-project');
        const project: Record<string, unknown> = {
          id: projectId,
          name: typeof state.name === 'string' ? state.name : '',
          team: state.team.map((slot) => {
            const record = slot && typeof slot === 'object' ? slot as Record<string, unknown> : {};
            return {
              character: typeof record.character === 'string' ? record.character : null,
              weapon: typeof record.weapon === 'string' ? record.weapon : null
            };
          })
        };
        applyAfygProject(project, projectId);
        return { projectId, project };
      }
      throw new Error('bridge-unavailable');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setBaseProject(null);
      setActiveAfygProjectId('');
      setRemoteOperationIds(new Set());
      if (code === 'no-active-project') {
        setBridgeStatus('no-project');
        setBaseProjectError(text('请先在 AFYG 中新建或点选一个工程。', 'Create or select a project in AFYG first.'));
      } else {
        setBridgeStatus('unavailable');
        setBaseProjectError(text('无法直接读取 AFYG 当前工程，可暂时使用下方 JSON 后备方式。', 'The current AFYG project could not be read directly. Use the JSON fallback below.'));
      }
      return null;
    }
  }

  async function exportProject() {
    if (!chart || !result || !baseProject || exporting) return;
    setExporting(true);
    try {
      await onExport(`${safeFileName(chart.title)}.afyg.json`, new TextEncoder().encode(JSON.stringify(result.file, null, 2)));
    } finally {
      setExporting(false);
    }
  }

  function sendFallbackCopyToEmbeddedAfyg() {
    if (!result || !baseProject) return;
    setFrameStatus('loading');
    setFrameSrc(`${buildAfygDirectImportUrl(result.file)}&wwcombo=${Date.now()}`);
    setAdapterOpen(false);
  }

  async function syncCurrentAfygProject(): Promise<boolean> {
    if (!chart || syncing) return false;
    setSyncing(true);
    setBaseProjectError('');
    try {
      const current = await readCurrentAfygProject();
      if (!current) return false;
      const syncResult = buildAfygProject({
        chart,
        style,
        roleNames: {
          1: typeof (current.project.team as Array<Record<string, unknown>>)[0]?.character === 'string'
            ? String((current.project.team as Array<Record<string, unknown>>)[0].character)
            : roleNames[1],
          2: typeof (current.project.team as Array<Record<string, unknown>>)[1]?.character === 'string'
            ? String((current.project.team as Array<Record<string, unknown>>)[1].character)
            : roleNames[2],
          3: typeof (current.project.team as Array<Record<string, unknown>>)[2]?.character === 'string'
            ? String((current.project.team as Array<Record<string, unknown>>)[2].character)
            : roleNames[3],
          4: roleNames[4]
        },
        operationKeyOverrides: operationKeys,
        baseProject: current.project
      });
      if (desktopBridgeExpected && injectedBridgeStatus === 'ready') {
        await requestAfygBridge('replace-current-timeline', {
          projectId: current.projectId,
          timeline: syncResult.timeline
        });
      } else if (wsConnected && wsTools.includes('replace_timeline')) {
        await requestAfygTool('replace_timeline', {
          projectId: current.projectId,
          timeline: syncResult.timeline,
          preserveDamageBindings: true
        });
        if (wsTools.includes('switch_view')) {
          await requestAfygTool('switch_view', { view: 'timeline' }).catch(() => undefined);
        }
      } else {
        await requestAfygBridge('replace-current-timeline', {
          projectId: current.projectId,
          timeline: syncResult.timeline
        });
      }
      setBridgeStatus('ready');
      setSyncedProjectId(current.projectId);
      setRemoteOperationIds(new Set(syncResult.timeline.opBlocks.map((block) => block.id)));
      return true;
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setBridgeStatus(code === 'active-project-changed' || code === 'no-active-project' ? 'no-project' : 'unavailable');
      setBaseProjectError(code === 'active-project-changed'
        ? text('AFYG 当前工程在同步时发生了切换，请重新点一次同步。', 'The active AFYG project changed during sync. Sync again.')
        : text('同步失败，AFYG 原工程没有被修改。请重试，或使用 JSON 后备方式。', 'Sync failed and the original AFYG project was not changed. Retry or use the JSON fallback.'));
      return false;
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (entryLoadDecision !== 'confirmed' || !chart || entrySyncCompletedRef.current || syncing || frameStatus !== 'ready') return;
    const remoteProjectId = typeof wsState?.project?.id === 'string' ? wsState.project.id : '';
    const directReady = desktopBridgeExpected && injectedBridgeStatus === 'ready';
    const remoteReady = wsConnected && wsTools.includes('replace_timeline');
    if (!directReady && !remoteReady) {
      setEntryLoadStatus('waiting');
      return;
    }
    const attemptKey = remoteProjectId || activeAfygProjectId || (directReady && bridgeStatus !== 'no-project' ? 'desktop-probe' : '');
    if (!attemptKey || entrySyncAttemptKeyRef.current === attemptKey) {
      if (!entrySyncCompletedRef.current) setEntryLoadStatus('waiting');
      return;
    }
    entrySyncAttemptKeyRef.current = attemptKey;
    setEntryLoadStatus('syncing');
    void syncCurrentAfygProject().then((loaded) => {
      if (loaded) {
        entrySyncCompletedRef.current = true;
        setEntryLoadStatus('done');
        return;
      }
      setEntryLoadStatus(remoteProjectId ? 'error' : 'waiting');
    });
  }, [activeAfygProjectId, bridgeStatus, chart, desktopBridgeExpected, entryLoadDecision, frameStatus, injectedBridgeStatus, syncing, wsConnected, wsState, wsTools]);

  async function ensureSelectedOperationInAfyg() {
    if (entryLoadDecision !== 'confirmed' || entryLoadStatus !== 'done' || !chart || !baseProject || !activeAfygProjectId || !selectedStep || selectedStep.characterSlot === 4) return;
    const operationId = afygOperationIdForStepId(selectedStep.id);
    if (remoteOperationIds.has(operationId) || ensuringOperationIdRef.current === operationId) return;
    ensuringOperationIdRef.current = operationId;
    setBindingBusy(true);
    setBindingError('');
    try {
      const next = buildAfygProject({
        chart,
        style,
        roleNames,
        operationKeyOverrides: operationKeys,
        baseProject
      });
      if (!next.timeline.opBlocks.some((block) => block.id === operationId)) return;
      if (desktopBridgeExpected && injectedBridgeStatus === 'ready') {
        await requestAfygBridge('replace-current-timeline', {
          projectId: activeAfygProjectId,
          timeline: next.timeline
        });
      } else if (wsConnected && wsTools.includes('replace_timeline')) {
        await requestAfygTool('replace_timeline', {
          projectId: activeAfygProjectId,
          timeline: next.timeline,
          preserveDamageBindings: true
        });
      } else {
        return;
      }
      setRemoteOperationIds(new Set(next.timeline.opBlocks.map((block) => block.id)));
      setSyncedProjectId(activeAfygProjectId);
      setBaseProject((current) => {
        if (!current) return current;
        const phases = current.phases && typeof current.phases === 'object' && !Array.isArray(current.phases)
          ? current.phases as Record<string, unknown>
          : {};
        const timelinePhase = phases.timeline && typeof phases.timeline === 'object' && !Array.isArray(phases.timeline)
          ? phases.timeline as Record<string, unknown>
          : {};
        return {
          ...current,
          phases: {
            ...phases,
            timeline: { ...timelinePhase, data: next.timeline }
          }
        };
      });
    } catch {
      setBindingError(text('当前招式块尚未同步到 AFYG。', 'The selected action block could not be synced to AFYG yet.'));
    } finally {
      ensuringOperationIdRef.current = '';
      setBindingBusy(false);
    }
  }

  useEffect(() => {
    if (entryLoadDecision !== 'confirmed' || entryLoadStatus !== 'done' || !adapterOpen || !selectedStep || selectedOperationReady) return;
    void ensureSelectedOperationInAfyg();
  }, [activeAfygProjectId, adapterOpen, adapterTab, baseProject, chart, entryLoadDecision, entryLoadStatus, injectedBridgeStatus, operationKeys, remoteOperationIds, roleNames, selectedOperationId, selectedOperationReady, selectedStep, style, wsConnected, wsTools]);

  useEffect(() => {
    if (entryLoadDecision !== 'confirmed' || entryLoadStatus !== 'done' || !chart || !baseProject || !wsConnected || !wsTools.includes('replace_timeline')) return;
    if (!syncedProjectId || syncedProjectId !== activeAfygProjectId) return;
    if (autoSyncTimerRef.current !== null) window.clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = window.setTimeout(() => {
      const remoteProjectId = typeof wsState?.project?.id === 'string' ? wsState.project.id : '';
      if (remoteProjectId !== syncedProjectId) return;
      const next = buildAfygProject({
        chart,
        style,
        roleNames,
        operationKeyOverrides: operationKeys,
        baseProject
      });
      void requestAfygTool('replace_timeline', {
        projectId: syncedProjectId,
        timeline: next.timeline,
        preserveDamageBindings: true
      }).catch(() => {
        setSyncedProjectId('');
        setBindingError(text('时间轴自动同步已暂停，请重新进入工坊并确认加载连段。', 'Timeline auto-sync was paused. Re-enter Workshop and confirm loading the combo.'));
      });
    }, 320);
    return () => {
      if (autoSyncTimerRef.current !== null) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  }, [activeAfygProjectId, baseProject, chart?.updatedAt, entryLoadDecision, entryLoadStatus, operationKeys, roleNames, style, syncedProjectId, wsConnected, wsState?.project?.id, wsTools]);

  async function loadBaseProject(file: File | null) {
    if (!file) return;
    setBaseProjectError('');
    try {
      if (file.size > 1024 * 1024) throw new Error('file-too-large');
      const project = projectFromAfygFile(JSON.parse(await file.text()));
      const team = project.team as Array<Record<string, unknown>>;
      setRoleNames((current) => ({
        ...current,
        1: typeof team[0]?.character === 'string' ? team[0].character : current[1],
        2: typeof team[1]?.character === 'string' ? team[1].character : current[2],
        3: typeof team[2]?.character === 'string' ? team[2].character : current[3]
      }));
      setBaseProject(project);
    } catch (error) {
      setBaseProject(null);
      const code = error instanceof Error ? error.message : '';
      setBaseProjectError(code === 'file-too-large'
        ? text('AFYG 工程文件不能超过 1 MB。', 'The AFYG project file must be no larger than 1 MB.')
        : code === 'team-missing'
          ? text('该文件没有包含队伍配置，请在 AFYG 导出时勾选队伍。', 'This file has no team configuration. Include Team when exporting from AFYG.')
          : text('无法识别该 AFYG 工程文件。', 'This AFYG project file could not be recognized.'));
    } finally {
      if (baseProjectInputRef.current) baseProjectInputRef.current.value = '';
    }
  }

  function reloadEmbeddedAfyg() {
    setFrameStatus('loading');
    setInjectedBridgeStatus('waiting');
    setWebsocketBridgeReady(false);
    setFrameSrc((current) => {
      const source = current.replace(/[?&]wwcombo_reload=\d+$/u, '');
      return `${source}${source.includes('#') || source.includes('?') ? '&' : '?'}wwcombo_reload=${Date.now()}`;
    });
  }

  function boundedPosition(x: number, y: number, width: number, height: number): FloatingPosition {
    const page = pageRef.current?.getBoundingClientRect();
    if (!page) return { x, y };
    return {
      x: Math.max(8, Math.min(x, page.width - width - 8)),
      y: Math.max(8, Math.min(y, page.height - height - 8))
    };
  }

  function beginOrbDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const page = pageRef.current?.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    if (!page) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    orbDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left - page.left,
      originY: rect.top - page.top,
      width: rect.width,
      height: rect.height,
      moved: false
    };
  }

  function moveOrbDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = orbDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    drag.moved = true;
    event.preventDefault();
    setOrbPosition(boundedPosition(drag.originX + deltaX, drag.originY + deltaY, drag.width, drag.height));
  }

  function endOrbDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = orbDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressOrbClickRef.current = drag.moved;
    orbDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggleAdapter() {
    if (suppressOrbClickRef.current) {
      suppressOrbClickRef.current = false;
      return;
    }
    setAdapterOpen((open) => !open);
  }

  function beginDrawerDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const page = pageRef.current?.getBoundingClientRect();
    const drawer = event.currentTarget.closest('.afyg-adapter-drawer')?.getBoundingClientRect();
    if (!page || !drawer) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: drawer.left - page.left,
      originY: drawer.top - page.top,
      width: drawer.width,
      height: drawer.height,
      moved: false
    };
  }

  function moveDrawerDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = drawerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 3) return;
    drag.moved = true;
    event.preventDefault();
    setDrawerPosition(boundedPosition(drag.originX + deltaX, drag.originY + deltaY, drag.width, drag.height));
  }

  function endDrawerDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = drawerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressDrawerCollapseRef.current = drag.moved && event.type === 'pointerup';
    drawerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function collapseAdapterFromHandle() {
    if (suppressDrawerCollapseRef.current) {
      suppressDrawerCollapseRef.current = false;
      return;
    }
    setAdapterOpen(false);
  }

  function afygTimelineDefaultHeight() {
    const hostHeight = hostedTimelineLayout?.height ?? 0;
    return Math.round(Math.max(AFYG_TIMELINE_MIN_HEIGHT, hostHeight || 0));
  }

  function beginAfygTimelinePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startHeight = afygTimelineHeight || afygTimelineDefaultHeight();
    const drag: AfygTimelinePanelDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startHeight,
      startZoom: afygTimelineZoom,
      axis: null,
      moved: false,
      longPressTimer: null,
      resetTriggered: false
    };
    drag.longPressTimer = window.setTimeout(() => {
      if (afygTimelinePanelDragRef.current !== drag || drag.moved) return;
      drag.moved = true;
      drag.resetTriggered = true;
      afygTimelineSuppressClickRef.current = true;
      setAfygTimelineCollapsed(false);
      setAfygTimelineHeight(afygTimelineDefaultHeight());
      setAfygTimelineZoom(DEFAULT_AFYG_TIMELINE_ZOOM);
      setAfygTimelineLaneHeight(DEFAULT_AFYG_TIMELINE_LANE_HEIGHT);
    }, AFYG_TIMELINE_RESET_HOLD_MS);
    afygTimelinePanelDragRef.current = drag;
    afygTimelineSuppressClickRef.current = false;
  }

  function moveAfygTimelinePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = afygTimelinePanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.resetTriggered) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.axis && Math.hypot(deltaX, deltaY) < AFYG_TIMELINE_DRAG_THRESHOLD) return;
    if (drag.longPressTimer !== null) {
      window.clearTimeout(drag.longPressTimer);
      drag.longPressTimer = null;
    }
    if (!drag.axis) drag.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'horizontal' : 'vertical';
    drag.moved = true;
    afygTimelineSuppressClickRef.current = true;
    event.preventDefault();
    if (drag.axis === 'horizontal') setAfygTimelineZoom(clampAfyg(drag.startZoom + deltaX / 900, 0.05, 1.6));
    else {
      const maxHeight = Math.max(AFYG_TIMELINE_MIN_HEIGHT, Math.round((pageRef.current?.clientHeight ?? window.innerHeight) * 0.72));
      setAfygTimelineHeight(Math.round(clampAfyg(drag.startHeight - deltaY, AFYG_TIMELINE_MIN_HEIGHT, maxHeight)));
    }
  }

  function endAfygTimelinePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = afygTimelinePanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer);
    afygTimelinePanelDragRef.current = null;
    afygTimelineSuppressClickRef.current = drag.moved;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggleAfygTimelineCollapsed() {
    if (afygTimelineSuppressClickRef.current) {
      afygTimelineSuppressClickRef.current = false;
      return;
    }
    setAfygTimelineCollapsed((collapsed) => !collapsed);
  }

  function changeAfygTimelineLaneHeight(event: ReactWheelEvent<HTMLButtonElement>) {
    if (afygTimelineCollapsed || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY > 0 ? -AFYG_TIMELINE_LANE_STEP : AFYG_TIMELINE_LANE_STEP;
    setAfygTimelineLaneHeight((current) => Math.round(clampAfyg(current + delta, 24, 64)));
  }

  const orbStyle = orbPosition ? { left: orbPosition.x, top: orbPosition.y, right: 'auto', bottom: 'auto' } as CSSProperties : undefined;
  const drawerStyle = drawerPosition ? { left: drawerPosition.x, top: drawerPosition.y, right: 'auto' } as CSSProperties : undefined;

  return <div ref={pageRef} className="afyg-page" data-trainer-capture-suspend="true">
    <EmbeddedBrowserExitControl onExit={onExit} />
    {entryLoadDecision === 'pending' && chart && <div className="afyg-entry-load-backdrop" role="presentation"><section className="afyg-entry-load-dialog" role="dialog" aria-modal="true" aria-labelledby="afyg-entry-load-title"><Send size={28} /><strong id="afyg-entry-load-title">{text(`是否加载“${chart.title}”连段？`, `Load the combo “${chart.title}”?`)}</strong><span>{text('确认后会在椰果工具箱工程就绪时加载一次当前时间轴。', 'After confirmation, the current timeline will be loaded once when the Yeguo Toolbox project is ready.')}</span><div><button type="button" onClick={() => { setEntryLoadDecision('cancelled'); setEntryLoadStatus('idle'); }}>{text('取消', 'Cancel')}</button><button type="button" className="primary" onClick={() => { entrySyncAttemptKeyRef.current = ''; entrySyncCompletedRef.current = false; setEntryLoadStatus('waiting'); setEntryLoadDecision('confirmed'); }}>{text('确认加载', 'Load')}</button></div></section></div>}
    {frameStatus === 'loading' && entryLoadDecision !== 'pending' && <div className="afyg-frame-loading">{text('正在开启椰果工具箱……', 'Opening Yeguo Toolbox...')}</div>}
    {entryLoadDecision === 'confirmed' && frameStatus === 'ready' && entryLoadStatus !== 'done' && <div className={`afyg-entry-load-status ${entryLoadStatus }` } role="status">{entryLoadStatus === 'syncing' ? text(`正在加载“${chart?.title ?? ''}”连段……`, `Loading “${chart?.title ?? ''}”...`) : entryLoadStatus === 'error' ? text('连段加载失败；切换 AFYG 工程后会自动重试。', 'The combo could not be loaded. It will retry after you switch AFYG projects.') : text('请在椰果工具箱中选择或新建工程，连段将自动加载。', 'Select or create a project in Yeguo Toolbox and the combo will load automatically.')}</div>}
    {frameStatus === 'error' && <div className="afyg-frame-error" role="alert">
      <TriangleAlert size={24} />
      <strong>{text('AFYG 网站加载失败', 'AFYG could not be loaded')}</strong>
      <span>{text('请检查网络连接后重试，或使用系统浏览器打开。', 'Check your connection and retry, or open AFYG in your browser.')}</span>
      <div>
        <button type="button" onClick={reloadEmbeddedAfyg}><RefreshCw size={16} />{text('重试', 'Retry')}</button>
        <button type="button" onClick={() => onOpenTool(frameSrc)}><ExternalLink size={16} />{text('浏览器打开', 'Open in Browser')}</button>
      </div>
    </div>}
    <iframe
      key={frameSrc}
      ref={iframeRef}
      className="afyg-frame"
      src={frameSrc}
      title="AFYG"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
      onLoad={() => {
        setFrameStatus('ready');
        setInjectedBridgeStatus('waiting');
        setWebsocketBridgeReady(false);
        if (desktopBridgeExpected && bridgeStatus === 'unavailable') setBridgeStatus('idle');
        postAfygTheme();
      }}
      onError={() => setFrameStatus('error')}
    />

    {pagePlayheadStyle && <div className="afyg-page-playhead-line" style={pagePlayheadStyle} aria-hidden="true" />}
    {hostedTimelineLayout && chart && <section
      className={`afyg-hosted-timeline ${afygTimelineCollapsed ? 'is-collapsed' : ''}`}
      style={hostedTimelineStyle}
      aria-label={text('WWCombo 时间轴', 'WWCombo Timeline')}
    >{afygTimelineLocked && !afygTimelineCollapsed && <div className="afyg-timeline-lock-watermark" aria-hidden="true"><div><Lock /><span>{text('已锁定', 'Locked')}</span></div></div>}<div className={`video-timeline-compact ${afygTimelineCollapsed ? 'afyg-timeline-collapsed' : ''}`}>{enhancedTimelineEditor}</div></section>}

    <button
      className={`afyg-import-orb ${adapterOpen ? 'drawer-open' : ''}`}
      type="button"
      title={text('WWCombo 时间轴工具；拖动可移动', 'WWCombo timeline tool; drag to move')}
      aria-label={text('WWCombo 时间轴工具', 'WWCombo Timeline Tool')}
      aria-expanded={adapterOpen}
      style={orbStyle}
      onPointerDown={beginOrbDrag}
      onPointerMove={moveOrbDrag}
      onPointerUp={endOrbDrag}
      onPointerCancel={endOrbDrag}
      onClick={toggleAdapter}
    ><Send size={23} /></button>

    {adapterOpen && <aside className="afyg-adapter-drawer" aria-label={text('WWCombo 时间轴工具', 'WWCombo Timeline Tool')} style={drawerStyle}>
      <nav className="afyg-adapter-tabs" aria-label={text('AFYG 工具分类', 'AFYG tool categories')}>
        <button
          className="afyg-adapter-collapse"
          type="button"
          title={text('拖动工具框；点击收起', 'Drag tool panel; click to collapse')}
          aria-label={text('拖动工具框；点击收起', 'Drag tool panel; click to collapse')}
          onPointerDown={beginDrawerDrag}
          onPointerMove={moveDrawerDrag}
          onPointerUp={endDrawerDrag}
          onPointerCancel={endDrawerDrag}
          onClick={collapseAdapterFromHandle}
        ><Send size={21} /></button>
        <button type="button" className={adapterTab === 'direct' ? 'active' : ''} onClick={() => setAdapterTab('direct')}><Calculator size={15} /><span className="afyg-tab-label">{text('直伤', 'Direct')}</span></button>
        <button type="button" className={adapterTab === 'effects' ? 'active' : ''} onClick={() => setAdapterTab('effects')}><Sparkles size={15} /><span className="afyg-tab-label">{text('效应处决', 'Effects')}</span></button>
      </nav>

      <div className="afyg-adapter-scroll">
          <section className="afyg-binding-target">
            <div className="afyg-section-heading"><h3>{adapterTab === 'direct' ? text('编辑直伤', 'Edit Direct Damage') : text('绑定效应 / 处决', 'Bind Effects / Execution')}</h3><p>{text('先在下方 WWCombo 时间轴中选中一个招式块。这里的修改会写入上方 AFYG 伤害绑定区。', 'Select one action block in the WWCombo timeline below. Changes here are written to the AFYG damage-binding area above.')}</p></div>
            {!selectedStep && <div className="afyg-binding-empty"><Link2 size={18} />{text('当前未选中单个招式块', 'No single action block is selected')}</div>}
            {selectedStep && !selectedOperationReady && <div className="afyg-binding-empty"><TriangleAlert size={18} />{text('当前招式尚未加载到 AFYG；请重新进入工坊并确认加载连段。', 'This action is not loaded in AFYG. Re-enter Workshop and confirm loading the combo.')}</div>}
            {selectedStep && selectedOperationReady && <div className="afyg-binding-current"><span>{text('当前招式', 'Selected action')}</span><strong>{selectedStep.label || selectedStep.moveId}</strong><small>{selectedOperationId}</small></div>}
          </section>

          {selectedStep && selectedOperationReady && adapterTab === 'direct' && <section className="afyg-binding-editor" aria-busy={bindingBusy || bindingSaving}>
            {bindingBusy && <div className="afyg-binding-empty"><RefreshCw className="spin" size={17} />{text('正在读取……', 'Loading...')}</div>}
            {!bindingBusy && <div className="afyg-binding-list">{skillOptions.map((option) => {
              const binding = skillBindings.find((item) => item.character === directCharacter && item.hitName === option.hitName);
              return <label key={`${option.skillType}:${option.hitName}`}><input type="checkbox" checked={Boolean(binding)} onChange={(event) => toggleSkillBinding(option, event.target.checked)} /><span><strong>{option.hitName}</strong><small>{option.skillType} · {option.ratio}</small></span>{binding && <input className="afyg-hit-count" type="number" min={1} max={99} value={binding.hits ?? 1} title={text('命中次数', 'Hit count')} onChange={(event) => setSkillHitCount(option, Number(event.target.value))} />}</label>})}</div>}
          </section>}

          {selectedStep && selectedOperationReady && adapterTab === 'effects' && <section className="afyg-binding-editor" aria-busy={bindingBusy || bindingSaving}>
            {bindingBusy && <div className="afyg-binding-empty"><RefreshCw className="spin" size={17} />{text('正在读取……', 'Loading...')}</div>}
            {!bindingBusy && <div className="afyg-binding-list">{nonDirectOptions.map((option) => {
              const binding = nonDirectBindings.find((item) => item.name === option.name);
              return <label key={option.name}><input type="checkbox" checked={Boolean(binding)} onChange={(event) => toggleNonDirectBinding(option, event.target.checked)} /><span><strong>{option.name}</strong><small>{option.category}{option.element ? ` · ${option.element}` : ''}</small></span>{binding && option.category === '效应' && <input className="afyg-hit-count" type="number" min={1} max={Math.max(1, option.maxLayers)} value={binding.layers ?? 1} title={text('层数', 'Layers')} onChange={(event) => patchNonDirectBinding(option.name, { layers: Math.max(1, Math.min(option.maxLayers, Number(event.target.value) || 1)) })} />}{binding && option.category !== '效应' && <select value={binding.responders?.[0] ?? directCharacter} onChange={(event) => patchNonDirectBinding(option.name, { responders: event.target.value ? [event.target.value] : [] })}>{teamCharacters.map((character) => <option key={character} value={character}>{character}</option>)}</select>}</label>})}</div>}
          </section>}
          {bindingError && <div className="afyg-base-project-error"><TriangleAlert size={16} />{bindingError}</div>}
      </div>

      <footer className="afyg-adapter-actions binding-hidden">
        {adapterTab === 'direct' ? <button type="button" className="afyg-primary" disabled={!selectedOperationReady || bindingBusy} onClick={() => void applyDirectBinding()}><CheckCircle2 size={17} />{text('保存直伤绑定', 'Save Direct Damage')}</button> : <button type="button" className="afyg-primary" disabled={!selectedOperationReady || bindingBusy} onClick={() => void applyEffectsBinding()}><CheckCircle2 size={17} />{text('保存效应 / 处决', 'Save Effects / Execution')}</button>}
      </footer>
    </aside>}
  </div>;
}
