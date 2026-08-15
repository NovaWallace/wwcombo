(() => {
  const AFYG_ORIGINS = new Set([
    'https://wuwa-hpyg-tool.200503.xyz',
    'https://wuwa-afyg-tool.200503.xyz'
  ]);
  const LOCAL_AFYG_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(window.location.origin);
  if ((!AFYG_ORIGINS.has(window.location.origin) && !LOCAL_AFYG_ORIGIN) || window === window.parent) return;

  const REQUEST_TYPE = 'wwcombo:afyg-bridge-request';
  const RESPONSE_TYPE = 'wwcombo:afyg-bridge-response';
  const WS_UPSTREAM_TYPE = 'wwcombo:afyg-ws-upstream';
  const WS_DOWNSTREAM_TYPE = 'wwcombo:afyg-ws-downstream';
  const HOST_LAYOUT_TYPE = 'wwcombo:afyg-host-layout';
  const HOST_SPLIT_TYPE = 'wwcombo:afyg-host-split';
  const AI_ASSISTANT_LAYOUT_TYPE = 'wwcombo:afyg-ai-assistant-layout';
  const SIDEBAR_OVERLAY_TYPE = 'wwcombo:afyg-sidebar-overlay';
  const BRIDGE_STATUS_TYPE = 'wwcombo:afyg-bridge-status';
  const DB_NAME = 'wuwa-v1';
  const DB_VERSION = 1;
  const STORE_NAME = 'cache';
  const PROJECTS_KEY = 'projects';
  const ACTIVE_KEY = 'project-active';
  const THEME_KEY = 'theme-active';
  const REOPEN_KEY = 'wwcombo:afyg-reopen-project';
  const CALC_VIEW_KEY = 'wuwa-afyg:calc-view';
  const CALC_VIEW_DEFAULT_MIGRATION_KEY = 'wwcombo:calc-view-default-v1';

  try {
    const workshopHosted = new URLSearchParams(window.location.hash.replace(/^#/u, '')).get('timeline_host') === 'wwcombo';
    if (workshopHosted && localStorage.getItem(CALC_VIEW_DEFAULT_MIGRATION_KEY) !== '1') {
      localStorage.setItem(CALC_VIEW_KEY, 'dropdown');
      localStorage.setItem(CALC_VIEW_DEFAULT_MIGRATION_KEY, '1');
    }
  } catch {
    // Storage may be unavailable in hardened WebView contexts; AFYG's own default is still dropdown.
  }

  const virtualSockets = new Set();

  function isLoopbackWebSocket(value) {
    try {
      const url = new URL(String(value));
      return (url.protocol === 'ws:' || url.protocol === 'wss:')
        && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    } catch {
      return false;
    }
  }

  function installHostWebSocketBridge() {
    const NativeWebSocket = window.WebSocket;

    class HostBridgeWebSocket extends EventTarget {
      constructor(url, protocols) {
        super();
        if (!isLoopbackWebSocket(url)) {
          return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
        }
        this.url = String(url);
        this.readyState = HostBridgeWebSocket.CONNECTING;
        this.bufferedAmount = 0;
        this.extensions = '';
        this.protocol = '';
        this.binaryType = 'blob';
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        virtualSockets.add(this);
        queueMicrotask(() => {
          if (this.readyState !== HostBridgeWebSocket.CONNECTING) return;
          this.readyState = HostBridgeWebSocket.OPEN;
          this.emit(new Event('open'));
          window.parent.postMessage({ type: WS_UPSTREAM_TYPE, version: 1, event: 'open', url: this.url }, '*');
        });
      }

      emit(event) {
        this.dispatchEvent(event);
        const handler = this[`on${event.type}`];
        if (typeof handler === 'function') handler.call(this, event);
      }

      send(data) {
        if (this.readyState !== HostBridgeWebSocket.OPEN) throw new DOMException('WebSocket is not open', 'InvalidStateError');
        if (typeof data !== 'string') throw new TypeError('WWCombo AFYG bridge only accepts UTF-8 text frames');
        window.parent.postMessage({ type: WS_UPSTREAM_TYPE, version: 1, event: 'message', url: this.url, data }, '*');
      }

      close(code = 1000, reason = '') {
        if (this.readyState === HostBridgeWebSocket.CLOSED || this.readyState === HostBridgeWebSocket.CLOSING) return;
        this.readyState = HostBridgeWebSocket.CLOSING;
        virtualSockets.delete(this);
        window.parent.postMessage({ type: WS_UPSTREAM_TYPE, version: 1, event: 'close', url: this.url }, '*');
        queueMicrotask(() => {
          this.readyState = HostBridgeWebSocket.CLOSED;
          this.emit(new CloseEvent('close', { code, reason, wasClean: true }));
        });
      }

      receive(message) {
        if (this.readyState !== HostBridgeWebSocket.OPEN) return;
        const data = typeof message === 'string' ? message : JSON.stringify(message);
        this.emit(new MessageEvent('message', { data }));
      }
    }

    HostBridgeWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
    HostBridgeWebSocket.OPEN = NativeWebSocket.OPEN;
    HostBridgeWebSocket.CLOSING = NativeWebSocket.CLOSING;
    HostBridgeWebSocket.CLOSED = NativeWebSocket.CLOSED;
    Object.defineProperty(window, 'WebSocket', { configurable: true, writable: true, value: HostBridgeWebSocket });
  }

  let websocketBridgeReady = false;
  let websocketBridgeError = '';
  try {
    installHostWebSocketBridge();
    websocketBridgeReady = true;
  } catch (error) {
    websocketBridgeError = error instanceof Error ? error.message : String(error);
  }

  function reportBridgeStatus() {
    window.parent.postMessage({
      type: BRIDGE_STATUS_TYPE,
      version: 1,
      ready: true,
      websocketReady: websocketBridgeReady,
      websocketError: websocketBridgeError
    }, '*');
  }

  reportBridgeStatus();
  window.addEventListener('DOMContentLoaded', reportBridgeStatus, { once: true });

  let observedTimelineHost = null;
  let observedDamageScroller = null;
  let requestedDamageScrollRatio = null;
  let timelineGeometry = {
    pixelsPerMs: 0.06,
    renderTotalMs: 0,
    scrollLeft: 0,
    viewportOffsetX: 0,
    contentOffset: 112,
    anchorsMs: []
  };
  let timelineScrollTarget = null;
  let timelineScrollSuppressUntil = 0;
  let damageScrollUserIntentUntil = 0;
  let damageScrollPointerActive = false;
  let damageScrollReportFrame = 0;
  let damageScrollSettleTimer = 0;
  let damageScrollSequence = 0;
  let lastTimelineScrollSequence = 0;
  let damageScrollInputAt = 0;
  let observedDamageTimeline = null;
  let damageSeekLine = null;
  let damageSeekState = { enabled: false, playbackMs: 0, viewportX: null };
  let damageSeekDragging = false;
  let damageSeekClientX = 0;
  let damageSeekEdgeFrame = 0;
  let layoutFrame = 0;
  let legacyDamageHeightOverride = null;
  let observedProjectSidebar = null;
  let projectSidebarResizeHandle = null;
  let projectSidebarPlaceholder = null;
  const hostResizeObserver = new ResizeObserver(() => scheduleHostLayout());
  const damageResizeObserver = new ResizeObserver(() => applyTimelineScrollRatio());

  function ensureWorkshopHostStyle() {
    if (document.querySelector('style[data-wwcombo-workshop-host-style]')) return;
    const style = document.createElement('style');
    style.dataset.wwcomboWorkshopHostStyle = 'true';
    style.textContent = `
      [data-wwcombo-legacy-timeline="true"] { overflow: hidden !important; }
      [data-wwcombo-legacy-timeline="true"]:not([data-wwcombo-original-editor="true"]) > [data-wwcombo-legacy-damage-scroller="true"] {
        flex: 0 0 var(--wwcombo-legacy-damage-height, 190px) !important;
        width: 100% !important;
        height: var(--wwcombo-legacy-damage-height, 190px) !important;
        min-height: var(--wwcombo-legacy-damage-height, 190px) !important;
        overflow: auto !important;
      }
      [data-wwcombo-legacy-timeline="true"]:not([data-wwcombo-original-editor="true"]) [data-wwcombo-legacy-content="true"] { height: 100% !important; min-height: 100% !important; }
      [data-wwcombo-legacy-timeline="true"]:not([data-wwcombo-original-editor="true"]) [data-wwcombo-legacy-content="true"] > :not([data-wwcombo-legacy-track-stack="true"]) { display: none !important; }
      [data-wwcombo-legacy-timeline="true"]:not([data-wwcombo-original-editor="true"]) [data-wwcombo-legacy-track-stack="true"] > :not([data-wwcombo-legacy-damage-track="true"]) { display: none !important; }
      [data-wwcombo-legacy-timeline="true"]:not([data-wwcombo-original-editor="true"]) [data-wwcombo-legacy-track-stack="true"] > [data-wwcombo-legacy-damage-track="true"] {
        display: block !important;
        flex: 1 1 100% !important;
        width: 100% !important;
        height: 100% !important;
        min-height: 100% !important;
      }
      [data-wwcombo-legacy-timeline="true"][data-wwcombo-original-editor="true"] [data-wwcombo-legacy-track-stack="true"] > [data-wwcombo-legacy-damage-track="true"] {
        order: 1 !important;
      }
      [data-wwcombo-legacy-timeline="true"][data-wwcombo-original-editor="true"] [data-wwcombo-legacy-track-stack="true"] {
        box-sizing: border-box !important;
        padding-bottom: 52px !important;
      }
      [data-wwcombo-legacy-timeline="true"][data-wwcombo-original-editor="true"] [data-wwcombo-legacy-track-stack="true"] > [data-track-index]:not([data-wwcombo-legacy-damage-track="true"]) {
        order: 2 !important;
      }
      button[data-wwcombo-combo-import="true"] { flex: 0 0 auto; }
    `;
    (document.head || document.documentElement).append(style);
  }

  function ensureProjectSidebarStyle() {
    if (document.querySelector('style[data-wwcombo-auto-sidebar-style]')) return;
    const style = document.createElement('style');
    style.dataset.wwcomboAutoSidebarStyle = 'true';
    style.textContent = `
      [data-wwcombo-sidebar-root="true"] { position: relative !important; }
      [data-wwcombo-sidebar-placeholder="true"] {
        width: 52px !important;
        min-width: 52px !important;
        flex: 0 0 52px !important;
        height: 100% !important;
        pointer-events: none !important;
      }
      aside[data-wwcombo-auto-sidebar="true"] {
        position: absolute !important;
        inset: 0 auto 0 0 !important;
        width: 52px !important;
        min-width: 52px !important;
        overflow: hidden !important;
        z-index: 45 !important;
        transition: width .18s ease, min-width .18s ease, box-shadow .18s ease !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:hover,
      aside[data-wwcombo-auto-sidebar="true"]:focus-within {
        width: var(--wwcombo-sidebar-expanded-width, 240px) !important;
        min-width: var(--wwcombo-sidebar-expanded-width, 240px) !important;
        box-shadow: 8px 0 22px rgba(0, 0, 0, .24) !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) span,
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="truncate"] {
        display: none !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="gap-2"] {
        gap: 0 !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="px-4"],
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="px-3"],
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="px-2"] {
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="items-center"] {
        justify-content: center !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) > div:first-child > div,
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) > div:first-child > button {
        display: none !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="pl-6"] {
        display: none !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) > div:nth-child(2) > div > div:not(:first-child) {
        display: none !important;
      }
      [data-wwcombo-sidebar-resizer="true"] {
        width: 0 !important;
        min-width: 0 !important;
        flex-basis: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  function findProjectSidebar() {
    const labelledHandle = document.querySelector('button[aria-label="调整侧栏宽度"], button[aria-label*="sidebar" i]');
    const labelledSidebar = labelledHandle?.previousElementSibling;
    if (labelledHandle instanceof HTMLButtonElement && labelledSidebar instanceof HTMLElement) {
      return labelledSidebar;
    }
    return Array.from(document.querySelectorAll('aside')).find((candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      const handle = candidate.nextElementSibling;
      if (!(handle instanceof HTMLButtonElement)) return false;
      const label = handle.getAttribute('aria-label') || '';
      return label.includes('侧栏') || label.includes('sidebar') || handle.classList.contains('cursor-col-resize');
    }) || null;
  }

  function reportProjectSidebarOverlay(expanded) {
    const sidebar = observedProjectSidebar;
    if (!(sidebar instanceof HTMLElement)) return;
    const configuredWidth = Number.parseFloat(sidebar.style.getPropertyValue('--wwcombo-sidebar-expanded-width'));
    window.parent.postMessage({
      type: SIDEBAR_OVERLAY_TYPE,
      version: 1,
      expanded,
      right: expanded && Number.isFinite(configuredWidth)
        ? sidebar.getBoundingClientRect().left + configuredWidth
        : sidebar.getBoundingClientRect().left + 52
    }, '*');
  }

  function onProjectSidebarPointerEnter() {
    reportProjectSidebarOverlay(true);
  }

  function onProjectSidebarPointerLeave() {
    reportProjectSidebarOverlay(false);
  }

  function bindProjectSidebar() {
    const sidebar = findProjectSidebar();
    if (sidebar === observedProjectSidebar) return;
    observedProjectSidebar?.removeEventListener('pointerenter', onProjectSidebarPointerEnter);
    observedProjectSidebar?.removeEventListener('pointerleave', onProjectSidebarPointerLeave);
    observedProjectSidebar?.removeAttribute('data-wwcombo-auto-sidebar');
    projectSidebarResizeHandle?.removeAttribute('data-wwcombo-sidebar-resizer');
    projectSidebarPlaceholder?.remove();
    observedProjectSidebar = sidebar;
    projectSidebarResizeHandle = null;
    projectSidebarPlaceholder = null;
    if (!(sidebar instanceof HTMLElement)) return;
    const handle = sidebar.nextElementSibling;
    if (!(handle instanceof HTMLButtonElement)) return;
    ensureProjectSidebarStyle();
    const root = sidebar.parentElement;
    if (!(root instanceof HTMLElement)) return;
    const expandedWidth = Math.min(400, Math.max(200, sidebar.getBoundingClientRect().width || 240));
    sidebar.style.setProperty('--wwcombo-sidebar-expanded-width', `${expandedWidth}px`);
    const placeholder = document.createElement('div');
    placeholder.dataset.wwcomboSidebarPlaceholder = 'true';
    placeholder.setAttribute('aria-hidden', 'true');
    root.dataset.wwcomboSidebarRoot = 'true';
    root.insertBefore(placeholder, sidebar);
    sidebar.dataset.wwcomboAutoSidebar = 'true';
    handle.dataset.wwcomboSidebarResizer = 'true';
    projectSidebarResizeHandle = handle;
    projectSidebarPlaceholder = placeholder;
    sidebar.addEventListener('pointerenter', onProjectSidebarPointerEnter);
    sidebar.addEventListener('pointerleave', onProjectSidebarPointerLeave);
    reportProjectSidebarOverlay(false);
  }

  function timelineHostModeEnabled() {
    return new URLSearchParams(window.location.hash.replace(/^#/u, '')).get('timeline_host') === 'wwcombo';
  }

  function findLegacyDamageTrack(root) {
    if (!(root instanceof HTMLElement)) return null;
    return Array.from(root.querySelectorAll('[data-track-index]')).find((track) => {
      if (!(track instanceof HTMLElement)) return false;
      const copy = track.textContent?.replace(/\s+/gu, ' ').trim() || '';
      if (copy.includes('伤害绑定') || copy.includes('Damage Binding')) return true;
      return Array.from(track.children).some((child) => child instanceof HTMLElement
        && child.classList.contains('pointer-events-auto')
        && child.classList.contains('theme-scrollbar')
        && child.classList.contains('overflow-y-auto'));
    }) || null;
  }

  function prepareLegacyTimelineHost(host, damageHeight) {
    if (!(host instanceof HTMLElement)) return;
    ensureWorkshopHostStyle();
    const scroller = Array.from(host.children).find((element) => element instanceof HTMLElement && element.classList.contains('theme-scrollbar'));
    const content = scroller instanceof HTMLElement
      ? Array.from(scroller.children).find((element) => element instanceof HTMLElement && element.classList.contains('relative'))
      : null;
    const effectTrack = findLegacyDamageTrack(content);
    const trackStack = effectTrack?.parentElement;
    if (!(scroller instanceof HTMLElement) || !(content instanceof HTMLElement) || !(effectTrack instanceof HTMLElement) || !(trackStack instanceof HTMLElement)) return;
    if (host.dataset.wwcomboLegacyTimeline !== 'true') host.dataset.wwcomboLegacyTimeline = 'true';
    const heightValue = `${Math.round(damageHeight)}px`;
    if (host.style.getPropertyValue('--wwcombo-legacy-damage-height') !== heightValue) host.style.setProperty('--wwcombo-legacy-damage-height', heightValue);
    if (scroller.dataset.wwcomboLegacyDamageScroller !== 'true') scroller.dataset.wwcomboLegacyDamageScroller = 'true';
    if (content.dataset.wwcomboLegacyContent !== 'true') content.dataset.wwcomboLegacyContent = 'true';
    if (trackStack.dataset.wwcomboLegacyTrackStack !== 'true') trackStack.dataset.wwcomboLegacyTrackStack = 'true';
    if (effectTrack.dataset.wwcomboLegacyDamageTrack !== 'true') effectTrack.dataset.wwcomboLegacyDamageTrack = 'true';
  }

  function ensureComboImportButton() {
    if (!timelineHostModeEnabled()) return;
    const toolbar = document.querySelector('[role="toolbar"]');
    if (!(toolbar instanceof HTMLElement)) return;
    const damageButton = Array.from(toolbar.querySelectorAll('button')).find((button) => {
      const copy = `${button.getAttribute('title') || ''} ${button.textContent || ''}`;
      return copy.includes('查看所有伤害') || copy.includes('View all damage');
    });
    const current = toolbar.querySelector('button[data-wwcombo-combo-import="true"]');
    if (!(damageButton instanceof HTMLButtonElement)) {
      current?.remove();
      return;
    }
    const button = current instanceof HTMLButtonElement ? current : damageButton.cloneNode(true);
    if (!(button instanceof HTMLButtonElement)) return;
    if (!(current instanceof HTMLButtonElement)) {
      button.dataset.wwcomboComboImport = 'true';
      button.disabled = false;
      button.title = '从连段谱导入';
      button.setAttribute('aria-label', '从连段谱导入');
      const label = button.querySelector('span');
      if (label instanceof HTMLElement) label.textContent = '从连段谱导入';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({ type: 'wwcombo:afyg-open-combo-import', version: 1 }, '*');
      });
    }
    const lockButton = Array.from(toolbar.querySelectorAll('button')).find((candidate) => {
      const copy = `${candidate.getAttribute('title') || ''} ${candidate.textContent || ''}`.trim();
      return copy === '锁定' || copy === '解锁' || copy === 'Lock' || copy === 'Unlock';
    });
    if (lockButton instanceof HTMLButtonElement) {
      if (lockButton.previousElementSibling !== button) lockButton.before(button);
    } else if (toolbar.lastElementChild !== button) {
      toolbar.append(button);
    }
  }

  function resolveAiAssistant() {
    const known = document.querySelector('[data-wwcombo-ai-assistant="true"]');
    if (known instanceof HTMLElement) return known;
    const trigger = Array.from(document.querySelectorAll('[title]')).find((element) => {
      const title = element.getAttribute('title') || '';
      return title.includes('AI 助手') || title.includes('AI Assistant');
    });
    const root = trigger?.closest('.fixed');
    if (!(root instanceof HTMLElement)) return null;
    root.dataset.wwcomboAiAssistant = 'true';
    return root;
  }

  function reportAiAssistantLayout() {
    const assistant = resolveAiAssistant();
    if (!(assistant instanceof HTMLElement)) {
      window.parent.postMessage({ type: AI_ASSISTANT_LAYOUT_TYPE, version: 1, visible: false }, '*');
      return;
    }
    const usesDefaultCorner = assistant.classList.contains('right-4') && assistant.classList.contains('bottom-4')
      && !assistant.style.left && !assistant.style.top;
    if (usesDefaultCorner && assistant.style.bottom !== '92px') {
      assistant.style.setProperty('bottom', '92px');
    }
    const rect = assistant.getBoundingClientRect();
    const style = getComputedStyle(assistant);
    window.parent.postMessage({
      type: AI_ASSISTANT_LAYOUT_TYPE,
      version: 1,
      visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }, '*');
  }

  function findLegacyTimelineRoot() {
    if (!timelineHostModeEnabled()) return null;
    return Array.from(document.querySelectorAll('div')).find((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const classes = element.className;
      if (typeof classes !== 'string'
        || !classes.includes('theme-glass-surface')
        || !classes.includes('h-full')
        || !classes.includes('flex-col')
        || !classes.includes('--theme-timeline-bg')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= 320 && rect.height >= 320 && Boolean(findLegacyDamageTrack(element));
    }) || null;
  }

  function resolveTimelineHost() {
    const explicitHost = document.querySelector('[data-wwcombo-timeline-host]');
    if (explicitHost instanceof HTMLElement) return { element: explicitHost, legacy: false };
    const legacyHost = findLegacyTimelineRoot();
    return legacyHost instanceof HTMLElement ? { element: legacyHost, legacy: true } : null;
  }

  function resolveDamageHost() {
    const explicitHost = document.querySelector('[data-wwcombo-damage-host]');
    if (explicitHost instanceof HTMLElement) return explicitHost;
    return findLegacyTimelineRoot();
  }

  function resolveDamageScroller() {
    const host = resolveDamageHost();
    const scroller = host?.querySelector('.theme-scrollbar');
    return scroller instanceof HTMLElement ? scroller : null;
  }

  function damageTimelineContent(scroller) {
    const timeline = scroller?.querySelector('.relative');
    return timeline instanceof HTMLElement ? timeline : null;
  }

  function damageTimeFromClientX(clientX, timeline) {
    const rect = timeline.getBoundingClientRect();
    const position = clientX - rect.left - 80 - 48;
    return Math.max(0, Math.round(position / Math.max(0.0001, timelineGeometry.pixelsPerMs)));
  }

  function sendDamageSeek(clientX) {
    if (!damageSeekState.enabled || !(observedDamageTimeline instanceof HTMLElement)) return;
    const timeMs = damageTimeFromClientX(clientX, observedDamageTimeline);
    window.parent.postMessage({ type: 'wwcombo:afyg-damage-seek', version: 1, timeMs }, '*');
    damageSeekState.playbackMs = timeMs;
    damageSeekState.viewportX = null;
    updateDamageSeekLine();
  }

  function clearDamageSeekDrag() {
    if (!damageSeekDragging) return;
    damageSeekDragging = false;
    if (damageSeekEdgeFrame) cancelAnimationFrame(damageSeekEdgeFrame);
    damageSeekEdgeFrame = 0;
    window.removeEventListener('pointermove', onDamageSeekPointerMove);
    window.removeEventListener('pointerup', clearDamageSeekDrag);
    window.removeEventListener('pointercancel', clearDamageSeekDrag);
  }

  function onDamageSeekPointerMove(event) {
    if (!damageSeekDragging) return;
    event.preventDefault();
    damageSeekClientX = event.clientX;
    sendDamageSeek(event.clientX);
  }

  function runDamageSeekEdgeScroll() {
    damageSeekEdgeFrame = 0;
    if (!damageSeekDragging || !(observedDamageScroller instanceof HTMLElement)) return;
    const rect = observedDamageScroller.getBoundingClientRect();
    const edgeSize = Math.min(96, Math.max(48, rect.width * 0.12));
    let delta = 0;
    if (damageSeekClientX < rect.left + edgeSize) {
      const strength = Math.min(1, Math.max(0, (rect.left + edgeSize - damageSeekClientX) / edgeSize));
      delta = -Math.max(2, strength * 18);
    } else if (damageSeekClientX > rect.right - edgeSize) {
      const strength = Math.min(1, Math.max(0, (damageSeekClientX - (rect.right - edgeSize)) / edgeSize));
      delta = Math.max(2, strength * 18);
    }
    if (delta !== 0) {
      markDamageScrollIntent();
      const maxScrollLeft = Math.max(0, observedDamageScroller.scrollWidth - observedDamageScroller.clientWidth);
      const previousScrollLeft = observedDamageScroller.scrollLeft;
      observedDamageScroller.scrollLeft = Math.min(maxScrollLeft, Math.max(0, previousScrollLeft + delta));
      if (Math.abs(observedDamageScroller.scrollLeft - previousScrollLeft) > 0.1) sendDamageSeek(damageSeekClientX);
    }
    damageSeekEdgeFrame = requestAnimationFrame(runDamageSeekEdgeScroll);
  }

  function isDamageBlockTarget(target) {
    let current = target instanceof HTMLElement ? target : null;
    while (current && current !== observedDamageTimeline) {
      if (current.parentElement?.classList.contains('z-[2]')) return true;
      current = current.parentElement;
    }
    return false;
  }

  function onDamageSeekPointerDown(event) {
    if (!damageSeekState.enabled || event.button !== 0 || !(observedDamageTimeline instanceof HTMLElement)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (isDamageBlockTarget(target) || target?.closest('.sticky, input, textarea, select, button, a, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    damageSeekDragging = true;
    damageSeekClientX = event.clientX;
    sendDamageSeek(event.clientX);
    damageSeekEdgeFrame = requestAnimationFrame(runDamageSeekEdgeScroll);
    window.addEventListener('pointermove', onDamageSeekPointerMove, { passive: false });
    window.addEventListener('pointerup', clearDamageSeekDrag, { once: true });
    window.addEventListener('pointercancel', clearDamageSeekDrag, { once: true });
  }

  function updateDamageSeekLine() {
    if (!damageSeekLine) return;
    const timelineRect = observedDamageTimeline?.getBoundingClientRect();
    // The parent draws one shared line across both surfaces. Keeping a second
    // iframe line creates a visible split while either scroller is moving.
    if (damageSeekLine.style.display !== 'none') damageSeekLine.style.display = 'none';
    window.parent.postMessage({
      type: 'wwcombo:afyg-damage-playhead-layout',
      version: 1,
      rect: timelineRect ? { top: timelineRect.top, bottom: timelineRect.bottom } : null
    }, '*');
  }

  function bindDamageSeekLine(timeline) {
    if (timeline === observedDamageTimeline) {
      updateDamageSeekLine();
      return;
    }
    observedDamageTimeline?.removeEventListener('pointerdown', onDamageSeekPointerDown, true);
    clearDamageSeekDrag();
    damageSeekLine?.remove();
    observedDamageTimeline = timeline;
    damageSeekLine = null;
    if (!(timeline instanceof HTMLElement)) return;
    damageSeekLine = document.createElement('div');
    damageSeekLine.dataset.wwcomboDamageSeekLine = 'true';
    damageSeekLine.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;z-index:8;transform:translateX(-1px);background:#fff;box-shadow:0 0 7px rgba(255,255,255,.88),0 0 0 1px rgba(0,0,0,.78);pointer-events:none;';
    timeline.append(damageSeekLine);
    timeline.addEventListener('pointerdown', onDamageSeekPointerDown, true);
    updateDamageSeekLine();
  }

  function damageScrollRatio(scroller) {
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    return maxScrollLeft > 0 ? Math.min(1, Math.max(0, scroller.scrollLeft / maxScrollLeft)) : 0;
  }

  function damageTimelineLayers(timeline) {
    const legacyEffectTrack = timeline?.querySelector('[data-wwcombo-legacy-damage-track="true"]') || findLegacyDamageTrack(timeline);
    if (legacyEffectTrack instanceof HTMLElement) {
      const damageViewport = Array.from(legacyEffectTrack.children).find((element) => element instanceof HTMLElement && element.querySelector(':scope > .relative'));
      const damageLayer = damageViewport instanceof HTMLElement ? damageViewport.querySelector(':scope > .relative') : null;
      return {
        referenceLayer: null,
        damageLayer: damageLayer instanceof HTMLElement ? damageLayer : null,
        legacy: true
      };
    }
    const layers = Array.from(timeline?.children || []).filter((element) => element instanceof HTMLElement);
    return {
      referenceLayer: layers.find((element) => typeof element.className === 'string' && element.className.includes('z-[1]')) || null,
      damageLayer: layers.find((element) => typeof element.className === 'string' && element.className.includes('z-[2]')) || null,
      legacy: false
    };
  }

  function damageTranslatePosition(transform) {
    const match = String(transform || '').match(/^translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)\s*(.*)$/u);
    if (!match) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, suffix: match[3].trim() };
  }

  function applyDamageTimelineScale() {
    const timeline = damageTimelineContent(observedDamageScroller);
    if (!(timeline instanceof HTMLElement)) return;
    const desiredWidth = Math.ceil(80 + 48 + timelineGeometry.renderTotalMs * timelineGeometry.pixelsPerMs + 160);
    if (timelineGeometry.renderTotalMs > 0 && timeline.style.width !== `${desiredWidth}px`) {
      timeline.style.width = `${desiredWidth}px`;
    }
    const { referenceLayer, damageLayer, legacy } = damageTimelineLayers(timeline);
    for (const layer of [referenceLayer, damageLayer]) {
      if (!(layer instanceof HTMLElement)) continue;
      if (layer.style.right) layer.style.removeProperty('right');
      if (layer.style.width) layer.style.removeProperty('width');
      if (layer.style.transform) layer.style.removeProperty('transform');
      if (layer.style.transformOrigin) layer.style.removeProperty('transform-origin');
    }
    if (referenceLayer instanceof HTMLElement) {
      for (const child of referenceLayer.children) {
        if (!(child instanceof HTMLElement)) continue;
        const currentLeft = Number.parseFloat(child.style.left);
        const appliedLeft = Number(child.dataset.wwcomboAppliedLeft);
        if (!child.dataset.wwcomboBaseLeft || (Number.isFinite(currentLeft) && Number.isFinite(appliedLeft) && Math.abs(currentLeft - appliedLeft) > 0.5)) {
          if (!Number.isFinite(currentLeft)) continue;
          child.dataset.wwcomboBaseLeft = String(currentLeft);
        }
        const baseLeft = Number(child.dataset.wwcomboBaseLeft);
        if (!Number.isFinite(baseLeft)) continue;
        const nextLeftValue = 48 + Math.max(0, (baseLeft - 48) / 0.06) * timelineGeometry.pixelsPerMs;
        child.dataset.wwcomboAppliedLeft = String(nextLeftValue);
        const nextLeft = `${nextLeftValue}px`;
        if (child.style.left !== nextLeft) child.style.left = nextLeft;
      }
    }
    if (damageLayer instanceof HTMLElement) {
      const baseAnchors = timelineGeometry.anchorsMs.map((timeMs) => ({ timeMs, baseLeft: 48 + timeMs * 0.06 }));
      for (const child of damageLayer.children) {
        if (!(child instanceof HTMLElement)) continue;
        const translated = legacy ? damageTranslatePosition(child.style.transform) : null;
        const positionMode = translated ? 'translate' : 'left';
        const currentLeft = translated?.x ?? Number.parseFloat(child.style.left);
        const appliedLeft = Number(child.dataset.wwcomboAppliedLeft);
        const appliedTop = Number(child.dataset.wwcomboAppliedTop);
        if (child.dataset.wwcomboPositionMode !== positionMode
          || !child.dataset.wwcomboBaseLeft
          || (Number.isFinite(currentLeft) && Number.isFinite(appliedLeft) && Math.abs(currentLeft - appliedLeft) > 0.5)
          || (translated && Number.isFinite(appliedTop) && Math.abs(translated.y - appliedTop) > 0.5)) {
          if (!Number.isFinite(currentLeft)) continue;
          child.dataset.wwcomboPositionMode = positionMode;
          child.dataset.wwcomboBaseLeft = String(currentLeft);
          if (translated) {
            child.dataset.wwcomboBaseTop = String(translated.y);
            child.dataset.wwcomboTransformSuffix = translated.suffix;
          }
        }
        if (translated
          && Number.isFinite(appliedLeft)
          && Math.abs(translated.x - appliedLeft) <= 0.5
          && (!Number.isFinite(appliedTop) || Math.abs(translated.y - appliedTop) <= 0.5)
          && translated.suffix !== (child.dataset.wwcomboTransformSuffix || '')) {
          child.dataset.wwcomboTransformSuffix = translated.suffix;
        }
        const baseLeft = Number(child.dataset.wwcomboBaseLeft);
        if (!Number.isFinite(baseLeft)) continue;
        const anchor = baseAnchors.reduce((nearest, candidate) => !nearest || Math.abs(candidate.baseLeft - baseLeft) < Math.abs(nearest.baseLeft - baseLeft) ? candidate : nearest, null);
        const fallbackTimeMs = Math.max(0, (baseLeft - 48) / 0.06);
        const nextLeftValue = 48 + (anchor?.timeMs ?? fallbackTimeMs) * timelineGeometry.pixelsPerMs;
        child.dataset.wwcomboAppliedLeft = String(nextLeftValue);
        if (positionMode === 'translate') {
          const baseTop = Number(child.dataset.wwcomboBaseTop);
          const suffix = child.dataset.wwcomboTransformSuffix || '';
          const nextTransform = `translate(${nextLeftValue}px, ${Number.isFinite(baseTop) ? baseTop : 0}px)${suffix ? ` ${suffix}` : ''}`;
          child.dataset.wwcomboAppliedTop = String(Number.isFinite(baseTop) ? baseTop : 0);
          if (child.style.left !== '0px') child.style.left = '0px';
          if (child.style.top !== '0px') child.style.top = '0px';
          if (child.style.transform !== nextTransform) child.style.transform = nextTransform;
        } else {
          const nextLeft = `${nextLeftValue}px`;
          if (child.style.left !== nextLeft) child.style.left = nextLeft;
        }
      }
    }
    updateDamageSeekLine();
  }

  function emitDamageScroll() {
    damageScrollReportFrame = 0;
    if (!(observedDamageScroller instanceof HTMLElement)) return;
    requestedDamageScrollRatio = damageScrollRatio(observedDamageScroller);
    const scrollerRect = observedDamageScroller.getBoundingClientRect();
    const viewportX = scrollerRect.left + 80 + 48 - observedDamageScroller.scrollLeft;
    timelineGeometry.scrollLeft = Math.max(0,
      timelineGeometry.viewportOffsetX + timelineGeometry.contentOffset - viewportX
    );
    damageScrollSequence += 1;
    window.parent.postMessage({
      type: 'wwcombo:afyg-damage-scroll',
      version: 1,
      source: 'damage',
      sequence: damageScrollSequence,
      inputAt: damageScrollInputAt,
      ratio: requestedDamageScrollRatio,
      viewportX
    }, '*');
  }

  function reportDamageScroll() {
    if (!(observedDamageScroller instanceof HTMLElement)) return;
    const now = performance.now();
    const hasUserIntent = damageScrollPointerActive || now <= damageScrollUserIntentUntil;
    if (timelineScrollTarget !== null && !hasUserIntent && now <= timelineScrollSuppressUntil) {
      if (Math.abs(observedDamageScroller.scrollLeft - timelineScrollTarget) > 0.25) {
        observedDamageScroller.scrollLeft = timelineScrollTarget;
      }
      return;
    }
    if (hasUserIntent) {
      damageScrollUserIntentUntil = now + 180;
      timelineScrollTarget = null;
      timelineScrollSuppressUntil = 0;
    } else if (timelineScrollTarget !== null && now > timelineScrollSuppressUntil) {
      timelineScrollTarget = null;
    }

    requestedDamageScrollRatio = damageScrollRatio(observedDamageScroller);
    const scrollerRect = observedDamageScroller.getBoundingClientRect();
    const viewportX = scrollerRect.left + 80 + 48 - observedDamageScroller.scrollLeft;
    timelineGeometry.scrollLeft = Math.max(0,
      timelineGeometry.viewportOffsetX + timelineGeometry.contentOffset - viewportX
    );
    if (!damageScrollReportFrame) damageScrollReportFrame = requestAnimationFrame(emitDamageScroll);
    if (damageScrollSettleTimer) clearTimeout(damageScrollSettleTimer);
    damageScrollSettleTimer = setTimeout(() => {
      damageScrollSettleTimer = 0;
      if (damageScrollReportFrame) cancelAnimationFrame(damageScrollReportFrame);
      emitDamageScroll();
    }, 100);
  }

  function markDamageScrollIntent() {
    damageScrollInputAt = Date.now();
    damageScrollUserIntentUntil = performance.now() + 220;
    timelineScrollTarget = null;
    timelineScrollSuppressUntil = 0;
  }

  function beginDamageScrollPointer() {
    damageScrollPointerActive = true;
    markDamageScrollIntent();
  }

  function endDamageScrollPointer() {
    damageScrollPointerActive = false;
    damageScrollUserIntentUntil = performance.now() + 180;
  }

  function applyTimelineScrollRatio() {
    if (!(observedDamageScroller instanceof HTMLElement) || requestedDamageScrollRatio === null) return;
    const maxScrollLeft = Math.max(0, observedDamageScroller.scrollWidth - observedDamageScroller.clientWidth);
    const scrollerRect = observedDamageScroller.getBoundingClientRect();
    const nextScrollLeft = Number.isFinite(timelineGeometry.scrollLeft)
      ? Math.min(maxScrollLeft, Math.max(0,
          timelineGeometry.scrollLeft
          + scrollerRect.left + 80 + 48
          - timelineGeometry.viewportOffsetX
          - timelineGeometry.contentOffset
        ))
      : requestedDamageScrollRatio * maxScrollLeft;
    timelineScrollTarget = nextScrollLeft;
    timelineScrollSuppressUntil = performance.now() + 160;
    if (Math.abs(observedDamageScroller.scrollLeft - nextScrollLeft) > 0.25) {
      observedDamageScroller.scrollLeft = nextScrollLeft;
    }
  }

  function bindDamageScroller() {
    const scroller = resolveDamageScroller();
    if (scroller === observedDamageScroller) {
      bindDamageSeekLine(damageTimelineContent(scroller));
      applyDamageTimelineScale();
      applyTimelineScrollRatio();
      return;
    }
    damageResizeObserver.disconnect();
    observedDamageScroller?.removeEventListener('scroll', reportDamageScroll);
    observedDamageScroller?.removeEventListener('wheel', markDamageScrollIntent);
    observedDamageScroller?.removeEventListener('pointerdown', beginDamageScrollPointer);
    observedDamageScroller?.removeEventListener('touchstart', markDamageScrollIntent);
    observedDamageScroller?.removeEventListener('keydown', markDamageScrollIntent);
    observedDamageScroller = scroller;
    if (!(scroller instanceof HTMLElement)) {
      bindDamageSeekLine(null);
      return;
    }
    scroller.addEventListener('wheel', markDamageScrollIntent, { passive: true });
    scroller.addEventListener('pointerdown', beginDamageScrollPointer, { passive: true });
    scroller.addEventListener('touchstart', markDamageScrollIntent, { passive: true });
    scroller.addEventListener('keydown', markDamageScrollIntent);
    scroller.addEventListener('scroll', reportDamageScroll, { passive: true });
    damageResizeObserver.observe(scroller);
    const content = scroller.querySelector('.relative');
    if (content instanceof HTMLElement) damageResizeObserver.observe(content);
    bindDamageSeekLine(damageTimelineContent(scroller));
    applyDamageTimelineScale();
    applyTimelineScrollRatio();
  }

  function reportHostLayout() {
    layoutFrame = 0;
    bindProjectSidebar();
    ensureComboImportButton();
    reportAiAssistantLayout();
    const resolvedHost = resolveTimelineHost();
    const host = resolvedHost?.element ?? null;
    if (host !== observedTimelineHost) {
      hostResizeObserver.disconnect();
      legacyDamageHeightOverride = null;
      observedTimelineHost = host;
      if (host instanceof HTMLElement) hostResizeObserver.observe(host);
    }
    if (!(host instanceof HTMLElement)) {
      bindDamageScroller();
      window.parent.postMessage({ type: HOST_LAYOUT_TYPE, version: 1, visible: false }, '*');
      return;
    }
    const rect = host.getBoundingClientRect();
    const style = getComputedStyle(host);
    const defaultLegacyDamageHeight = resolvedHost?.legacy
      ? Math.min(300, Math.max(190, rect.height * 0.3))
      : 0;
    const legacyDamageHeight = resolvedHost?.legacy && Number.isFinite(legacyDamageHeightOverride)
      ? Math.min(Math.max(0, rect.height - 52), Math.max(0, legacyDamageHeightOverride))
      : defaultLegacyDamageHeight;
    if (resolvedHost?.legacy) prepareLegacyTimelineHost(host, legacyDamageHeight);
    bindDamageScroller();
    window.parent.postMessage({
      type: HOST_LAYOUT_TYPE,
      version: 1,
      visible: rect.width > 0 && rect.height > legacyDamageHeight && style.display !== 'none' && style.visibility !== 'hidden',
      rect: {
        left: rect.left,
        top: rect.top + legacyDamageHeight,
        width: rect.width,
        height: rect.height - legacyDamageHeight,
        fullTop: rect.top,
        fullHeight: rect.height,
        defaultHeight: rect.height - defaultLegacyDamageHeight
      }
    }, '*');
  }

  function scheduleHostLayout() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(reportHostLayout);
  }

  const hostMutationObserver = new MutationObserver(scheduleHostLayout);
  hostMutationObserver.observe(document, { childList: true, subtree: true, attributes: true });
  window.addEventListener('resize', scheduleHostLayout);
  window.addEventListener('scroll', scheduleHostLayout, true);
  window.addEventListener('pointerup', endDamageScrollPointer, true);
  window.addEventListener('pointercancel', endDamageScrollPointer, true);
  scheduleHostLayout();

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (message?.type === 'wwcombo:afyg-theme' && message.version === 1) {
      void syncThemeFromHost(message.theme, message.appearanceMode).catch(() => undefined);
      return;
    }
    if (message?.type === HOST_SPLIT_TYPE && message.version === 1 && typeof message.timelineTop === 'number' && Number.isFinite(message.timelineTop)) {
      const resolvedHost = resolveTimelineHost();
      const host = resolvedHost?.element;
      if (resolvedHost?.legacy && host instanceof HTMLElement) {
        const restoreOriginalEditor = message.collapsed === true;
        if (restoreOriginalEditor && host.dataset.wwcomboOriginalEditor !== 'true') host.dataset.wwcomboOriginalEditor = 'true';
        if (!restoreOriginalEditor && host.dataset.wwcomboOriginalEditor === 'true') delete host.dataset.wwcomboOriginalEditor;
        const rect = host.getBoundingClientRect();
        const nextHeight = Math.min(Math.max(0, rect.height - 52), Math.max(0, message.timelineTop - rect.top));
        if (!Number.isFinite(legacyDamageHeightOverride) || Math.abs(legacyDamageHeightOverride - nextHeight) >= 0.5) {
          legacyDamageHeightOverride = nextHeight;
          scheduleHostLayout();
        }
      }
      return;
    }
    if (message?.type === 'wwcombo:afyg-playhead' && message.version === 1) {
      damageSeekState = {
        enabled: message.enabled === true,
        playbackMs: typeof message.playbackMs === 'number' && Number.isFinite(message.playbackMs)
          ? Math.max(0, Math.round(message.playbackMs))
          : 0,
        viewportX: null
      };
      bindDamageScroller();
      updateDamageSeekLine();
      return;
    }
    if (message?.type === 'wwcombo:afyg-playhead-geometry' && message.version === 1) {
      damageSeekState.viewportX = typeof message.viewportX === 'number' && Number.isFinite(message.viewportX)
        ? message.viewportX
        : null;
      updateDamageSeekLine();
      return;
    }
    if (message?.type === 'wwcombo:afyg-timeline-scroll' && message.version === 1 && typeof message.ratio === 'number' && Number.isFinite(message.ratio)) {
      const sequence = typeof message.sequence === 'number' && Number.isFinite(message.sequence)
        ? Math.max(0, Math.floor(message.sequence))
        : 0;
      if (sequence > 0 && sequence <= lastTimelineScrollSequence) return;
      if (sequence > 0) lastTimelineScrollSequence = sequence;
      const inputAt = typeof message.inputAt === 'number' && Number.isFinite(message.inputAt)
        ? Math.max(0, message.inputAt)
        : 0;
      const timelineOwnsScroll = inputAt >= damageScrollInputAt;
      if (timelineOwnsScroll && damageScrollReportFrame) {
        cancelAnimationFrame(damageScrollReportFrame);
        damageScrollReportFrame = 0;
      }
      if (timelineOwnsScroll && damageScrollSettleTimer) {
        clearTimeout(damageScrollSettleTimer);
        damageScrollSettleTimer = 0;
      }
      requestedDamageScrollRatio = Math.min(1, Math.max(0, message.ratio));
      timelineGeometry = {
        pixelsPerMs: typeof message.pixelsPerMs === 'number' && Number.isFinite(message.pixelsPerMs)
          ? Math.min(1.6, Math.max(0.01, message.pixelsPerMs))
          : timelineGeometry.pixelsPerMs,
        renderTotalMs: typeof message.renderTotalMs === 'number' && Number.isFinite(message.renderTotalMs)
          ? Math.max(0, message.renderTotalMs)
          : timelineGeometry.renderTotalMs,
        scrollLeft: timelineOwnsScroll && typeof message.scrollLeft === 'number' && Number.isFinite(message.scrollLeft)
          ? Math.max(0, message.scrollLeft)
          : timelineGeometry.scrollLeft,
        viewportOffsetX: typeof message.viewportOffsetX === 'number' && Number.isFinite(message.viewportOffsetX)
          ? message.viewportOffsetX
          : timelineGeometry.viewportOffsetX,
        contentOffset: typeof message.contentOffset === 'number' && Number.isFinite(message.contentOffset)
          ? message.contentOffset
          : timelineGeometry.contentOffset,
        anchorsMs: Array.isArray(message.anchorsMs)
          ? message.anchorsMs.filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0).slice(0, 10000)
          : timelineGeometry.anchorsMs
      };
      bindDamageScroller();
      return;
    }
    if (!message || message.type !== WS_DOWNSTREAM_TYPE || message.version !== 1) return;
    if (message.event === 'close') {
      for (const socket of [...virtualSockets]) socket.close(1000, 'host-closed');
      return;
    }
    if (message.event === 'message') {
      for (const socket of virtualSockets) socket.receive(message.data);
    }
  });

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('database-open-failed'));
    });
  }

  function readRecord(database, key) {
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('database-read-failed'));
    });
  }

  function applyHostAccent(appearanceMode) {
    const palette = {
      night: { accent: '#b90000', accentFocused: '#d72b24', accentLabel: '#ff7568', accentText: '#ffffff', border: 'rgba(255,92,82,.42)' },
      night2: { accent: '#0b9158', accentFocused: '#16b96f', accentLabel: '#4de0a1', accentText: '#ffffff', border: 'rgba(77,224,161,.42)' },
      day: { accent: '#0a9b5f', accentFocused: '#087747', accentLabel: '#087747', accentText: '#ffffff', border: 'rgba(10,155,95,.38)' },
      coast: { accent: '#72c8ed', accentFocused: '#55b5df', accentLabel: '#217da9', accentText: '#102b3a', border: 'rgba(49,148,194,.42)' }
    }[appearanceMode] || null;
    if (!palette) return;
    let style = document.getElementById('wwcombo-afyg-theme');
    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement('style');
      style.id = 'wwcombo-afyg-theme';
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `:root{--theme-accent-bg:${palette.accent}!important;--theme-accent-bg-focused:${palette.accentFocused}!important;--theme-accent-text:${palette.accentLabel}!important;--theme-accent-text-focused:${palette.accentLabel}!important;--theme-accent-text-on-bg:${palette.accentText}!important;--theme-accent-border:${palette.border}!important}`;
  }

  async function syncThemeFromHost(theme, appearanceMode) {
    if (theme !== 'dark' && theme !== 'light') return;
    applyHostAccent(appearanceMode);
    document.documentElement.style.colorScheme = theme;
    const database = await openDatabase();
    try {
      const current = await readRecord(database, THEME_KEY);
      if (current?.data === theme) return;
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put({ key: THEME_KEY, data: theme, ts: Date.now() });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('theme-write-failed'));
        transaction.onabort = () => reject(transaction.error || new Error('theme-write-aborted'));
      });
    } finally {
      database.close();
    }
    window.location.reload();
  }

  async function readProjectState() {
    const database = await openDatabase();
    try {
      const [projectsRecord, activeRecord] = await Promise.all([
        readRecord(database, PROJECTS_KEY),
        readRecord(database, ACTIVE_KEY)
      ]);
      const projects = Array.isArray(projectsRecord?.data) ? projectsRecord.data : [];
      const activeId = typeof activeRecord?.data === 'string' ? activeRecord.data : '';
      const project = projects.find((item) => item && item.id === activeId) || (projects.length === 1 ? projects[0] : null);
      return { projects, activeId: project?.id || activeId, project };
    } finally {
      database.close();
    }
  }

  function validTimeline(value) {
    return Boolean(value)
      && typeof value === 'object'
      && Array.isArray(value.refLines)
      && Array.isArray(value.opBlocks)
      && Array.isArray(value.damageBlocks)
      && value.refLines.length <= 2000
      && value.opBlocks.length <= 10000
      && value.damageBlocks.length <= 10000;
  }

  async function replaceTimeline(projectId, timeline) {
    if (typeof projectId !== 'string' || !projectId || !validTimeline(timeline)) throw new Error('invalid-request');
    const state = await readProjectState();
    if (!state.project || state.activeId !== projectId) throw new Error('active-project-changed');
    const projects = JSON.parse(JSON.stringify(state.projects));
    const project = projects.find((item) => item && item.id === projectId);
    if (!project) throw new Error('project-not-found');
    project.phases = project.phases && typeof project.phases === 'object' ? project.phases : {};
    const previousTimeline = project.phases.timeline && typeof project.phases.timeline === 'object'
      ? project.phases.timeline
      : { locked: false, data: null };
    const nextTimeline = JSON.parse(JSON.stringify(timeline));
    const previousData = previousTimeline.data && typeof previousTimeline.data === 'object' ? previousTimeline.data : null;
    if (previousData && Array.isArray(previousData.damageBlocks)) {
      const sourceIds = new Set([
        ...nextTimeline.opBlocks.map((block) => block?.id).filter(Boolean),
        ...nextTimeline.refLines.map((line) => line?.id).filter(Boolean)
      ]);
      const incomingSources = new Set(nextTimeline.damageBlocks.map((block) => `${block?.sourceType}:${block?.sourceId}`));
      nextTimeline.damageBlocks.push(...previousData.damageBlocks.flatMap((block) => {
        if (!block) return [];
        let sourceId = block.sourceId;
        if (!sourceIds.has(sourceId) && block.sourceType === 'op') {
          const legacy = typeof sourceId === 'string' ? sourceId.match(/^wwcombo-op-\d+-(.+)$/u) : null;
          const migrated = legacy ? `wwcombo-op-${legacy[1]}` : '';
          if (migrated && sourceIds.has(migrated)) sourceId = migrated;
        }
        const key = `${block.sourceType}:${sourceId}`;
        if (!sourceIds.has(sourceId) || incomingSources.has(key)) return [];
        incomingSources.add(key);
        return [{ ...block, sourceId }];
      }));
    }
    project.phases.timeline = { ...previousTimeline, data: nextTimeline };

    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const now = Date.now();
        store.put({ key: PROJECTS_KEY, data: projects, ts: now });
        store.put({ key: ACTIVE_KEY, data: projectId, ts: now });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('database-write-failed'));
        transaction.onabort = () => reject(transaction.error || new Error('database-write-aborted'));
      });
    } finally {
      database.close();
    }
    return project;
  }

  function reply(event, requestId, action, payload) {
    const targetOrigin = event.origin && event.origin !== 'null' ? event.origin : '*';
    event.source?.postMessage({ type: RESPONSE_TYPE, version: 1, requestId, action, ...payload }, targetOrigin);
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.type !== REQUEST_TYPE || message.version !== 1 || typeof message.requestId !== 'string') return;
    try {
      if (message.action === 'ping') {
        reply(event, message.requestId, message.action, {
          ok: true,
          websocketReady: websocketBridgeReady,
          websocketError: websocketBridgeError
        });
        return;
      }
      if (message.action === 'get-current-project') {
        const state = await readProjectState();
        if (!state.project) {
          reply(event, message.requestId, message.action, { ok: false, error: 'no-active-project' });
          return;
        }
        reply(event, message.requestId, message.action, {
          ok: true,
          projectId: state.project.id,
          project: JSON.parse(JSON.stringify(state.project))
        });
        return;
      }
      if (message.action === 'get-block-damage-binding') {
        const state = await readProjectState();
        if (!state.project) {
          reply(event, message.requestId, message.action, { ok: false, error: 'no-active-project' });
          return;
        }
        if (typeof message.projectId === 'string' && message.projectId && message.projectId !== state.project.id) {
          reply(event, message.requestId, message.action, { ok: false, error: 'active-project-changed' });
          return;
        }
        const timeline = state.project?.phases?.timeline?.data;
        const damageBlocks = Array.isArray(timeline?.damageBlocks) ? timeline.damageBlocks : [];
        const matches = damageBlocks.filter((block) => block?.sourceType === 'op' && block?.sourceId === message.blockId);
        reply(event, message.requestId, message.action, {
          ok: true,
          binding: {
            skillHits: matches.flatMap((block) => Array.isArray(block.skillHits) ? block.skillHits : []),
            nonDirectEntries: matches.flatMap((block) => Array.isArray(block.nonDirectEntries) ? block.nonDirectEntries : [])
          }
        });
        return;
      }
      if (message.action === 'replace-current-timeline') {
        const project = await replaceTimeline(message.projectId, message.timeline);
        sessionStorage.setItem(REOPEN_KEY, JSON.stringify({ id: project.id, name: project.name || '' }));
        reply(event, message.requestId, message.action, { ok: true, projectId: project.id });
        window.setTimeout(() => window.location.reload(), 120);
        return;
      }
      reply(event, message.requestId, message.action, { ok: false, error: 'unsupported-action' });
    } catch (error) {
      reply(event, message.requestId, message.action, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  function restoreProjectAfterReload() {
    let marker;
    try {
      marker = JSON.parse(sessionStorage.getItem(REOPEN_KEY) || 'null');
    } catch {
      sessionStorage.removeItem(REOPEN_KEY);
      return;
    }
    if (!marker || typeof marker.id !== 'string' || typeof marker.name !== 'string') return;
    const startedAt = Date.now();
    const expanded = new WeakSet();
    const attempt = () => {
      const sidebar = document.querySelector('aside');
      if (!sidebar) return false;
      const exactLabel = Array.from(sidebar.querySelectorAll('span')).find((element) => element.textContent?.trim() === marker.name);
      const projectButton = exactLabel?.closest('[class*="cursor-pointer"]');
      if (projectButton instanceof HTMLElement) {
        sessionStorage.removeItem(REOPEN_KEY);
        projectButton.click();
        return true;
      }
      for (const icon of sidebar.querySelectorAll('svg[viewBox="0 0 42 16"]')) {
        const header = icon.closest('[class*="cursor-pointer"]');
        if (header instanceof HTMLElement && !expanded.has(header)) {
          expanded.add(header);
          header.click();
        }
      }
      return false;
    };
    if (attempt()) return;
    const observer = new MutationObserver(() => {
      if (attempt() || Date.now() - startedAt > 15000) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', restoreProjectAfterReload, { once: true });
  } else {
    restoreProjectAfterReload();
  }
})();
