(() => {
  const AFYG_ORIGINS = new Set([
    'https://wuwa-hpyg-tool.200503.xyz',
    'https://wuwa-afyg-tool.200503.xyz'
  ]);
  const EXTERNAL_LINK_ORIGINS = new Set([...AFYG_ORIGINS, 'https://nova.fb520.site']);
  const localAfygOrigin = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(window.location.origin);
  const embeddedFrame = window !== window.parent;

  function externalHttpUrl(value) {
    try {
      const url = new URL(String(value), window.location.href);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  }

  if (embeddedFrame && (EXTERNAL_LINK_ORIGINS.has(window.location.origin) || localAfygOrigin)) {
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = externalHttpUrl(anchor.href);
      if (!url) return;
      const external = anchor.target === '_blank' || new URL(url).origin !== window.location.origin;
      if (!external) return;
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage({ type: 'wwcombo:open-external', version: 1, url }, '*');
    }, true);

    const nativeOpen = window.open.bind(window);
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value(url, target, features) {
        const externalUrl = externalHttpUrl(url);
        if (externalUrl && (!target || target === '_blank' || new URL(externalUrl).origin !== window.location.origin)) {
          window.parent.postMessage({ type: 'wwcombo:open-external', version: 1, url: externalUrl }, '*');
          return null;
        }
        return nativeOpen(url, target, features);
      }
    });
  }

  if (!embeddedFrame || (!AFYG_ORIGINS.has(window.location.origin) && !localAfygOrigin)) return;

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
  const STORE_NAME = 'cache';
  const PROJECTS_KEY = 'projects';
  const ACTIVE_KEY = 'project-active';
  const THEME_KEY = 'theme-active';
  const REOPEN_KEY = 'wwcombo:afyg-reopen-project';
  const CALC_VIEW_KEY = 'wuwa-afyg:calc-view';
  const CALC_VIEW_MIGRATION_KEY = 'wwcombo:calc-view-default-v1';
  const virtualSockets = new Set();
  let lastToolbarAnchorSignature = '';
  let lastSidebarOverlaySignature = '';
  let observedProjectSidebar = null;
  let projectSidebarResizeHandle = null;
  let projectSidebarPlaceholder = null;
  let observedTimelineHost = null;
  let observedDamageScroller = null;
  let legacyDamageHeightOverride = null;
  let hostedTimelineOverlayTop = null;
  let lastHostLayoutSignature = '';
  let requestedDamageScrollRatio = null;
  let timelineScrollTarget = null;
  let timelineScrollSuppressUntil = 0;
  let damageScrollUserIntentUntil = 0;
  let damageScrollSequence = 0;
  let lastTimelineScrollSequence = 0;
  let damageScrollInputAt = 0;
  let damageScrollFrame = 0;
  let damageScrollSettleTimer = 0;
  let timelineGeometry = {
    pixelsPerMs: 0.06,
    renderTotalMs: 0,
    scrollLeft: 0,
    viewportOffsetX: 0,
    contentOffset: 112,
    anchorsMs: []
  };
  const timelineHostResizeObserver = new ResizeObserver(() => reportHostedTimelineLayout());
  const damageResizeObserver = new ResizeObserver(() => {
    applyDamageTimelineScale();
    applyTimelineScrollRatio();
    reportDamagePlayheadLayout();
  });

  try {
    const hosted = new URLSearchParams(window.location.hash.replace(/^#/u, '')).get('timeline_host') === 'wwcombo';
    if (hosted && localStorage.getItem(CALC_VIEW_MIGRATION_KEY) !== '1') {
      localStorage.setItem(CALC_VIEW_KEY, 'dropdown');
      localStorage.setItem(CALC_VIEW_MIGRATION_KEY, '1');
    }
  } catch {
    // AFYG keeps its own default when storage is unavailable.
  }

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
        if (!isLoopbackWebSocket(url)) return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
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
          window.parent.postMessage({ type: WS_UPSTREAM_TYPE, version: 1, event: 'open', url: this.url }, '*');
          this.emit(new Event('open'));
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
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="truncate"],
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="pl-6"] {
        display: none !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="gap-2"] { gap: 0 !important; }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="px-4"],
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="px-3"],
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="px-2"] {
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) [class*="items-center"] { justify-content: center !important; }
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) > div:first-child > div,
      aside[data-wwcombo-auto-sidebar="true"]:not(:hover):not(:focus-within) > div:first-child > button,
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
    const handle = document.querySelector('button[aria-label="调整侧栏宽度"], button[aria-label*="sidebar" i]');
    const sidebar = handle?.previousElementSibling;
    if (handle instanceof HTMLButtonElement && sidebar instanceof HTMLElement) return sidebar;
    return [...document.querySelectorAll('aside')].find((candidate) => {
      const candidateHandle = candidate.nextElementSibling;
      if (!(candidateHandle instanceof HTMLButtonElement)) return false;
      const label = candidateHandle.getAttribute('aria-label') || '';
      return label.includes('侧栏')
        || label.toLowerCase().includes('sidebar')
        || candidateHandle.classList.contains('cursor-col-resize');
    }) || null;
  }

  function reportProjectSidebarOverlay(expanded = null) {
    if (!(observedProjectSidebar instanceof HTMLElement)) return;
    const isExpanded = typeof expanded === 'boolean'
      ? expanded
      : observedProjectSidebar.matches(':hover, :focus-within');
    const configuredWidth = Number.parseFloat(observedProjectSidebar.style.getPropertyValue('--wwcombo-sidebar-expanded-width'));
    const rect = observedProjectSidebar.getBoundingClientRect();
    const payload = {
      type: SIDEBAR_OVERLAY_TYPE,
      version: 1,
      expanded: isExpanded,
      right: isExpanded
        ? Math.max(rect.right, rect.left + (Number.isFinite(configuredWidth) ? configuredWidth : rect.width))
        : rect.left + 52
    };
    const signature = JSON.stringify(payload);
    if (signature === lastSidebarOverlaySignature) return;
    lastSidebarOverlaySignature = signature;
    window.parent.postMessage(payload, '*');
  }

  function onProjectSidebarPointerEnter() {
    reportProjectSidebarOverlay(true);
    requestAnimationFrame(() => reportProjectSidebarOverlay());
  }

  function onProjectSidebarPointerLeave() {
    reportProjectSidebarOverlay(false);
  }

  function bindProjectSidebar() {
    const sidebar = findProjectSidebar();
    if (sidebar === observedProjectSidebar
      && sidebar instanceof HTMLElement
      && sidebar.dataset.wwcomboAutoSidebar === 'true'
      && projectSidebarPlaceholder?.isConnected) return;
    observedProjectSidebar?.removeEventListener('pointerenter', onProjectSidebarPointerEnter);
    observedProjectSidebar?.removeEventListener('pointerleave', onProjectSidebarPointerLeave);
    observedProjectSidebar?.removeAttribute('data-wwcombo-auto-sidebar');
    projectSidebarResizeHandle?.removeAttribute('data-wwcombo-sidebar-resizer');
    projectSidebarPlaceholder?.remove();
    observedProjectSidebar = null;
    projectSidebarResizeHandle = null;
    projectSidebarPlaceholder = null;
    if (!(sidebar instanceof HTMLElement)) return;
    const handle = sidebar.nextElementSibling;
    const root = sidebar.parentElement;
    if (!(handle instanceof HTMLButtonElement) || !(root instanceof HTMLElement)) return;
    ensureProjectSidebarStyle();
    const expandedWidth = Math.min(400, Math.max(200, sidebar.getBoundingClientRect().width || 240));
    sidebar.style.setProperty('--wwcombo-sidebar-expanded-width', `${expandedWidth}px`);
    const placeholder = document.createElement('div');
    placeholder.dataset.wwcomboSidebarPlaceholder = 'true';
    placeholder.setAttribute('aria-hidden', 'true');
    root.dataset.wwcomboSidebarRoot = 'true';
    root.insertBefore(placeholder, sidebar);
    sidebar.dataset.wwcomboAutoSidebar = 'true';
    handle.dataset.wwcomboSidebarResizer = 'true';
    observedProjectSidebar = sidebar;
    projectSidebarResizeHandle = handle;
    projectSidebarPlaceholder = placeholder;
    sidebar.addEventListener('pointerenter', onProjectSidebarPointerEnter);
    sidebar.addEventListener('pointerleave', onProjectSidebarPointerLeave);
    reportProjectSidebarOverlay(false);
  }

  function resolveAiAssistant() {
    const known = document.querySelector('[data-wwcombo-ai-assistant="true"]');
    if (known instanceof HTMLElement) return known;
    const trigger = [...document.querySelectorAll('[title]')].find((element) => {
      const title = element.getAttribute('title') || '';
      return title.includes('AI 助手') || title.includes('AI Assistant');
    });
    const expandedTrigger = document.querySelector('[title="清空对话"], [title="Clear conversation"], textarea[placeholder*="输入指令"], textarea[placeholder*="Enter a command"]');
    const root = trigger?.closest('.fixed') || expandedTrigger?.closest('.fixed');
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
    if (usesDefaultCorner) {
      const requiredBottom = Number.isFinite(hostedTimelineOverlayTop)
        ? Math.max(16, window.innerHeight - hostedTimelineOverlayTop + 12)
        : 16;
      const nextBottom = `${Math.round(requiredBottom)}px`;
      if (assistant.style.bottom !== nextBottom) assistant.style.setProperty('bottom', nextBottom);
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

  function ensureTimelineHostStyle() {
    if (document.querySelector('style[data-wwcombo-timeline-host-style]')) return;
    const style = document.createElement('style');
    style.dataset.wwcomboTimelineHostStyle = 'true';
    style.textContent = `
      [data-wwcombo-damage-split="true"] {
        height: var(--wwcombo-damage-height) !important;
        flex: 0 0 var(--wwcombo-damage-height) !important;
      }
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
      [data-wwcombo-legacy-timeline="true"]:not([data-wwcombo-original-editor="true"]) [data-wwcombo-legacy-damage-track="true"] {
        display: block !important;
        flex: 1 1 100% !important;
        width: 100% !important;
        height: 100% !important;
        min-height: 100% !important;
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  function explicitTimelineHost() {
    const host = document.querySelector('[data-wwcombo-timeline-host]');
    return host instanceof HTMLElement ? host : null;
  }

  function timelineHostModeEnabled() {
    return new URLSearchParams(window.location.hash.replace(/^#/u, '')).get('timeline_host') === 'wwcombo';
  }

  function findLegacyDamageTrack(root) {
    if (!(root instanceof HTMLElement)) return null;
    return [...root.querySelectorAll('[data-track-index]')].find((track) => {
      if (!(track instanceof HTMLElement)) return false;
      const copy = track.textContent?.replace(/\s+/gu, ' ').trim() || '';
      return copy.includes('伤害绑定') || copy.includes('Damage Binding');
    }) || null;
  }

  function findLegacyTimelineRoot() {
    if (!timelineHostModeEnabled()) return null;
    return [...document.querySelectorAll('div')].find((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const classes = typeof element.className === 'string' ? element.className : '';
      if (!classes.includes('theme-glass-surface') || !classes.includes('h-full') || !classes.includes('flex-col')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= 320 && rect.height >= 320 && Boolean(findLegacyDamageTrack(element));
    }) || null;
  }

  function resolvedTimelineHost() {
    return explicitTimelineHost() || findLegacyTimelineRoot();
  }

  function prepareLegacyTimelineHost(host, damageHeight) {
    const scroller = [...host.children].find((element) => element instanceof HTMLElement && element.classList.contains('theme-scrollbar'));
    const content = scroller instanceof HTMLElement
      ? [...scroller.children].find((element) => element instanceof HTMLElement && element.classList.contains('relative'))
      : null;
    const damageTrack = findLegacyDamageTrack(content);
    const trackStack = damageTrack?.parentElement;
    if (!(scroller instanceof HTMLElement) || !(content instanceof HTMLElement) || !(damageTrack instanceof HTMLElement) || !(trackStack instanceof HTMLElement)) return;
    ensureTimelineHostStyle();
    host.dataset.wwcomboLegacyTimeline = 'true';
    host.style.setProperty('--wwcombo-legacy-damage-height', `${Math.round(damageHeight)}px`);
    scroller.dataset.wwcomboLegacyDamageScroller = 'true';
    content.dataset.wwcomboLegacyContent = 'true';
    trackStack.dataset.wwcomboLegacyTrackStack = 'true';
    damageTrack.dataset.wwcomboLegacyDamageTrack = 'true';
  }

  function explicitDamageHost() {
    const host = document.querySelector('[data-wwcombo-damage-host]');
    return host instanceof HTMLElement ? host : findLegacyTimelineRoot();
  }

  function restoreDamageSplit(host = observedTimelineHost) {
    if (host?.dataset.wwcomboLegacyTimeline === 'true') {
      host.dataset.wwcomboOriginalEditor = 'true';
      legacyDamageHeightOverride = null;
      return;
    }
    const damage = host?.previousElementSibling;
    if (!(damage instanceof HTMLElement)) return;
    damage.removeAttribute('data-wwcombo-damage-split');
    damage.style.removeProperty('--wwcombo-damage-height');
  }

  function bindHostedTimeline() {
    const host = resolvedTimelineHost();
    if (host === observedTimelineHost) return;
    timelineHostResizeObserver.disconnect();
    restoreDamageSplit();
    observedTimelineHost = host;
    if (!(host instanceof HTMLElement)) return;
    legacyDamageHeightOverride = null;
    timelineHostResizeObserver.observe(host);
    if (host.parentElement) timelineHostResizeObserver.observe(host.parentElement);
  }

  function reportHostedTimelineLayout() {
    bindHostedTimeline();
    const host = observedTimelineHost;
    if (!(host instanceof HTMLElement)) {
      const payload = { type: HOST_LAYOUT_TYPE, version: 1, visible: false };
      const signature = JSON.stringify(payload);
      if (signature !== lastHostLayoutSignature) {
        lastHostLayoutSignature = signature;
        window.parent.postMessage(payload, '*');
      }
      return;
    }
    const legacy = host.dataset.wwcomboLegacyTimeline === 'true' || host === findLegacyTimelineRoot();
    const rootRect = host.getBoundingClientRect();
    const defaultLegacyDamageHeight = legacy ? Math.min(300, Math.max(190, rootRect.height * 0.3)) : 0;
    const legacyDamageHeight = legacy && Number.isFinite(legacyDamageHeightOverride)
      ? Math.min(Math.max(0, rootRect.height - 64), Math.max(0, legacyDamageHeightOverride))
      : defaultLegacyDamageHeight;
    if (legacy) prepareLegacyTimelineHost(host, legacyDamageHeight);
    const rect = legacy
      ? { left: rootRect.left, top: rootRect.top + legacyDamageHeight, width: rootRect.width, height: rootRect.height - legacyDamageHeight }
      : host.getBoundingClientRect();
    const fullRect = legacy ? rootRect : host.parentElement?.getBoundingClientRect() || rect;
    const style = getComputedStyle(host);
    const payload = {
      type: HOST_LAYOUT_TYPE,
      version: 1,
      visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        fullTop: fullRect.top,
        fullHeight: fullRect.height,
        defaultHeight: legacy ? rootRect.height - defaultLegacyDamageHeight : rect.height
      }
    };
    const signature = JSON.stringify(payload);
    if (signature === lastHostLayoutSignature) return;
    lastHostLayoutSignature = signature;
    window.parent.postMessage(payload, '*');
  }

  function applyHostedTimelineSplit(message) {
    hostedTimelineOverlayTop = message.collapsed === true
      ? null
      : typeof message.timelineTop === 'number' && Number.isFinite(message.timelineTop) ? message.timelineTop : hostedTimelineOverlayTop;
    reportAiAssistantLayout();
    bindHostedTimeline();
    const host = observedTimelineHost;
    const root = host?.parentElement;
    const damage = host?.previousElementSibling;
    if (!(host instanceof HTMLElement)) return;
    ensureTimelineHostStyle();
    const legacy = host.dataset.wwcomboLegacyTimeline === 'true' || host === findLegacyTimelineRoot();
    if (legacy) {
      const rootRect = host.getBoundingClientRect();
      if (message.collapsed === true) {
        host.dataset.wwcomboOriginalEditor = 'true';
        legacyDamageHeightOverride = null;
      } else if (typeof message.timelineTop === 'number' && Number.isFinite(message.timelineTop)) {
        delete host.dataset.wwcomboOriginalEditor;
        legacyDamageHeightOverride = Math.min(Math.max(0, rootRect.height - 64), Math.max(190, message.timelineTop - rootRect.top));
        prepareLegacyTimelineHost(host, legacyDamageHeightOverride);
      }
      requestAnimationFrame(reportHostedTimelineLayout);
      return;
    }
    if (!(root instanceof HTMLElement) || !(damage instanceof HTMLElement)) return;
    if (message.collapsed === true) {
      restoreDamageSplit(host);
      requestAnimationFrame(reportHostedTimelineLayout);
      return;
    }
    if (typeof message.timelineTop !== 'number' || !Number.isFinite(message.timelineTop)) return;
    const rootRect = root.getBoundingClientRect();
    const minimumDamageHeight = Math.min(190, Math.max(0, rootRect.height - 64));
    const maximumDamageHeight = Math.max(minimumDamageHeight, rootRect.height - 64);
    const damageHeight = Math.min(maximumDamageHeight, Math.max(minimumDamageHeight, message.timelineTop - rootRect.top));
    damage.dataset.wwcomboDamageSplit = 'true';
    damage.style.setProperty('--wwcombo-damage-height', `${Math.round(damageHeight)}px`);
    requestAnimationFrame(reportHostedTimelineLayout);
  }

  function damageTimelineContent(scroller) {
    const timeline = scroller?.querySelector(':scope > .relative') || scroller?.querySelector('.relative');
    return timeline instanceof HTMLElement ? timeline : null;
  }

  function damageTimelineLayers(timeline) {
    const legacyDamageTrack = timeline?.querySelector('[data-wwcombo-legacy-damage-track="true"]') || findLegacyDamageTrack(timeline);
    if (legacyDamageTrack instanceof HTMLElement) {
      const viewport = [...legacyDamageTrack.children].find((element) => element instanceof HTMLElement && element.querySelector(':scope > .relative'));
      const damageLayer = viewport instanceof HTMLElement ? viewport.querySelector(':scope > .relative') : null;
      return { referenceLayer: null, damageLayer: damageLayer instanceof HTMLElement ? damageLayer : null, legacy: true };
    }
    const layers = [...(timeline?.children || [])].filter((element) => element instanceof HTMLElement);
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
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y, suffix: match[3].trim() } : null;
  }

  function scaleDamageChild(child, snapToAnchor, translated = null) {
    const positionMode = translated ? 'translate' : 'left';
    const currentLeft = translated?.x ?? Number.parseFloat(child.style.left);
    const appliedLeft = Number(child.dataset.wwcomboAppliedLeft);
    const appliedTop = Number(child.dataset.wwcomboAppliedTop);
    if (child.dataset.wwcomboPositionMode !== positionMode
      || !child.dataset.wwcomboBaseLeft
      || (Number.isFinite(currentLeft) && Number.isFinite(appliedLeft) && Math.abs(currentLeft - appliedLeft) > 0.5)
      || (translated && Number.isFinite(appliedTop) && Math.abs(translated.y - appliedTop) > 0.5)) {
      if (!Number.isFinite(currentLeft)) return;
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
    if (!Number.isFinite(baseLeft)) return;
    const baseTimeMs = Math.max(0, (baseLeft - 48) / 0.06);
    const anchor = snapToAnchor
      ? timelineGeometry.anchorsMs.reduce((nearest, timeMs) => nearest === null || Math.abs(timeMs - baseTimeMs) < Math.abs(nearest - baseTimeMs) ? timeMs : nearest, null)
      : null;
    const nextLeftValue = 48 + (anchor ?? baseTimeMs) * timelineGeometry.pixelsPerMs;
    child.dataset.wwcomboAppliedLeft = String(nextLeftValue);
    if (translated) {
      if (!child.dataset.wwcomboBaseTop) child.dataset.wwcomboBaseTop = String(translated.y);
      if (!child.dataset.wwcomboTransformSuffix) child.dataset.wwcomboTransformSuffix = translated.suffix;
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

  function restackDamageChildren(timeline, damageLayer, legacy) {
    const items = [...damageLayer.children].flatMap((child) => {
      if (!(child instanceof HTMLElement)) return [];
      const left = Number(child.dataset.wwcomboAppliedLeft);
      if (!Number.isFinite(left)) return [];
      const rect = child.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return [];
      return [{ child, left, width: Math.max(24, rect.width), height: Math.max(18, rect.height) }];
    }).sort((left, right) => left.left - right.left);
    const placed = [];
    const gap = 4;
    let maximumBottom = 0;
    for (const item of items) {
      const candidates = new Set([0]);
      for (const previous of placed) {
        const overlapsX = item.left < previous.left + previous.width + gap
          && previous.left < item.left + item.width + gap;
        if (overlapsX) candidates.add(previous.top + previous.height + gap);
      }
      let top = 0;
      for (const candidate of [...candidates].sort((left, right) => left - right)) {
        const collides = placed.some((previous) => {
          const overlapsX = item.left < previous.left + previous.width + gap
            && previous.left < item.left + item.width + gap;
          const overlapsY = candidate < previous.top + previous.height + gap
            && previous.top < candidate + item.height + gap;
          return overlapsX && overlapsY;
        });
        if (!collides) {
          top = candidate;
          break;
        }
      }
      placed.push({ ...item, top });
      maximumBottom = Math.max(maximumBottom, top + item.height);
      if (legacy) {
        const suffix = item.child.dataset.wwcomboTransformSuffix || '';
        const nextTransform = `translate(${item.left}px, ${top}px)${suffix ? ` ${suffix}` : ''}`;
        item.child.dataset.wwcomboAppliedTop = String(top);
        if (item.child.style.transform !== nextTransform) item.child.style.transform = nextTransform;
      } else {
        const nextTop = `${top}px`;
        if (item.child.style.top !== nextTop) item.child.style.top = nextTop;
      }
    }
    if (!legacy) {
      const nextHeight = `${Math.max(150, Math.ceil(maximumBottom + 18))}px`;
      if (timeline.style.height !== nextHeight) timeline.style.height = nextHeight;
    }
  }

  function applyDamageTimelineScale() {
    const timeline = damageTimelineContent(observedDamageScroller);
    if (!(timeline instanceof HTMLElement) || timelineGeometry.renderTotalMs <= 0) return;
    const desiredWidth = Math.ceil(80 + 48 + timelineGeometry.renderTotalMs * timelineGeometry.pixelsPerMs + 160);
    if (timeline.style.width !== `${desiredWidth}px`) timeline.style.width = `${desiredWidth}px`;
    const { referenceLayer, damageLayer, legacy } = damageTimelineLayers(timeline);
    for (const layer of [referenceLayer, damageLayer]) {
      if (!(layer instanceof HTMLElement)) continue;
      if (layer.style.right) layer.style.removeProperty('right');
      if (layer.style.width) layer.style.removeProperty('width');
      if (layer.style.transform) layer.style.removeProperty('transform');
      if (layer.style.transformOrigin) layer.style.removeProperty('transform-origin');
    }
    if (referenceLayer instanceof HTMLElement) {
      for (const child of referenceLayer.children) if (child instanceof HTMLElement) scaleDamageChild(child, false);
    }
    if (damageLayer instanceof HTMLElement) {
      for (const child of damageLayer.children) {
        if (child instanceof HTMLElement) scaleDamageChild(child, true, legacy ? damageTranslatePosition(child.style.transform) : null);
      }
      restackDamageChildren(timeline, damageLayer, legacy);
    }
  }

  function damageScrollRatio(scroller) {
    const maximum = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    return maximum > 0 ? Math.min(1, Math.max(0, scroller.scrollLeft / maximum)) : 0;
  }

  function emitDamageScroll() {
    damageScrollFrame = 0;
    if (!(observedDamageScroller instanceof HTMLElement)) return;
    requestedDamageScrollRatio = damageScrollRatio(observedDamageScroller);
    const scrollerRect = observedDamageScroller.getBoundingClientRect();
    const viewportX = scrollerRect.left + 80 + 48 - observedDamageScroller.scrollLeft;
    timelineGeometry.scrollLeft = Math.max(0, timelineGeometry.viewportOffsetX + timelineGeometry.contentOffset - viewportX);
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
    if (timelineScrollTarget !== null && now > damageScrollUserIntentUntil && now <= timelineScrollSuppressUntil) {
      if (Math.abs(observedDamageScroller.scrollLeft - timelineScrollTarget) > 0.25) observedDamageScroller.scrollLeft = timelineScrollTarget;
      return;
    }
    if (now <= damageScrollUserIntentUntil) {
      timelineScrollTarget = null;
      timelineScrollSuppressUntil = 0;
    } else if (timelineScrollTarget !== null && now > timelineScrollSuppressUntil) {
      timelineScrollTarget = null;
    }
    if (!damageScrollFrame) damageScrollFrame = requestAnimationFrame(emitDamageScroll);
    if (damageScrollSettleTimer) clearTimeout(damageScrollSettleTimer);
    damageScrollSettleTimer = setTimeout(() => {
      damageScrollSettleTimer = 0;
      if (damageScrollFrame) cancelAnimationFrame(damageScrollFrame);
      emitDamageScroll();
    }, 100);
  }

  function markDamageScrollIntent() {
    damageScrollInputAt = Date.now();
    damageScrollUserIntentUntil = performance.now() + 220;
    timelineScrollTarget = null;
    timelineScrollSuppressUntil = 0;
  }

  function applyTimelineScrollRatio() {
    if (!(observedDamageScroller instanceof HTMLElement) || requestedDamageScrollRatio === null) return;
    const maximum = Math.max(0, observedDamageScroller.scrollWidth - observedDamageScroller.clientWidth);
    const scrollerRect = observedDamageScroller.getBoundingClientRect();
    const nextScrollLeft = Number.isFinite(timelineGeometry.scrollLeft)
      ? Math.min(maximum, Math.max(0, timelineGeometry.scrollLeft + scrollerRect.left + 80 + 48 - timelineGeometry.viewportOffsetX - timelineGeometry.contentOffset))
      : requestedDamageScrollRatio * maximum;
    timelineScrollTarget = nextScrollLeft;
    timelineScrollSuppressUntil = performance.now() + 160;
    if (Math.abs(observedDamageScroller.scrollLeft - nextScrollLeft) > 0.25) observedDamageScroller.scrollLeft = nextScrollLeft;
  }

  function reportDamagePlayheadLayout() {
    const rect = damageTimelineContent(observedDamageScroller)?.getBoundingClientRect();
    window.parent.postMessage({
      type: 'wwcombo:afyg-damage-playhead-layout',
      version: 1,
      rect: rect ? { top: rect.top, bottom: rect.bottom } : null
    }, '*');
  }

  function bindDamageScroller() {
    const host = explicitDamageHost();
    const scroller = host?.querySelector('.theme-scrollbar');
    const next = scroller instanceof HTMLElement ? scroller : null;
    if (next === observedDamageScroller) {
      applyDamageTimelineScale();
      applyTimelineScrollRatio();
      reportDamagePlayheadLayout();
      return;
    }
    damageResizeObserver.disconnect();
    observedDamageScroller?.removeEventListener('scroll', reportDamageScroll);
    observedDamageScroller?.removeEventListener('wheel', markDamageScrollIntent);
    observedDamageScroller?.removeEventListener('pointerdown', markDamageScrollIntent);
    observedDamageScroller?.removeEventListener('touchstart', markDamageScrollIntent);
    observedDamageScroller = next;
    if (!(next instanceof HTMLElement)) {
      reportDamagePlayheadLayout();
      return;
    }
    next.addEventListener('scroll', reportDamageScroll, { passive: true });
    next.addEventListener('wheel', markDamageScrollIntent, { passive: true });
    next.addEventListener('pointerdown', markDamageScrollIntent, { passive: true });
    next.addEventListener('touchstart', markDamageScrollIntent, { passive: true });
    damageResizeObserver.observe(next);
    const content = damageTimelineContent(next);
    if (content) damageResizeObserver.observe(content);
    applyDamageTimelineScale();
    applyTimelineScrollRatio();
    reportDamagePlayheadLayout();
  }

  function applyTimelineGeometry(message) {
    const sequence = typeof message.sequence === 'number' && Number.isFinite(message.sequence) ? Math.max(0, Math.floor(message.sequence)) : 0;
    if (sequence > 0 && sequence <= lastTimelineScrollSequence) return;
    if (sequence > 0) lastTimelineScrollSequence = sequence;
    const inputAt = typeof message.inputAt === 'number' && Number.isFinite(message.inputAt) ? Math.max(0, message.inputAt) : 0;
    const timelineOwnsScroll = inputAt >= damageScrollInputAt;
    if (timelineOwnsScroll && damageScrollFrame) {
      cancelAnimationFrame(damageScrollFrame);
      damageScrollFrame = 0;
    }
    if (timelineOwnsScroll && damageScrollSettleTimer) {
      clearTimeout(damageScrollSettleTimer);
      damageScrollSettleTimer = 0;
    }
    requestedDamageScrollRatio = Math.min(1, Math.max(0, message.ratio));
    timelineGeometry = {
      pixelsPerMs: typeof message.pixelsPerMs === 'number' && Number.isFinite(message.pixelsPerMs) ? Math.min(1.6, Math.max(0.01, message.pixelsPerMs)) : timelineGeometry.pixelsPerMs,
      renderTotalMs: typeof message.renderTotalMs === 'number' && Number.isFinite(message.renderTotalMs) ? Math.max(0, message.renderTotalMs) : timelineGeometry.renderTotalMs,
      scrollLeft: timelineOwnsScroll && typeof message.scrollLeft === 'number' && Number.isFinite(message.scrollLeft) ? Math.max(0, message.scrollLeft) : timelineGeometry.scrollLeft,
      viewportOffsetX: typeof message.viewportOffsetX === 'number' && Number.isFinite(message.viewportOffsetX) ? message.viewportOffsetX : timelineGeometry.viewportOffsetX,
      contentOffset: typeof message.contentOffset === 'number' && Number.isFinite(message.contentOffset) ? message.contentOffset : timelineGeometry.contentOffset,
      anchorsMs: Array.isArray(message.anchorsMs) ? message.anchorsMs.filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0).slice(0, 10000) : timelineGeometry.anchorsMs
    };
    bindDamageScroller();
  }

  function reportToolbarAnchor() {
    bindProjectSidebar();
    reportProjectSidebarOverlay();
    reportHostedTimelineLayout();
    reportAiAssistantLayout();
    bindDamageScroller();
    const toolbars = [...document.querySelectorAll('[role="toolbar"]')];
    const anchorButton = toolbars.flatMap((toolbar) => [...toolbar.querySelectorAll('button')]).find((button) => {
      const label = `${button.getAttribute('title') || ''} ${button.textContent || ''}`;
      const rect = button.getBoundingClientRect();
      return label.includes('快速排轴') && rect.width > 0 && rect.height > 0;
    });
    const rect = anchorButton?.getBoundingClientRect();
    const payload = rect
      ? { type: 'wwcombo:afyg-toolbar-anchor', version: 1, visible: true, rect: { left: rect.right, top: rect.top, height: rect.height } }
      : { type: 'wwcombo:afyg-toolbar-anchor', version: 1, visible: false };
    const signature = JSON.stringify(payload);
    if (signature === lastToolbarAnchorSignature) return;
    lastToolbarAnchorSignature = signature;
    window.parent.postMessage(payload, '*');
  }
  reportToolbarAnchor();
  window.addEventListener('DOMContentLoaded', reportToolbarAnchor, { once: true });
  window.addEventListener('resize', reportToolbarAnchor);
  window.setInterval(reportToolbarAnchor, 240);

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
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

  async function syncTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    const database = await openDatabase();
    try {
      const current = await readRecord(database, THEME_KEY);
      if (current?.data === theme) return;
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put({ key: THEME_KEY, data: theme, ts: Date.now() });
        transaction.oncomplete = resolve;
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

  function normalizedTimings(value) {
    return Array.isArray(value) ? value.filter((entry) => entry
      && typeof entry.refLineId === 'string'
      && typeof entry.seconds === 'number'
      && Number.isFinite(entry.seconds)
      && entry.seconds >= 0).slice(0, 2000) : [];
  }

  async function replaceTimeline(projectId, timeline, resultAnalysis, adapterMetadata) {
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
      const incoming = new Set(nextTimeline.damageBlocks.map((block) => `${block?.sourceType}:${block?.sourceId}`));
      nextTimeline.damageBlocks.push(...previousData.damageBlocks.flatMap((block) => {
        if (!block) return [];
        let sourceId = block.sourceId;
        if (!sourceIds.has(sourceId) && block.sourceType === 'op') {
          const legacy = typeof sourceId === 'string' ? sourceId.match(/^wwcombo-op-\d+-(.+)$/u) : null;
          const migrated = legacy ? `wwcombo-op-${legacy[1]}` : '';
          if (migrated && sourceIds.has(migrated)) sourceId = migrated;
        }
        const key = `${block.sourceType}:${sourceId}`;
        if (!sourceIds.has(sourceId) || incoming.has(key)) return [];
        incoming.add(key);
        return [{ ...block, sourceId }];
      }));
    }
    project.phases.timeline = { ...previousTimeline, data: nextTimeline };
    if (resultAnalysis && typeof resultAnalysis === 'object' && !Array.isArray(resultAnalysis)) {
      project.resultAnalysis = {
        ...(project.resultAnalysis && typeof project.resultAnalysis === 'object' ? project.resultAnalysis : {}),
        ...JSON.parse(JSON.stringify(resultAnalysis)),
        timings: normalizedTimings(resultAnalysis.timings)
      };
    }
    if (adapterMetadata && typeof adapterMetadata === 'object' && !Array.isArray(adapterMetadata)) {
      project.wwcomboAdapter = JSON.parse(JSON.stringify(adapterMetadata));
    }

    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const now = Date.now();
        store.put({ key: PROJECTS_KEY, data: projects, ts: now });
        store.put({ key: ACTIVE_KEY, data: projectId, ts: now });
        transaction.oncomplete = resolve;
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

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (message?.type === 'wwcombo:afyg-theme' && message.version === 1) {
      void syncTheme(message.theme).catch(() => undefined);
      return;
    }
    if (message?.type === HOST_SPLIT_TYPE && message.version === 1) {
      applyHostedTimelineSplit(message);
      return;
    }
    if (message?.type === 'wwcombo:afyg-timeline-scroll'
      && message.version === 1
      && typeof message.ratio === 'number'
      && Number.isFinite(message.ratio)) {
      applyTimelineGeometry(message);
      return;
    }
    if (!message || message.type !== WS_DOWNSTREAM_TYPE || message.version !== 1) return;
    if (message.event === 'close') {
      for (const socket of [...virtualSockets]) socket.close(1000, 'host-closed');
    } else if (message.event === 'message') {
      for (const socket of virtualSockets) socket.receive(message.data);
    }
  });

  window.addEventListener('message', async (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.type !== REQUEST_TYPE || message.version !== 1 || typeof message.requestId !== 'string') return;
    try {
      if (message.action === 'ping') {
        reply(event, message.requestId, message.action, { ok: true, websocketReady: websocketBridgeReady, websocketError: websocketBridgeError });
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
        const damageBlocks = Array.isArray(state.project?.phases?.timeline?.data?.damageBlocks)
          ? state.project.phases.timeline.data.damageBlocks
          : [];
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
        const project = await replaceTimeline(message.projectId, message.timeline, message.resultAnalysis, message.adapterMetadata);
        sessionStorage.setItem(REOPEN_KEY, JSON.stringify({
          id: project.id,
          name: project.name || '',
          view: 'timeline',
          expiresAt: Date.now() + 20000
        }));
        reply(event, message.requestId, message.action, { ok: true, projectId: project.id });
        window.setTimeout(() => window.location.reload(), 120);
        return;
      }
      reply(event, message.requestId, message.action, { ok: false, error: 'unsupported-action' });
    } catch (error) {
      reply(event, message.requestId, message.action, { ok: false, error: error instanceof Error ? error.message : String(error) });
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
    if (typeof marker.expiresAt === 'number' && Date.now() > marker.expiresAt) {
      sessionStorage.removeItem(REOPEN_KEY);
      return;
    }
    const startedAt = Date.now();
    let projectOpened = false;
    const expandedGroups = new WeakSet();
    const attempt = () => {
      if (!projectOpened) {
        const sidebar = document.querySelector('aside');
        const exactLabel = sidebar
          ? [...sidebar.querySelectorAll('span')].find((element) => element.textContent?.trim() === marker.name)
          : null;
        const projectButton = exactLabel?.closest('[class*="cursor-pointer"]');
        if (projectButton instanceof HTMLElement) {
          projectButton.click();
          projectOpened = true;
        } else if (sidebar) {
          for (const icon of sidebar.querySelectorAll('svg[viewBox="0 0 42 16"]')) {
            const header = icon.closest('[class*="cursor-pointer"]');
            if (header instanceof HTMLElement && !expandedGroups.has(header)) {
              expandedGroups.add(header);
              header.click();
            }
          }
        }
      }
      if (projectOpened && marker.view === 'timeline') {
        const timelineButton = [...document.querySelectorAll('button')].find((button) => {
          const title = (button.getAttribute('title') || '').trim();
          const label = (button.textContent || '').trim();
          return !button.disabled && (label === '排轴' || label === 'Timeline' || title === '排轴' || title === 'Timeline');
        });
        if (timelineButton instanceof HTMLButtonElement) {
          timelineButton.click();
          window.setTimeout(() => {
            let current;
            try {
              current = JSON.parse(sessionStorage.getItem(REOPEN_KEY) || 'null');
            } catch {
              current = null;
            }
            if (current?.id === marker.id) sessionStorage.removeItem(REOPEN_KEY);
          }, 4000);
          return true;
        }
      }
      return false;
    };
    if (attempt()) return;
    const timer = window.setInterval(() => {
      if (attempt() || Date.now() - startedAt > 12000) {
        window.clearInterval(timer);
        if (Date.now() - startedAt > 12000) sessionStorage.removeItem(REOPEN_KEY);
      }
    }, 120);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', restoreProjectAfterReload, { once: true });
  } else {
    restoreProjectAfterReload();
  }
})();
