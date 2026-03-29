(() => {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================

  const CONFIG = {
    libraryFile: "library.json",
    defaultWorksBase: "https://pub-cd01009a7c6c464aa0b093e33aa5ae51.r2.dev/works",
    itemJsonName: "item.json",

    bottomAdCount: 6,

    railRefreshMs: 60000,
    bannerRefreshMs: 60000,
    betweenRefreshMs: 50000,
    mobileStickyRefreshMs: 60000,

    readProgressPrefetch: 0.7,
    bottomGlowProgress: 0.95,
    searchResultsLimit: 12,

    minGlobalServeGapMs: 1200,
    minSlotRefreshGapMs: 30000,
    viewportThreshold: 0.2,

    interstitialDelayMs: 1200,
    videoSliderDelayMs: 5000,

    topTraversalWindow: 9,
    topTraversalEdgeCount: 2,

    stickyClassName: "eas6a97888e17",
    defaultSlotClassName: "eas6a97888e38"
  };

  const ZONES = {
    topBanner: 5865232,
    betweenMulti: 5867482,

    leftStickyTop: 5885236,
    leftStickyMid: 5885238,
    leftStickyBottom: 5885242,

    rightStickyTop: 5885244,
    rightStickyMid: 5885246,
    rightStickyBottom: 5885248
  };

  const SPECIAL_ZONES = {
    desktopInterstitial: {
      zoneId: 5880058,
      className: "eas6a97888e35",
      host: "https://a.pemsrv.com/ad-provider.js"
    },
    mobileInterstitial: {
      zoneId: 5880060,
      className: "eas6a97888e33",
      host: "https://a.pemsrv.com/ad-provider.js"
    },
    desktopVideoSlider: {
      zoneId: 5880066,
      className: "eas6a97888e31",
      host: "https://a.magsrv.com/ad-provider.js"
    },
    desktopRecommend: {
      zoneId: 5880068,
      className: "eas6a97888e20",
      host: "https://a.magsrv.com/ad-provider.js"
    },
    mobileSticky: {
      zoneId: 5880082,
      className: "eas6a97888e10",
      host: "https://a.magsrv.com/ad-provider.js"
    }
  };

  const LEGACY_LEFT_RAIL_IDS = [
    "leftRailSlot1", "leftRailSlot2", "leftRailSlot3", "leftRailSlot4", "leftRailSlot5", "leftRailSlot6",
    "leftRailSlot7", "leftRailSlot8", "leftRailSlot9", "leftRailSlot10", "leftRailSlot11", "leftRailSlot12"
  ];

  const LEGACY_RIGHT_RAIL_IDS = [
    "rightRailSlot1", "rightRailSlot2", "rightRailSlot3", "rightRailSlot4", "rightRailSlot5", "rightRailSlot6",
    "rightRailSlot7", "rightRailSlot8", "rightRailSlot9", "rightRailSlot10", "rightRailSlot11", "rightRailSlot12"
  ];

  const STICKY_RAIL_SLOTS = [
    { preferredId: "leftStickyTop", fallbackId: "leftRailSlot1", zoneId: ZONES.leftStickyTop },
    { preferredId: "leftStickyMid", fallbackId: "leftRailSlot2", zoneId: ZONES.leftStickyMid },
    { preferredId: "leftStickyBottom", fallbackId: "leftRailSlot3", zoneId: ZONES.leftStickyBottom },
    { preferredId: "rightStickyTop", fallbackId: "rightRailSlot1", zoneId: ZONES.rightStickyTop },
    { preferredId: "rightStickyMid", fallbackId: "rightRailSlot2", zoneId: ZONES.rightStickyMid },
    { preferredId: "rightStickyBottom", fallbackId: "rightRailSlot3", zoneId: ZONES.rightStickyBottom }
  ];

  // ============================================================
  // STATE
  // ============================================================

  const STATE = {
    works: [],
    sourceMap: {},

    currentWork: null,
    currentEntry: null,
    currentItem: null,

    isMobileReader: document.body?.dataset?.readerMode === "mobile",

    topFlyoutsWired: false,
    stickyControlsWired: false,
    searchWired: false,
    mobileWorksWired: false,
    progressWatchWired: false,
    dialWired: false,

    railRefreshTimer: null,
    bannerRefreshTimer: null,
    betweenRefreshTimer: null,
    mobileStickyRefreshTimer: null,

    nextPrefetch: null,
    bottomGlowTriggered: false,
    mobileOpenWorkSlug: "",

    adServeScheduled: false,
    lastServeAt: 0,
    adVisibilityObserver: null,
    adActionBurstCooldownUntil: 0,

    providerLoadPromises: new Map(),

    videoSliderLoaded: false,
    videoSliderScheduled: false,
    mobileStickyLoaded: false,

    retentionToastTimer: null,
    scrollTicking: false,
    buildToken: 0
  };

  // ============================================================
  // DOM HELPERS
  // ============================================================

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function createEl(tag, className = "", text = "") {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function firstExistingId(ids) {
    for (const id of ids) {
      const el = byId(id);
      if (el) return el;
    }
    return null;
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  function now() {
    return Date.now();
  }

  function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function normalizeKey(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function normalizeBaseUrl(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function titleCaseSlug(slug) {
    return String(slug ?? "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, ch => ch.toUpperCase());
  }

  function isElementInViewport(el, threshold = CONFIG.viewportThreshold) {
    if (!el || !el.isConnected) return false;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= vh || rect.left >= vw) return false;

    const visibleX = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const visibleY = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const visibleArea = visibleX * visibleY;
    const totalArea = rect.width * rect.height;

    if (totalArea <= 0) return false;
    return (visibleArea / totalArea) >= threshold;
  }

  function canRefreshSlot(el) {
    if (!el) return false;
    const last = Number(el.dataset.lastRefreshAt || 0);
    return (now() - last) >= CONFIG.minSlotRefreshGapMs;
  }

  function stampSlotRefresh(el) {
    if (el) el.dataset.lastRefreshAt = String(now());
  }

  function markSlotSeen(el) {
    if (el) el.dataset.seen = "1";
  }

  // ============================================================
  // SOURCE / ITEM RESOLUTION
  // ============================================================

  function resolveSourceKey(work, entry) {
    return entry?.source || work?.source || "";
  }

  function getSourceBaseByKey(sourceKey) {
    return sourceKey ? normalizeBaseUrl(STATE.sourceMap[sourceKey] || "") : "";
  }

  function getWorkBase(work, entry) {
    return normalizeBaseUrl(
      entry?.base_url ||
      getSourceBaseByKey(resolveSourceKey(work, entry)) ||
      work?.base_url ||
      CONFIG.defaultWorksBase
    );
  }

  function getItemJsonUrl(work, entry) {
    if (entry?.item_url) return entry.item_url;

    const path = String(entry?.path || entry?.slug || "");
    const safeParts = path.split("/").filter(Boolean).map(part => encodeURIComponent(part));

    return `${getWorkBase(work, entry)}/${encodeURIComponent(work.slug)}/${safeParts.join("/")}/${CONFIG.itemJsonName}`;
  }

  function buildImageList(manifest) {
    if (Array.isArray(manifest.images) && manifest.images.length) return manifest.images;

    if (Number.isFinite(manifest.pages) && manifest.pages > 0) {
      const ext = manifest.extension || "jpg";
      const padding = Number.isFinite(manifest.padding) ? manifest.padding : 2;

      return Array.from({ length: manifest.pages }, (_, i) =>
        `${String(i + 1).padStart(padding, "0")}.${ext}`
      );
    }

    return [];
  }

  function getSubids(manifest) {
    const fallbackWork = Number(manifest.parent_work_id) || 1;
    return {
      work: manifest.subids?.work ?? fallbackWork,
      top: manifest.subids?.top ?? fallbackWork + 10,
      left: manifest.subids?.left ?? fallbackWork + 20,
      right: manifest.subids?.right ?? fallbackWork + 30,
      between: manifest.subids?.between ?? fallbackWork + 40
    };
  }

  function getManifestAds(manifest) {
    return {
      betweenEvery: Number(manifest?.ads?.between_every || 0),
      betweenSlots: Number(manifest?.ads?.between_slots || 0),
      finalBlock: Number(manifest?.ads?.final_block || CONFIG.bottomAdCount)
    };
  }

  // ============================================================
  // QUERY STATE
  // ============================================================

  function getQueryState() {
    const url = new URL(window.location.href);
    return {
      dir: url.searchParams.get("dir") || "",
      file: url.searchParams.get("file") || ""
    };
  }

  function setQueryState(dir, file, replace = false) {
    const url = new URL(window.location.href);
    url.searchParams.set("dir", dir);
    url.searchParams.set("file", file);

    if (replace) {
      history.replaceState({ dir, file }, "", url);
    } else {
      history.pushState({ dir, file }, "", url);
    }
  }

  function getFirstEntry() {
    for (const work of STATE.works) {
      const first = Array.isArray(work.entries) ? work.entries[0] : null;
      if (work?.slug && first?.slug) return { work, entry: first };
    }
    return { work: null, entry: null };
  }

  function resolveSelection(dir, file) {
    const d = normalizeKey(dir);
    const f = normalizeKey(file);

    for (const work of STATE.works) {
      if (normalizeKey(work.slug) !== d) continue;
      for (const entry of work.entries || []) {
        if (normalizeKey(entry.slug) === f) {
          return { work, entry };
        }
      }
    }

    return null;
  }

  function getEntryContext() {
    const entries = Array.isArray(STATE.currentWork?.entries) ? STATE.currentWork.entries : [];
    const currentIndex = entries.findIndex(entry => normalizeKey(entry.slug) === normalizeKey(STATE.currentEntry?.slug));

    return {
      entries,
      currentIndex,
      prev: currentIndex > 0 ? entries[currentIndex - 1] : null,
      next: currentIndex >= 0 && currentIndex < entries.length - 1 ? entries[currentIndex + 1] : null
    };
  }

  function getCurrentChapterPosition() {
    const { currentIndex } = getEntryContext();
    return currentIndex >= 0 ? currentIndex + 1 : 0;
  }

  // ============================================================
  // SCROLL TARGETS
  // ============================================================

  function scrollToReaderTopInstant() {
    const target =
      byId("readerTopAnchor") ||
      byId("reader") ||
      byId("searchBarAnchor");

    if (target) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    } else {
      window.scrollTo(0, 0);
    }
  }

  function scrollToReaderContentStartInstant() {
    const target =
      byId("readerContentStartAnchor") ||
      byId("readerTopAnchor") ||
      byId("reader");

    if (target) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    } else {
      window.scrollTo(0, 0);
    }
  }

  function scrollToSearchBar() {
    const target = byId("searchBarAnchor") || $(".hero");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ============================================================
  // FETCH
  // ============================================================

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url} (${res.status})`);
    }
    return res.json();
  }

  async function loadLibrary() {
    const data = await fetchJson(CONFIG.libraryFile);
    STATE.works = Array.isArray(data.works) ? data.works : [];
    STATE.sourceMap = data && typeof data.sources === "object" && data.sources ? data.sources : {};
  }

  // ============================================================
  // ADS
  // ============================================================

  function rawServeAds() {
    (window.AdProvider = window.AdProvider || []).push({ serve: {} });
    STATE.lastServeAt = now();
    STATE.adServeScheduled = false;
  }

  function serveAds(force = false) {
    const elapsed = now() - STATE.lastServeAt;

    if (force || elapsed >= CONFIG.minGlobalServeGapMs) {
      rawServeAds();
      return;
    }

    if (STATE.adServeScheduled) return;
    STATE.adServeScheduled = true;

    window.setTimeout(() => rawServeAds(), Math.max(0, CONFIG.minGlobalServeGapMs - elapsed));
  }

  function burstServeAds() {
    if (document.hidden) return;
    if (now() < STATE.adActionBurstCooldownUntil) return;

    STATE.adActionBurstCooldownUntil = now() + 3500;
    serveAds(true);
    window.setTimeout(() => serveAds(true), 700);
  }

  function ensureAdProviderScript(src) {
    if (!src) return Promise.resolve();

    if (STATE.providerLoadPromises.has(src)) {
      return STATE.providerLoadPromises.get(src);
    }

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      const ready = Promise.resolve();
      STATE.providerLoadPromises.set(src, ready);
      return ready;
    }

    const promise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.async = true;
      s.type = "application/javascript";
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ad provider: ${src}`));
      document.head.appendChild(s);
    });

    STATE.providerLoadPromises.set(src, promise);
    return promise;
  }

  function makeIns(zoneId, sub = 1, sub2 = 1, sub3 = 1, className = CONFIG.defaultSlotClassName) {
    const ins = document.createElement("ins");
    ins.className = className;
    ins.setAttribute("data-zoneid", String(zoneId));
    ins.setAttribute("data-sub", String(sub));
    ins.setAttribute("data-sub2", String(sub2));
    ins.setAttribute("data-sub3", String(sub3));
    return ins;
  }

  function makeSpecialIns(zoneId, className) {
    const ins = document.createElement("ins");
    ins.className = className;
    ins.setAttribute("data-zoneid", String(zoneId));
    return ins;
  }

  function refillSlot(el, zoneId, sub = 1, sub2 = 1, sub3 = 1, className = CONFIG.defaultSlotClassName) {
    if (!el) return;
    el.innerHTML = "";
    el.appendChild(makeIns(zoneId, sub, sub2, sub3, className));
    stampSlotRefresh(el);
  }

  function fillSlot(el, zoneId, sub = 1, sub2 = 1, sub3 = 1, className = CONFIG.defaultSlotClassName) {
    if (!el) return;
    refillSlot(el, zoneId, sub, sub2, sub3, className);
    serveAds();
  }

  function refillSlotIfVisible(el, zoneId, sub = 1, sub2 = 1, sub3 = 1, className = CONFIG.defaultSlotClassName) {
    if (!el || document.hidden) return false;
    if (!isElementInViewport(el)) return false;
    if (!canRefreshSlot(el)) return false;

    refillSlot(el, zoneId, sub, sub2, sub3, className);
    markSlotSeen(el);
    return true;
  }

  function createRuntimeMount(id) {
    const mount = document.createElement("div");
    mount.id = id;
    mount.className = "ad-mount";
    return mount;
  }

  async function mountRuntimeSpecial(id, cfg) {
    if (!cfg) return null;
    await ensureAdProviderScript(cfg.host);

    let mount = byId(id);
    if (!mount) {
      mount = createRuntimeMount(id);
      document.body.appendChild(mount);
    }

    mount.innerHTML = "";
    mount.appendChild(makeSpecialIns(cfg.zoneId, cfg.className));
    serveAds(true);
    return mount;
  }

  async function fireChapterInterstitial() {
    const cfg = STATE.isMobileReader ? SPECIAL_ZONES.mobileInterstitial : SPECIAL_ZONES.desktopInterstitial;
    const id = STATE.isMobileReader ? "runtime-mobile-interstitial" : "runtime-desktop-interstitial";

    await mountRuntimeSpecial(id, cfg);
    await delay(CONFIG.interstitialDelayMs);
  }

  async function loadMobileStickyBanner(force = false) {
    if (!STATE.isMobileReader) return;

    const mount = byId("mobileStickyMount");
    if (!mount) return;
    if (STATE.mobileStickyLoaded && !force) return;

    await ensureAdProviderScript(SPECIAL_ZONES.mobileSticky.host);
    mount.innerHTML = "";
    mount.appendChild(makeSpecialIns(SPECIAL_ZONES.mobileSticky.zoneId, SPECIAL_ZONES.mobileSticky.className));
    stampSlotRefresh(mount);
    serveAds(true);
    STATE.mobileStickyLoaded = true;
  }

  function positionDesktopStickyAwayFromVideo() {
    if (STATE.isMobileReader) return;

    const stickyCluster = byId("stickyCluster");
    const progressChip = $(".chapter-progress-chip");

    if (stickyCluster) {
      stickyCluster.style.right = "auto";
      stickyCluster.style.left = "18px";
      stickyCluster.style.bottom = "18px";
    }

    if (progressChip) {
      progressChip.style.left = "18px";
      progressChip.style.right = "auto";
      progressChip.style.bottom = "140px";
    }
  }

  function scheduleVideoSlider() {
    if (STATE.isMobileReader || STATE.videoSliderLoaded || STATE.videoSliderScheduled) return;

    STATE.videoSliderScheduled = true;

    window.setTimeout(async () => {
      if (STATE.videoSliderLoaded) return;
      await mountRuntimeSpecial("runtime-desktop-video-slider", SPECIAL_ZONES.desktopVideoSlider);
      STATE.videoSliderLoaded = true;
      positionDesktopStickyAwayFromVideo();
    }, CONFIG.videoSliderDelayMs);
  }

  function setupAdVisibilityObserver() {
    if (STATE.adVisibilityObserver) {
      STATE.adVisibilityObserver.disconnect();
      STATE.adVisibilityObserver = null;
    }

    STATE.adVisibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target) markSlotSeen(entry.target);
      }
    }, {
      root: null,
      threshold: [0.2, 0.5]
    });

    $$(".slot, .top-banner-inner").forEach(el => STATE.adVisibilityObserver.observe(el));
  }

  function getStickyRailMounts() {
    return STICKY_RAIL_SLOTS.map(def => ({
      ...def,
      el: byId(def.preferredId) || byId(def.fallbackId)
    })).filter(x => x.el);
  }

  function fillRailStacks(subids) {
    getStickyRailMounts().forEach((slotDef, index) => {
      fillSlot(
        slotDef.el,
        slotDef.zoneId,
        subids.work,
        index + 1,
        1,
        CONFIG.stickyClassName
      );
    });

    const legacyUnused = [
      ...LEGACY_LEFT_RAIL_IDS.slice(3),
      ...LEGACY_RIGHT_RAIL_IDS.slice(3)
    ];

    legacyUnused.forEach(id => {
      const el = byId(id);
      if (el) el.innerHTML = "";
    });
  }

  function refreshVisibleRailSlots() {
    if (document.hidden || !STATE.currentItem || STATE.isMobileReader) return false;

    const subids = getSubids(STATE.currentItem);
    let refreshed = false;

    getStickyRailMounts().forEach((slotDef, index) => {
      const ok = refillSlotIfVisible(
        slotDef.el,
        slotDef.zoneId,
        subids.work,
        index + 1,
        1,
        CONFIG.stickyClassName
      );
      refreshed = refreshed || ok;
    });

    if (refreshed) serveAds();
    return refreshed;
  }

  function refreshVisibleTopBanner() {
    if (document.hidden || !STATE.currentItem || STATE.isMobileReader) return false;

    const subids = getSubids(STATE.currentItem);
    const el = byId("topBannerSlot");
    const refreshed = refillSlotIfVisible(el, ZONES.topBanner, subids.top, subids.work, 1);

    if (refreshed) serveAds();
    return refreshed;
  }

  function refreshVisibleBetweenSlots() {
    if (document.hidden || !STATE.currentItem) return false;

    let refreshed = false;

    $$(".between-slot").forEach((el) => {
      const zoneId = Number(el.dataset.zoneId || 0);
      const sub = Number(el.dataset.sub || 1);
      const sub2 = Number(el.dataset.sub2 || 1);
      const sub3 = Number(el.dataset.sub3 || 1);
      if (!zoneId) return;

      const ok = refillSlotIfVisible(el, zoneId, sub, sub2, sub3);
      refreshed = refreshed || ok;
    });

    if (refreshed) serveAds();
    return refreshed;
  }

  async function refreshMobileSticky() {
    if (!STATE.isMobileReader) return false;

    const mount = byId("mobileStickyMount");
    if (!mount || document.hidden) return false;
    if (!canRefreshSlot(mount)) return false;

    await loadMobileStickyBanner(true);
    return true;
  }

  function clearRefreshTimers() {
    if (STATE.railRefreshTimer) clearInterval(STATE.railRefreshTimer);
    if (STATE.bannerRefreshTimer) clearInterval(STATE.bannerRefreshTimer);
    if (STATE.betweenRefreshTimer) clearInterval(STATE.betweenRefreshTimer);
    if (STATE.mobileStickyRefreshTimer) clearInterval(STATE.mobileStickyRefreshTimer);

    STATE.railRefreshTimer = null;
    STATE.bannerRefreshTimer = null;
    STATE.betweenRefreshTimer = null;
    STATE.mobileStickyRefreshTimer = null;
  }

  function startRefreshTimers() {
    clearRefreshTimers();

    if (!STATE.isMobileReader) {
      STATE.railRefreshTimer = window.setInterval(refreshVisibleRailSlots, CONFIG.railRefreshMs);
      STATE.bannerRefreshTimer = window.setInterval(refreshVisibleTopBanner, CONFIG.bannerRefreshMs);
      STATE.betweenRefreshTimer = window.setInterval(refreshVisibleBetweenSlots, CONFIG.betweenRefreshMs);
      return;
    }

    STATE.mobileStickyRefreshTimer = window.setInterval(refreshMobileSticky, CONFIG.mobileStickyRefreshMs);
  }

  function clearDesktopAdShells() {
    const topBanner = byId("topBannerSlot");
    if (topBanner) topBanner.innerHTML = "";

    const ids = [
      ...LEGACY_LEFT_RAIL_IDS,
      ...LEGACY_RIGHT_RAIL_IDS,
      "leftStickyTop", "leftStickyMid", "leftStickyBottom",
      "rightStickyTop", "rightStickyMid", "rightStickyBottom"
    ];

    ids.forEach(id => {
      const el = byId(id);
      if (el) el.innerHTML = "";
    });
  }

  // ============================================================
  // MOBILE DIAL
  // ============================================================

  function syncDialThumb() {
    if (!STATE.isMobileReader) return;

    const scrollEl = byId("worksNav");
    const track = byId("dialTrack");
    const thumb = byId("dialThumb");
    if (!scrollEl || !track || !thumb) return;

    const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    const trackH = track.clientHeight;
    const thumbH = thumb.offsetHeight;
    const maxTop = Math.max(0, trackH - thumbH);

    const ratio = maxScroll > 0 ? scrollEl.scrollTop / maxScroll : 0;
    thumb.style.top = `${maxTop * ratio}px`;
  }

  function wireMobileDial() {
    if (!STATE.isMobileReader || STATE.dialWired) return;
    STATE.dialWired = true;

    const scrollEl = byId("worksNav");
    const track = byId("dialTrack");
    const thumb = byId("dialThumb");
    if (!scrollEl || !track || !thumb) return;

    let dragging = false;

    const moveThumb = (clientY) => {
      const rect = track.getBoundingClientRect();
      const thumbH = thumb.offsetHeight;
      const maxTop = Math.max(0, rect.height - thumbH);

      let top = clientY - rect.top - thumbH / 2;
      top = Math.max(0, Math.min(maxTop, top));

      const ratio = maxTop > 0 ? top / maxTop : 0;
      const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);

      scrollEl.scrollTop = maxScroll * ratio;
      thumb.style.top = `${top}px`;
    };

    track.addEventListener("pointerdown", (e) => {
      dragging = true;
      track.setPointerCapture?.(e.pointerId);
      moveThumb(e.clientY);
    });

    track.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      moveThumb(e.clientY);
    });

    track.addEventListener("pointerup", (e) => {
      dragging = false;
      track.releasePointerCapture?.(e.pointerId);
    });

    track.addEventListener("pointercancel", () => {
      dragging = false;
    });

    scrollEl.addEventListener("scroll", syncDialThumb, { passive: true });
    window.addEventListener("resize", syncDialThumb);

    syncDialThumb();
  }

  // ============================================================
  // SEARCH
  // ============================================================

  function flattenEntries() {
    const rows = [];
    for (const work of STATE.works) {
      for (const entry of work.entries || []) {
        rows.push({
          workSlug: work.slug,
          workLabel: work.display || titleCaseSlug(work.slug),
          entrySlug: entry.slug,
          entryLabel: entry.subtitle || titleCaseSlug(entry.slug),
          searchKey: normalizeKey(
            `${work.display || work.slug} ${entry.subtitle || entry.slug} ${entry.slug}`
          )
        });
      }
    }
    return rows;
  }

  function renderSearchResults(items) {
    const results = byId("chapterSearchResults");
    const stat = byId("chapterSearchStat");
    if (!results || !stat) return;

    if (!items.length) {
      results.innerHTML = "";
      stat.textContent = STATE.isMobileReader ? "Type to search" : "No matches yet";
      return;
    }

    stat.textContent = `${items.length} quick jump${items.length === 1 ? "" : "s"}`;
    results.innerHTML = items.map(item => `
      <button class="search-result-pill" type="button" data-dir="${escapeHtml(item.workSlug)}" data-file="${escapeHtml(item.entrySlug)}">
        ${escapeHtml(item.workLabel)} · ${escapeHtml(item.entryLabel)}
      </button>
    `).join("");
  }

  function syncSearchSeed() {
    const input = byId("chapterSearchInput");
    const stat = byId("chapterSearchStat");
    const results = byId("chapterSearchResults");
    if (!input || !stat || !results) return;
    if (input.value.trim()) return;

    if (STATE.isMobileReader) {
      results.innerHTML = "";
      stat.textContent = "Type to search";
      return;
    }

    const seeded = flattenEntries()
      .filter(item => item.workSlug === STATE.currentWork?.slug)
      .slice(0, CONFIG.searchResultsLimit);

    renderSearchResults(seeded);
  }

  function wireSearch() {
    if (STATE.searchWired) return;
    STATE.searchWired = true;

    const input = byId("chapterSearchInput");
    if (!input) return;

    input.addEventListener("input", () => {
      const q = normalizeKey(input.value);
      if (!q) {
        syncSearchSeed();
        return;
      }

      const matches = flattenEntries()
        .filter(item => item.searchKey.includes(q))
        .slice(0, CONFIG.searchResultsLimit);

      renderSearchResults(matches);
    });

    document.addEventListener("click", async (e) => {
      const btn = e.target instanceof Element ? e.target.closest(".search-result-pill") : null;
      if (!btn) return;

      const dir = btn.getAttribute("data-dir") || "";
      const file = btn.getAttribute("data-file") || "";
      if (!dir || !file) return;

      await switchEntry(dir, file, false, { actionSource: "search" });
    });
  }

  // ============================================================
  // WORK NAV
  // ============================================================

  function isCurrentWorkSlug(slug) {
    return normalizeKey(slug) === normalizeKey(STATE.currentWork?.slug);
  }

  function isCurrentEntrySlug(slug) {
    return normalizeKey(slug) === normalizeKey(STATE.currentEntry?.slug);
  }

  function renderDesktopWorksNav() {
    const strip = byId("topWorksStrip");
    if (!strip) return;

    strip.innerHTML = STATE.works.map(work => {
      const entries = Array.isArray(work.entries) ? work.entries : [];
      const isActive = isCurrentWorkSlug(work.slug);
      const links = entries.map(entry => `
        <button class="topworks-link ${isCurrentEntrySlug(entry.slug) ? "active" : ""}" type="button"
          data-dir="${escapeHtml(work.slug)}" data-file="${escapeHtml(entry.slug)}">
          ${escapeHtml(entry.subtitle || titleCaseSlug(entry.slug))}
        </button>
      `).join("");

      return `
        <div class="topworks-item ${isActive ? "active" : ""}">
          <button class="topworks-trigger" type="button">
            <span>${escapeHtml(work.display || titleCaseSlug(work.slug))}</span>
            <span class="topworks-caret" aria-hidden="true"></span>
          </button>
          <div class="topworks-flyout">
            <div class="topworks-links">${links}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderMobileWorksNav() {
    const nav = byId("worksNav");
    if (!nav || !STATE.isMobileReader) return;

    nav.innerHTML = STATE.works.map(work => {
      const entries = Array.isArray(work.entries) ? work.entries : [];
      const open = normalizeKey(STATE.mobileOpenWorkSlug) === normalizeKey(work.slug);

      const entryLinks = entries.map(entry => `
        <button class="mobile-chapter-link ${isCurrentEntrySlug(entry.slug) ? "active" : ""}" type="button"
          data-dir="${escapeHtml(work.slug)}" data-file="${escapeHtml(entry.slug)}">
          ${escapeHtml(entry.subtitle || titleCaseSlug(entry.slug))}
        </button>
      `).join("");

      return `
        <div class="mobile-work ${isCurrentWorkSlug(work.slug) ? "active" : ""} ${open ? "open" : ""}">
          <button class="mobile-work-trigger" type="button" data-dir="${escapeHtml(work.slug)}">
            ${escapeHtml(work.display || titleCaseSlug(work.slug))}
          </button>
          <div class="mobile-chapter-list">${entryLinks}</div>
        </div>
      `;
    }).join("");

    syncDialThumb();
  }

  function renderWorksNav() {
    renderDesktopWorksNav();
    renderMobileWorksNav();
  }

  function wireTopFlyouts() {
    if (STATE.topFlyoutsWired) return;
    STATE.topFlyoutsWired = true;

    document.addEventListener("click", async (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const trigger = target.closest(".topworks-trigger");
      if (trigger) {
        const item = trigger.closest(".topworks-item");
        if (item) {
          $$(".topworks-item.open").forEach(el => {
            if (el !== item) el.classList.remove("open");
          });
          item.classList.toggle("open");
        }
        return;
      }

      const link = target.closest(".topworks-link");
      if (link) {
        const dir = link.getAttribute("data-dir") || "";
        const file = link.getAttribute("data-file") || "";
        if (dir && file) {
          await switchEntry(dir, file, false, { actionSource: "topworks" });
        }
        return;
      }

      if (!target.closest(".topworks-item")) {
        $$(".topworks-item.open").forEach(el => el.classList.remove("open"));
      }
    });
  }

  function wireMobileWorksNav() {
    if (!STATE.isMobileReader || STATE.mobileWorksWired) return;
    STATE.mobileWorksWired = true;

    document.addEventListener("click", async (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const workTrigger = target.closest(".mobile-work-trigger");
      if (workTrigger) {
        STATE.mobileOpenWorkSlug = workTrigger.getAttribute("data-dir") || "";
        renderMobileWorksNav();
        return;
      }

      const chapterLink = target.closest(".mobile-chapter-link");
      if (chapterLink) {
        const dir = chapterLink.getAttribute("data-dir") || "";
        const file = chapterLink.getAttribute("data-file") || "";
        if (dir && file) {
          await switchEntry(dir, file, false, { actionSource: "mobile-nav" });
        }
      }
    });
  }

  // ============================================================
  // STICKY CONTROLS / PROGRESS
  // ============================================================

  function updateChapterProgress(progress) {
    const pct = Math.max(0, Math.min(1, Number(progress) || 0));
    const fill = byId("chapterProgressFill");
    const label = byId("chapterProgressLabel");
    const topBar = byId("pageProgressBar");

    if (fill) fill.style.width = `${pct * 100}%`;
    if (topBar) topBar.style.width = `${pct * 100}%`;
    if (label) {
      const chapterPos = getCurrentChapterPosition();
      label.textContent = `Chapter ${chapterPos} · ${Math.round(pct * 100)}%`;
    }
  }

  function maybePreloadNextChapter() {
    if (STATE.nextPrefetch) return;

    const { next } = getEntryContext();
    if (!next || !STATE.currentWork) return;

    const nextUrl = getItemJsonUrl(STATE.currentWork, next);
    STATE.nextPrefetch = nextUrl;

    fetch(nextUrl, { cache: "force-cache" }).catch(() => {});
  }

  function maybeServeVisibleReaderAds() {
    refreshVisibleRailSlots();
    refreshVisibleTopBanner();
    refreshVisibleBetweenSlots();
  }

  function wireProgressWatch() {
    if (STATE.progressWatchWired) return;
    STATE.progressWatchWired = true;

    const onScroll = () => {
      if (STATE.scrollTicking) return;
      STATE.scrollTicking = true;

      window.requestAnimationFrame(() => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const progress = scrollable > 0 ? window.scrollY / scrollable : 0;

        updateChapterProgress(progress);

        if (progress >= CONFIG.readProgressPrefetch) {
          maybePreloadNextChapter();
        }

        if (progress >= CONFIG.bottomGlowProgress && !STATE.bottomGlowTriggered) {
          STATE.bottomGlowTriggered = true;
          burstServeAds();
        }

        maybeServeVisibleReaderAds();
        STATE.scrollTicking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function wireStickyControls() {
    if (STATE.stickyControlsWired) return;
    STATE.stickyControlsWired = true;

    const topBtn = byId("scrollToSearchBtn");
    const bottomBtn = byId("scrollToBottomTraversalBtn");

    if (topBtn) {
      topBtn.addEventListener("click", () => {
        scrollToSearchBar();
      });
    }

    if (bottomBtn) {
      bottomBtn.addEventListener("click", () => {
        const bottom = byId("readerBottomAnchor") || byId("readerBottomTraversal") || byId("reader");
        if (bottom) bottom.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }

  function showRetentionToast(text) {
    const toast = byId("retentionToast");
    if (!toast) return;

    toast.textContent = text;
    toast.classList.add("show");

    if (STATE.retentionToastTimer) {
      clearTimeout(STATE.retentionToastTimer);
    }

    STATE.retentionToastTimer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, 1800);
  }

  // ============================================================
  // READER BUILDERS
  // ============================================================

  function buildTraversal(position = "bottom") {
    const wrap = createEl("div", `traversal traversal-${position}`);
    if (position === "bottom") wrap.id = "readerBottomTraversal";

    const { prev, next } = getEntryContext();

    if (prev) {
      const prevBtn = createEl("button", "traversal-pill", `← ${prev.subtitle || titleCaseSlug(prev.slug)}`);
      prevBtn.type = "button";
      prevBtn.dataset.dir = STATE.currentWork.slug;
      prevBtn.dataset.file = prev.slug;
      wrap.appendChild(prevBtn);
    }

    const backBtn = createEl("button", "traversal-pill", "Jump to Search");
    backBtn.type = "button";
    backBtn.id = position === "top" ? "scrollToSearchBtnInternalTop" : "scrollToSearchBtnInternalBottom";
    backBtn.addEventListener("click", scrollToSearchBar);
    wrap.appendChild(backBtn);

    if (next) {
      const nextBtn = createEl("button", "traversal-pill", `${next.subtitle || titleCaseSlug(next.slug)} →`);
      nextBtn.type = "button";
      nextBtn.dataset.dir = STATE.currentWork.slug;
      nextBtn.dataset.file = next.slug;
      wrap.appendChild(nextBtn);
    }

    return wrap;
  }

  function buildRecommendationWidget() {
    if (STATE.isMobileReader) return null;

    const mount = createEl("div", "recommend-shell");
    mount.innerHTML = `
      <div class="recommend-title">You may also like</div>
      <div id="desktopRecommendMount" class="slot recommend-mount"></div>
    `;
    const target = mount.querySelector("#desktopRecommendMount");
    if (target) {
      target.appendChild(makeSpecialIns(SPECIAL_ZONES.desktopRecommend.zoneId, SPECIAL_ZONES.desktopRecommend.className));
    }
    return mount;
  }

  function imageBlock(src, alt, pageNumber) {
    const wrap = createEl("div", "image-wrap");
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = src;
    img.alt = alt || `Page ${pageNumber}`;
    img.dataset.pageNumber = String(pageNumber);
    wrap.appendChild(img);
    return wrap;
  }

  function betweenAd(manifest, groupNumber, betweenSlots) {
    const subids = getSubids(manifest);

    const shell = createEl("div", "between-shell");
    const grid = createEl("div", "between-grid");

    const slotsToRender = Math.max(1, betweenSlots || 1);

    for (let i = 0; i < slotsToRender; i += 1) {
      const slot = createEl("div", "between-slot slot");
      slot.dataset.zoneId = String(ZONES.betweenMulti);
      slot.dataset.sub = String(subids.between);
      slot.dataset.sub2 = String(subids.work);
      slot.dataset.sub3 = String(groupNumber * 100 + i + 1);
      grid.appendChild(slot);
    }

    shell.appendChild(grid);
    return shell;
  }

  function endAds(manifest, count) {
    const subids = getSubids(manifest);
    const shell = createEl("div", "end-shell");
    const grid = createEl("div", "end-grid");

    const total = Math.max(1, count || CONFIG.bottomAdCount);

    for (let i = 0; i < total; i += 1) {
      const slot = createEl("div", "between-slot slot");
      slot.dataset.zoneId = String(ZONES.betweenMulti);
      slot.dataset.sub = String(subids.between);
      slot.dataset.sub2 = String(subids.work);
      slot.dataset.sub3 = String(9000 + i + 1);
      grid.appendChild(slot);
    }

    shell.appendChild(grid);
    return shell;
  }

  // ============================================================
  // READER BUILD / NAVIGATION
  // ============================================================

  function shouldShowInterstitial(dir, file, options = {}) {
    if (options.skipInterstitial) return false;

    const selection = resolveSelection(dir, file);
    if (!selection) return false;

    const entries = Array.isArray(selection.work?.entries) ? selection.work.entries : [];
    const targetIndex = entries.findIndex(entry => normalizeKey(entry.slug) === normalizeKey(file));

    if (targetIndex < 3) return false;

    const isDifferentChapter =
      normalizeKey(dir) !== normalizeKey(STATE.currentWork?.slug) ||
      normalizeKey(file) !== normalizeKey(STATE.currentEntry?.slug);

    if (!isDifferentChapter) return false;
    return true;
  }

  async function buildReader() {
    const reader = byId("reader");
    if (!reader) return;

    const token = ++STATE.buildToken;

    STATE.nextPrefetch = null;
    STATE.bottomGlowTriggered = false;
    updateChapterProgress(0);

    const state = getQueryState();
    let resolved = resolveSelection(state.dir, state.file);

    if (!resolved) {
      const first = getFirstEntry();
      resolved = first.work && first.entry ? first : null;
      if (resolved) setQueryState(resolved.work.slug, resolved.entry.slug, true);
    }

    if (!resolved) throw new Error("No works found in library.json");

    STATE.currentWork = resolved.work;
    STATE.currentEntry = resolved.entry;

    if (STATE.isMobileReader) {
      STATE.mobileOpenWorkSlug = resolved.work.slug;
    }

    const itemUrl = getItemJsonUrl(resolved.work, resolved.entry);
    const manifest = await fetchJson(itemUrl);
    if (token !== STATE.buildToken) return;

    STATE.currentItem = manifest;

    const images = buildImageList(manifest);
    const base = normalizeBaseUrl(manifest.base_url);
    if (!base) throw new Error(`Manifest for ${resolved.entry.slug} is missing base_url`);
    if (!images.length) throw new Error(`Manifest for ${resolved.entry.slug} has no images`);

    const workTitleEl = byId("workTitle");
    if (workTitleEl) {
      workTitleEl.textContent = `${resolved.work.display || titleCaseSlug(resolved.work.slug)} · ${manifest.subtitle || resolved.entry.subtitle || titleCaseSlug(resolved.entry.slug)}`;
    }

    renderWorksNav();
    syncSearchSeed();

    const subids = getSubids(manifest);
    const adConfig = getManifestAds(manifest);

    if (!STATE.isMobileReader) {
      fillSlot(byId("topBannerSlot"), ZONES.topBanner, subids.top, subids.work, 1);
      fillRailStacks(subids);
      scheduleVideoSlider();
      positionDesktopStickyAwayFromVideo();
    } else {
      clearDesktopAdShells();
      await loadMobileStickyBanner();
    }

    reader.innerHTML = "";

    const topAnchor = createEl("span", "reader-anchor");
    topAnchor.id = "readerTopAnchor";
    reader.appendChild(topAnchor);

    const contentAnchor = createEl("span", "reader-anchor");
    contentAnchor.id = "readerContentStartAnchor";
    reader.appendChild(contentAnchor);

    reader.appendChild(buildTraversal("top"));

    let groupNumber = 0;
    const betweenEvery = adConfig.betweenEvery;
    const betweenSlots = adConfig.betweenSlots;
    const finalBlock = adConfig.finalBlock;

    images.forEach((imageName, index) => {
      const pageNumber = index + 1;
      const imageUrl = `${base}/${encodeURIComponent(imageName)}`;
      reader.appendChild(imageBlock(imageUrl, `Page ${pageNumber}`, pageNumber));

      const shouldInsertBetween =
        betweenEvery > 0 &&
        pageNumber % betweenEvery === 0 &&
        pageNumber < images.length;

      if (shouldInsertBetween) {
        groupNumber += 1;
        reader.appendChild(betweenAd(manifest, groupNumber, betweenSlots));
      }
    });

    if (finalBlock > 0) {
      reader.appendChild(endAds(manifest, finalBlock));
    }

    reader.appendChild(buildTraversal("bottom"));

    const recommend = buildRecommendationWidget();
    if (recommend) {
      reader.appendChild(recommend);
      await ensureAdProviderScript(SPECIAL_ZONES.desktopRecommend.host);
    }

    const bottomAnchor = createEl("span", "reader-anchor");
    bottomAnchor.id = "readerBottomAnchor";
    reader.appendChild(bottomAnchor);

    setupAdVisibilityObserver();
    serveAds(true);
    startRefreshTimers();
    updateChapterProgress(0);

    window.setTimeout(() => serveAds(true), 900);

    if (STATE.isMobileReader) syncDialThumb();
  }

  async function switchEntry(dir, file, replace = false, options = {}) {
    const { actionSource = "unknown" } = options;

    if (shouldShowInterstitial(dir, file, options)) {
      await fireChapterInterstitial();
    }

    setQueryState(dir, file, replace);

    if (actionSource) burstServeAds();

    await buildReader();

    if (actionSource) {
      window.setTimeout(() => burstServeAds(), 600);
    }

    scrollToReaderContentStartInstant();
    showRetentionToast(`Now reading: ${STATE.currentEntry?.subtitle || titleCaseSlug(file)}`);
  }

  // ============================================================
  // EVENTS
  // ============================================================

  function wireDocumentVisibility() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;

      serveAds(true);
      window.setTimeout(() => {
        refreshVisibleTopBanner();
        refreshVisibleRailSlots();
        refreshVisibleBetweenSlots();
        refreshMobileSticky();
      }, 400);
    });
  }

  function wireReaderClickMonetization() {
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const hotSelectors = [
        ".image-wrap img",
        ".topworks-link",
        ".topworks-trigger",
        ".search-result-pill",
        ".traversal-pill",
        ".mobile-work-trigger",
        ".mobile-chapter-link",
        "#scrollToSearchBtn",
        "#scrollToBottomTraversalBtn"
      ];

      if (hotSelectors.some(sel => target.closest(sel))) {
        burstServeAds();
      }

      const traversal = target.closest(".traversal-pill");
      if (traversal) {
        const dir = traversal.getAttribute("data-dir") || "";
        const file = traversal.getAttribute("data-file") || "";
        if (dir && file) {
          switchEntry(dir, file, false, { actionSource: "traversal" }).catch(console.error);
        }
      }
    }, { passive: true });
  }

  // ============================================================
  // BOOT
  // ============================================================

  async function boot() {
    await Promise.all([
      ensureAdProviderScript("https://a.magsrv.com/ad-provider.js"),
      ensureAdProviderScript("https://a.pemsrv.com/ad-provider.js")
    ]);

    await loadLibrary();

    wireTopFlyouts();
    wireStickyControls();
    wireProgressWatch();
    wireSearch();
    wireMobileWorksNav();
    wireMobileDial();
    wireDocumentVisibility();
    wireReaderClickMonetization();

    await buildReader();

    window.addEventListener("popstate", async () => {
      await buildReader();
      scrollToReaderContentStartInstant();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    boot().catch(err => {
      console.error(err);
      clearRefreshTimers();

      const workTitleEl = byId("workTitle");
      if (workTitleEl) workTitleEl.textContent = "Failed to load work";

      const reader = byId("reader");
      if (reader) {
        reader.innerHTML = `
          <div class="note">
            Failed to load this work. Please check library.json, sources, item.json, base_url, and image filenames.
          </div>
        `;
      }
    });
  });
})();
