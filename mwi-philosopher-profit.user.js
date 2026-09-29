// ==UserScript==
// @name         银河奶牛放置 - 贤者利润页签
// @namespace    top.milkonomy.philosopher
// @version      0.1.7
// @description  在游戏内加入贤者页签，按官方市场快照筛选正利润来源，并用打开市场后收到的实时盘口重算末步材料成本。
// @author       Milkonomy
// @match        https://www.milkywayidle.com/*
// @match        https://milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://milkywayidlecn.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://test.milkywayidlecn.com/*
// @require      https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const SCRIPT_VERSION = "0.1.7";
  const STORAGE_KEY = "__milkonomy_philosopher_tab_v1__";
  const TAB_ATTRIBUTE = "data-milkonomy-philosopher-tab";
  const PANEL_ID = "milkonomy-philosopher-panel";
  const STYLE_ID = "milkonomy-philosopher-style";
  const STATUS_ID = "milkonomy-philosopher-status";
  const STONE_HRID = "/items/philosophers_stone";
  const COIN_HRID = "/items/coin";
  const TAX_FACTOR = 0.96;
  const MANUFACTURE_ACTIONS = ["cheesesmithing", "crafting", "tailoring"];
  const CATALYSTS = {
    1: {
      transmute: "/items/catalyst_of_transmutation",
      decompose: "/items/catalyst_of_decomposition"
    },
    2: {
      transmute: "/items/prime_catalyst",
      decompose: "/items/prime_catalyst"
    }
  };

  const state = loadState();
  const runtime = {
    active: false,
    loading: true,
    loadingStage: "正在读取游戏基础数据…",
    error: "",
    gameData: null,
    snapshot: null,
    snapshotLoadedAt: 0,
    livePrices: {},
    rows: [],
    tabBar: null,
    tabPanelsContainer: null,
    tabButton: null,
    panel: null,
    hiddenPanelClasses: [],
    boundNativeTabs: new WeakSet(),
    itemSpriteBase: "",
    capturedMessageEvents: new WeakSet(),
    renderQueued: false
  };
  let cachedGameDataPayload = null;
  let cachedGameData = null;
  let rejectedGameDataPayload = null;

  installWebSocketObserver();
  installStyles();
  start();

  async function start() {
    await waitForDocument();
    observeGameUi();
    ensureTab();
    installMountHeartbeat();

    try {
      runtime.gameData = await waitForGameData();
      discoverItemSprite();
      runtime.loadingStage = "正在读取市场快照…";
      await refreshSnapshot();
      runtime.error = "";
    } catch (error) {
      console.error("[贤者利润] 初始化失败", error);
      runtime.error = error instanceof Error ? error.message : String(error);
    } finally {
      runtime.loading = false;
      recalculate();
      renderPanel();
    }
  }

  function loadState() {
    const defaults = {
      settings: {
        catalystRank: -1,
        includeTax: true,
        includeRare: true,
        useCraftCost: true,
        positiveOnly: true,
        alchemyLevel: 120,
        successBonusPercent: 0,
        rareBonusPercent: 0,
        essenceBonusPercent: 0,
        artisanPercent: 0
      },
      expanded: {}
    };

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return {
        ...defaults,
        ...(saved && typeof saved === "object" ? saved : {}),
        settings: {
          ...defaults.settings,
          ...(saved?.settings && typeof saved.settings === "object" ? saved.settings : {})
        },
        expanded: saved?.expanded && typeof saved.expanded === "object" ? saved.expanded : {}
      };
    } catch {
      return defaults;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("[贤者利润] 保存设置失败", error);
    }
  }

  function waitForDocument() {
    if (document.documentElement) return Promise.resolve();
    return new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }

  function observeGameUi() {
    const observer = new MutationObserver(() => {
      ensureTab();
      if (!runtime.itemSpriteBase && discoverItemSprite()) queueRender();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function installMountHeartbeat() {
    let attempts = 0;
    const tick = () => {
      attempts++;
      ensureTab();
      if (runtime.tabButton?.isConnected && runtime.panel?.isConnected) {
        removeMountStatus();
        return;
      }
      if (attempts >= 2) showMountStatus();
    };
    // 游戏和其它插件都可能在稍后整块替换角色页签 DOM；持续巡检可在替换后自动重挂载。
    window.setInterval(tick, 1000);
  }

  function showMountStatus() {
    if (!document.body || document.getElementById(STATUS_ID)) return;
    const status = document.createElement("button");
    status.id = STATUS_ID;
    status.type = "button";
    status.textContent = `贤者脚本 ${SCRIPT_VERSION} 已运行 · 请打开库存页`;
    status.title = "贤者页签只会显示在“库存 / 装备 / 技能”这一组角色管理页签中；点击可再次尝试挂载。";
    status.addEventListener("click", () => {
      ensureTab();
      if (runtime.tabButton?.isConnected) setActive(true);
    });
    document.body.appendChild(status);
  }

  function removeMountStatus() {
    document.getElementById(STATUS_ID)?.remove();
  }

  function ensureTab() {
    const found = findGameTabBar();
    if (!found) return;

    const { tabBar, tabPanelsContainer, nativeTabs, nativePanels, hiddenPanelClasses } = found;
    const existingButton = tabBar.querySelector(`[${TAB_ATTRIBUTE}="true"]`);
    const existingPanel = tabPanelsContainer.querySelector(`#${PANEL_ID}`);

    if (existingButton && existingPanel) {
      runtime.tabBar = tabBar;
      runtime.tabPanelsContainer = tabPanelsContainer;
      runtime.tabButton = existingButton;
      runtime.panel = existingPanel;
      runtime.hiddenPanelClasses = hiddenPanelClasses;
      bindNativeTabs(nativeTabs, nativePanels);
      removeMountStatus();
      return;
    }
    if (existingButton && !existingPanel) existingButton.remove();
    if (existingPanel && !existingButton) existingPanel.remove();

    const template = nativeTabs[0];
    const panelTemplate = nativePanels[0];
    if (!template || !panelTemplate) return;
    const button = cloneTabButton(template);
    button.setAttribute(TAB_ATTRIBUTE, "true");
    button.setAttribute("aria-label", "贤者利润");
    button.title = "贤者利润";
    button.addEventListener("click", () => setActive(true));

    const panel = panelTemplate.cloneNode(false);
    panel.id = PANEL_ID;
    panel.classList.add("mpp-native-panel");
    panel.setAttribute("data-milkonomy-philosopher-panel", "true");
    panel.style.height = "auto";
    panel.style.maxHeight = "none";
    panel.style.padding = "0";
    panel.addEventListener("click", handlePanelClick);
    panel.addEventListener("change", handlePanelChange);

    template.parentElement.appendChild(button);
    panelTemplate.parentElement.appendChild(panel);
    runtime.tabBar = tabBar;
    runtime.tabPanelsContainer = tabPanelsContainer;
    runtime.tabButton = button;
    runtime.panel = panel;
    runtime.hiddenPanelClasses = hiddenPanelClasses;
    bindNativeTabs(nativeTabs, nativePanels);
    removeMountStatus();
    if (runtime.active) activatePhilosopherTab();
    else {
      setButtonSelected(button, false);
      hideTabPanel(panel);
    }
    renderPanel();
  }

  function findGameTabBar() {
    const roots = [...document.querySelectorAll('[class*="CharacterManagement_tabsComponentContainer"]')];
    for (const root of roots) {
      const tabBar = root.querySelector('[class*="TabsComponent_tabsContainer"]');
      const tabPanelsContainer = root.querySelector('[class*="TabsComponent_tabPanelsContainer"]');
      if (!tabBar || !tabPanelsContainer) continue;
      const nativeTabs = [...tabBar.querySelectorAll("button")]
        .filter(button => !button.hasAttribute(TAB_ATTRIBUTE));
      const nativePanels = [...tabPanelsContainer.querySelectorAll('[class*="TabPanel_tabPanel"]')]
        .filter(panel => panel.id !== PANEL_ID);
      if (!nativeTabs.length || !nativePanels.length) continue;
      const hiddenPanelClasses = [...new Set(nativePanels.flatMap(panel => [...panel.classList])
        .filter(className => className.includes("TabPanel_hidden")))];
      return { root, tabBar, tabPanelsContainer, nativeTabs, nativePanels, hiddenPanelClasses };
    }
    return null;
  }

  function cloneTabButton(template) {
    const button = template.cloneNode(true);
    button.removeAttribute("id");
    button.removeAttribute("aria-controls");
    button.removeAttribute("aria-selected");
    button.removeAttribute("data-state");

    (button.children[0] || button).textContent = "贤者";
    return button;
  }

  function ensurePanel() {
    if (runtime.panel?.isConnected) return runtime.panel;
    ensureTab();
    return runtime.panel?.isConnected ? runtime.panel : null;
  }

  function setActive(active) {
    runtime.active = active;
    if (!ensurePanel()) return;
    if (active) activatePhilosopherTab();
    else {
      setButtonSelected(runtime.tabButton, false);
      hideTabPanel(runtime.panel);
    }
    if (active) renderPanel();
  }

  function bindNativeTabs(nativeTabs, nativePanels) {
    nativeTabs.forEach((button, index) => {
      if (runtime.boundNativeTabs.has(button)) return;
      runtime.boundNativeTabs.add(button);
      button.addEventListener("click", () => {
        if (!runtime.tabButton?.isConnected || !runtime.panel?.isConnected) return;
        runtime.active = false;
        setButtonSelected(runtime.tabButton, false);
        hideTabPanel(runtime.panel);
        nativeTabs.forEach((nativeButton, nativeIndex) => {
          setButtonSelected(nativeButton, nativeIndex === index);
          const nativePanel = nativePanels[nativeIndex];
          if (nativePanel) {
            if (nativeIndex === index) showTabPanel(nativePanel);
            else hideTabPanel(nativePanel);
          }
        });
      }, true);
    });
  }

  function activatePhilosopherTab() {
    if (!runtime.tabBar || !runtime.tabPanelsContainer || !runtime.tabButton || !runtime.panel) return;
    runtime.tabBar.querySelectorAll("button").forEach(button => setButtonSelected(button, button === runtime.tabButton));
    runtime.tabPanelsContainer.querySelectorAll('[class*="TabPanel_tabPanel"]').forEach((panel) => {
      if (panel === runtime.panel) showTabPanel(panel);
      else hideTabPanel(panel);
    });
  }

  function setButtonSelected(button, selected) {
    if (!button) return;
    button.classList.toggle("Mui-selected", selected);
    button.classList.toggle("milkonomy-philosopher-tab-active", selected && button === runtime.tabButton);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }

  function hideTabPanel(panel) {
    if (!panel) return;
    panel.hidden = true;
    runtime.hiddenPanelClasses.forEach(className => panel.classList.add(className));
  }

  function showTabPanel(panel) {
    if (!panel) return;
    runtime.hiddenPanelClasses.forEach(className => panel.classList.remove(className));
    panel.hidden = false;
  }

  async function waitForGameData() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10000) {
      const data = readGameData();
      if (data?.itemDetailMap && data?.actionDetailMap) return data;
      await delay(250);
    }
    throw new Error("10 秒内未读到游戏基础数据，请确认页面已完成登录后刷新");
  }

  function readGameData() {
    const packed = localStorage.getItem("initClientData");
    if (!packed) return null;
    if (packed === cachedGameDataPayload) return cachedGameData;
    if (packed === rejectedGameDataPayload) return null;
    try {
      const parsed = JSON.parse(packed);
      cachedGameDataPayload = packed;
      cachedGameData = parsed;
      return parsed;
    } catch {
      try {
        const decoder = globalThis.LZString?.decompressFromUTF16 || decompressFromUTF16;
        const decoded = decoder(packed);
        const parsed = decoded ? JSON.parse(decoded) : null;
        if (parsed) {
          cachedGameDataPayload = packed;
          cachedGameData = parsed;
          return parsed;
        }
      } catch {
        // 同一份损坏数据不再每 250ms 重复解压。
      }
      rejectedGameDataPayload = packed;
      return null;
    }
  }

  async function refreshSnapshot() {
    const cached = readCachedMarketSnapshot();
    if (!runtime.snapshot && cached) {
      runtime.snapshot = cached;
      runtime.snapshotLoadedAt = Date.now();
      runtime.loading = false;
      recalculate();
      renderPanel();
    }
    const isBlocking = !runtime.snapshot;
    runtime.loading = isBlocking;
    runtime.loadingStage = isBlocking ? "正在读取市场快照…" : "";
    renderPanel();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch("/game_data/marketplace.json", {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`市场接口返回 ${response.status}`);
      const data = await response.json();
      if (typeof data?.timestamp !== "number" || !data?.marketData) {
        throw new Error("官方市场数据格式不正确");
      }
      runtime.snapshot = data;
      runtime.snapshotLoadedAt = Date.now();
      runtime.error = "";
    } catch (error) {
      runtime.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      clearTimeout(timeout);
      runtime.loading = false;
      runtime.loadingStage = "";
    }
  }

  function readCachedMarketSnapshot() {
    try {
      const mwiTools = JSON.parse(localStorage.getItem("MWITools_marketAPI_json") || "null");
      if (mwiTools?.marketData && Object.keys(mwiTools.marketData).length) {
        return {
          ...mwiTools,
          timestamp: normalizeTimestamp(mwiTools.timestamp)
        };
      }
    } catch (error) {
      console.warn("[贤者利润] MWITools 市场缓存格式无效", error);
    }

    try {
      const mwiCore = JSON.parse(localStorage.getItem("MWICore_marketData") || "null");
      if (!mwiCore || typeof mwiCore !== "object") return null;
      const marketData = {};
      for (const [key, price] of Object.entries(mwiCore)) {
        const separator = key.lastIndexOf(":");
        if (separator <= 0) continue;
        const hrid = key.slice(0, separator);
        const level = Number(key.slice(separator + 1));
        if (!Number.isInteger(level) || level < 0 || level > 20) continue;
        marketData[hrid] ||= {};
        marketData[hrid][String(level)] = {
          a: finite(price?.ask, -1),
          b: finite(price?.bid, -1)
        };
      }
      if (Object.keys(marketData).length) {
        return { timestamp: Math.floor(Date.now() / 1000), marketData };
      }
    } catch (error) {
      console.warn("[贤者利润] MWICore 市场缓存格式无效", error);
    }
    return null;
  }

  function normalizeTimestamp(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return Math.floor(Date.now() / 1000);
    return Math.floor(timestamp >= 1e12 ? timestamp / 1000 : timestamp);
  }

  function recalculate() {
    if (!runtime.gameData || !runtime.snapshot) {
      runtime.rows = [];
      return;
    }

    const rows = [];
    for (const item of Object.values(runtime.gameData.itemDetailMap)) {
      if (!item?.isTradable || !item.alchemyDetail) continue;
      const alchemy = item.alchemyDetail;
      let method = null;
      if (alchemy.transmuteDropTable?.some(drop => drop.itemHrid === STONE_HRID)) {
        method = "transmute";
      } else if (alchemy.decomposeItems?.some(drop => drop.itemHrid === STONE_HRID)) {
        method = "decompose";
      }
      if (!method) continue;

      const sourceMarket = getBaseAsk(item.hrid);
      const craft = getFinalStepCraft(item.hrid);
      const useCraft = Boolean(state.settings.useCraftCost && craft && craft.total > 0);
      const sourceCost = useCraft ? craft.total : sourceMarket.price;
      if (!(sourceCost > 0)) {
        rows.push({
          hrid: item.hrid,
          name: item.name || slugOf(item.hrid),
          item,
          method,
          sourceMarket,
          sourceCost: -1,
          useCraft: false,
          craft,
          unpriced: true,
          profit: null
        });
        continue;
      }

      const ranks = Number(state.settings.catalystRank) === -1
        ? [0, 1, 2]
        : [Number(state.settings.catalystRank)];
      let best = null;
      for (const rank of ranks) {
        const result = calculateStoneCost(item, method, rank, sourceCost);
        if (!result) continue;
        if (!best || result.costPerStone < best.costPerStone) best = result;
      }
      if (!best) continue;

      const stoneBid = getPrice(STONE_HRID, 0, "bid");
      const stoneNet = stoneBid > 0
        ? stoneBid * (state.settings.includeTax ? TAX_FACTOR : 1)
        : -1;
      const profit = stoneNet > 0 ? stoneNet - best.costPerStone : -Infinity;
      rows.push({
        ...best,
        hrid: item.hrid,
        name: item.name || slugOf(item.hrid),
        item,
        method,
        sourceMarket,
        sourceCost,
        useCraft,
        craft,
        stoneBid,
        profit,
        margin: best.costPerStone > 0 ? profit / best.costPerStone : -Infinity
      });
    }

    runtime.rows = rows.sort((a, b) => Number(b.unpriced || false) - Number(a.unpriced || false) || (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
  }

  function calculateStoneCost(item, method, rank, sourceCost) {
    const alchemy = item.alchemyDetail;
    const successRate = calculateSuccessRate(item, method, rank);
    const bulk = finite(alchemy.bulkMultiplier, 1);
    const taxFactor = state.settings.includeTax ? TAX_FACTOR : 1;
    const catalystHrid = rank ? CATALYSTS[rank]?.[method] : null;
    const catalystAsk = catalystHrid ? getPrice(catalystHrid, 0, "ask") : 0;
    if (catalystHrid && !(catalystAsk > 0)) return null;

    let sourceCount;
    let coinCost;
    let outputs;
    if (method === "transmute") {
      const selfDrop = alchemy.transmuteDropTable.find(drop => drop.itemHrid === item.hrid);
      const sameItemCounter = selfDrop
        ? Math.min(1, finite(selfDrop.maxCount, 0) * finite(selfDrop.dropRate, 1) * successRate)
        : 0;
      sourceCount = bulk * (1 - sameItemCounter);
      coinCost = bulk * Math.max(Math.floor(finite(item.sellPrice, 0) / 5), 50);
      outputs = alchemy.transmuteDropTable.map(drop => ({
        hrid: drop.itemHrid,
        count: (finite(drop.maxCount, finite(drop.minCount, 0)) - (drop.itemHrid === item.hrid ? finite(drop.maxCount, 0) : 0)) * bulk,
        rate: finite(drop.dropRate, 1)
      }));
    } else {
      sourceCount = bulk;
      coinCost = bulk * (50 + 5 * finite(item.itemLevel, 0));
      outputs = alchemy.decomposeItems.map(drop => ({
        hrid: drop.itemHrid,
        count: finite(drop.count, 0) * bulk,
        rate: 1
      }));
    }

    const catalystCost = catalystAsk * successRate;
    const totalCost = sourceCount * sourceCost + coinCost + catalystCost;
    const stoneOutput = outputs.find(output => output.hrid === STONE_HRID);
    const stonesPerAttempt = stoneOutput
      ? stoneOutput.count * stoneOutput.rate * successRate
      : 0;
    if (!(stonesPerAttempt > 0)) return null;

    let byproductIncome = 0;
    for (const output of outputs) {
      if (output.hrid === STONE_HRID || output.hrid === item.hrid) continue;
      const bid = getPrice(output.hrid, 0, "bid");
      if (bid > 0) byproductIncome += output.count * output.rate * successRate * bid * taxFactor;
    }
    if (state.settings.includeRare) {
      byproductIncome += calculateRareIncome(item, method, taxFactor);
    }

    const costPerStone = (totalCost - byproductIncome) / stonesPerAttempt;
    if (!Number.isFinite(costPerStone)) return null;
    return {
      rank,
      successRate,
      stonesPerAttempt,
      totalCost,
      byproductIncome,
      costPerStone,
      catalystHrid,
      catalystCost,
      coinCost,
      sourceCount
    };
  }

  function calculateSuccessRate(item, method, rank) {
    const base = method === "transmute" ? finite(item.alchemyDetail.transmuteSuccessRate, 0) : 0.6;
    const playerLevel = Math.max(1, finite(Number(state.settings.alchemyLevel), 120));
    const itemLevel = Math.max(1, finite(item.itemLevel, 1));
    const levelRatio = playerLevel >= itemLevel ? 0 : -0.9 * (1 - playerLevel / itemLevel);
    const successBonus = finite(Number(state.settings.successBonusPercent), 0) / 100;
    const catalystBonus = rank ? rank * 0.1 + 0.05 : 0;
    return Math.max(0, Math.min(1, base * (1 + levelRatio + successBonus + catalystBonus)));
  }

  function calculateRareIncome(item, method, taxFactor) {
    const action = runtime.gameData.actionDetailMap[`/actions/alchemy/${method}`];
    const timeCost = finite(action?.baseTimeCost, 0);
    if (!(timeCost > 0)) return 0;

    const hour = 3600e9;
    const minute = 60e9;
    const itemLevel = finite(item.itemLevel, 0);
    let crateHrid;
    let scale;
    if (itemLevel < 35) {
      crateHrid = "/items/small_artisans_crate";
      scale = (itemLevel + 100) / 100;
    } else if (itemLevel < 70) {
      crateHrid = "/items/medium_artisans_crate";
      scale = (itemLevel - 35 + 100) / 150;
    } else {
      crateHrid = "/items/large_artisans_crate";
      scale = (itemLevel - 70 + 100) / 200;
    }

    const rareBonus = 1 + finite(Number(state.settings.rareBonusPercent), 0) / 100;
    const essenceBonus = 1 + finite(Number(state.settings.essenceBonusPercent), 0) / 100;
    const crateExpected = timeCost / (8 * hour) * scale * rareBonus;
    const essenceExpected = timeCost / (6 * minute) * ((itemLevel + 100) / 100) * essenceBonus;
    const crateBid = getPrice(crateHrid, 0, "bid");
    const essenceBid = getPrice("/items/alchemy_essence", 0, "bid");
    return (crateBid > 0 ? crateExpected * crateBid * taxFactor : 0)
      + (essenceBid > 0 ? essenceExpected * essenceBid * taxFactor : 0);
  }

  function getFinalStepCraft(hrid) {
    const slug = slugOf(hrid);
    const artisanRate = Math.max(0, Math.min(1, finite(Number(state.settings.artisanPercent), 0) / 100));
    let best = null;

    for (const action of MANUFACTURE_ACTIONS) {
      const detail = runtime.gameData.actionDetailMap[`/actions/${action}/${slug}`];
      if (!detail) continue;
      const materials = [];
      let valid = true;

      if (detail.upgradeItemHrid) {
        const unitPrice = getPrice(detail.upgradeItemHrid, 0, "ask");
        if (!(unitPrice > 0)) valid = false;
        else materials.push({
          hrid: detail.upgradeItemHrid,
          baseCount: 1,
          count: 1,
          unitPrice,
          subtotal: unitPrice,
          artisanApplied: false
        });
      }

      for (const input of detail.inputItems || []) {
        const unitPrice = getPrice(input.itemHrid, 0, "ask");
        if (!(unitPrice > 0)) {
          valid = false;
          break;
        }
        const count = finite(input.count, 0) * (1 - artisanRate);
        materials.push({
          hrid: input.itemHrid,
          baseCount: finite(input.count, 0),
          count,
          unitPrice,
          subtotal: count * unitPrice,
          artisanApplied: true
        });
      }

      if (!valid || !materials.length) continue;
      const total = materials.reduce((sum, material) => sum + material.subtotal, 0);
      if (!best || total < best.total) best = { action, artisanRate, materials, total };
    }
    return best;
  }

  function getBaseAsk(hrid) {
    // 炼金来源按未强化物品计价；+0 无卖单时不能借用 +5/+10 的价格。
    return {
      price: getPrice(hrid, 0, "ask"),
      level: 0,
      live: Boolean(runtime.livePrices[hrid]?.["0"]?.capturedAt)
    };
  }

  function getPrice(hrid, level, side) {
    if (hrid === COIN_HRID) return 1;
    const liveLevel = runtime.livePrices[hrid]?.[String(level)];
    const live = liveLevel?.[side];
    // 已抓到实时盘口后，即使当前无挂单（-1）也不能回退到旧 API 快照。
    if (liveLevel && Number.isFinite(live)) return live;
    const raw = runtime.snapshot?.marketData?.[hrid]?.[String(level)];
    const value = side === "ask" ? (raw?.a ?? raw?.ask) : (raw?.b ?? raw?.bid);
    return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : -1;
  }

  function renderPanel() {
    const panel = ensurePanel();
    if (!panel || !runtime.active) return;

    const settings = state.settings;
    const stoneBid = getPrice(STONE_HRID, 0, "bid");
    const snapshotTime = runtime.snapshot?.timestamp
      ? new Date(runtime.snapshot.timestamp * 1000).toLocaleString()
      : "—";
    const liveCount = Object.keys(runtime.livePrices).length;
    const visibleRows = runtime.rows.filter(row => row.unpriced || !settings.positiveOnly || row.profit > 0);

    panel.innerHTML = `
      <div class="mpp-shell">
        <header class="mpp-header">
          <div>
            <strong>贤者利润</strong>
            <span>${visibleRows.length} 个${settings.positiveOnly ? "正利润或待核价" : "来源"}项目</span>
          </div>
          <div class="mpp-market-summary">
            <span>贤者石买一 <b>${formatPrice(stoneBid)}</b></span>
            <span>API ${escapeHtml(snapshotTime)}</span>
            <span class="mpp-live">实时盘口 ${liveCount} 项</span>
          </div>
        </header>
        <div class="mpp-toolbar">
          <label>催化剂
            <select data-setting="catalystRank">
              ${option(-1, "自动", settings.catalystRank)}
              ${option(0, "无", settings.catalystRank)}
              ${option(1, "普通", settings.catalystRank)}
              ${option(2, "至高", settings.catalystRank)}
            </select>
          </label>
          <label>炼金等级 <input data-setting="alchemyLevel" type="number" min="1" max="200" value="${numberAttr(settings.alchemyLevel)}"></label>
          <label>成功加成% <input data-setting="successBonusPercent" type="number" step="0.1" value="${numberAttr(settings.successBonusPercent)}"></label>
          <label>工匠节省% <input data-setting="artisanPercent" type="number" min="0" max="99" step="0.1" value="${numberAttr(settings.artisanPercent)}"></label>
          <label><input data-setting="includeTax" type="checkbox" ${settings.includeTax ? "checked" : ""}> 4%税</label>
          <label><input data-setting="includeRare" type="checkbox" ${settings.includeRare ? "checked" : ""}> 稀有/精华</label>
          <label><input data-setting="useCraftCost" type="checkbox" ${settings.useCraftCost ? "checked" : ""}> 末步自制成本</label>
          <label><input data-setting="positiveOnly" type="checkbox" ${settings.positiveOnly ? "checked" : ""}> 仅正利润</label>
          <button type="button" data-action="refresh" ${runtime.loading ? "disabled" : ""}>${runtime.loading ? "刷新中…" : "刷新API"}</button>
          <button type="button" data-action="close">关闭</button>
        </div>
        <div class="mpp-note">
          API 快照用于全量初筛；点击图标会打开游戏市场，收到实时盘口后自动重算。利润 = 贤者石买一税后价 − 单颗净成本；不含茶水与时间成本。
        </div>
        ${runtime.error ? `<div class="mpp-error">${escapeHtml(runtime.error)}</div>` : ""}
        <div class="mpp-table-wrap">
          <table class="mpp-table">
            <thead><tr>
              <th>来源</th><th>方式</th><th>成功率</th><th>石/次</th><th>来源成本</th><th>副产物抵扣</th><th>单颗净成本</th><th>利润</th><th>成本收益率</th>
            </tr></thead>
            <tbody>
              ${visibleRows.map(renderRow).join("") || `<tr><td colspan="9" class="mpp-empty">${runtime.loading ? escapeHtml(runtime.loadingStage || "正在读取数据…") : "当前设置下没有正利润项目"}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderRow(row) {
    const expanded = Boolean(state.expanded[row.hrid]);
    if (row.unpriced) {
      return `
        <tr class="mpp-main-row mpp-unpriced-row" title="+0 暂无卖单，来源成本和利润待核价">
          <td><div class="mpp-item-cell">
            <button type="button" class="mpp-icon-button" data-open-item="${escapeHtml(row.hrid)}" data-open-level="0" data-toggle-row="${escapeHtml(row.hrid)}" title="打开 +0 市场核价">${itemIconHtml(row.hrid)}</button>
            <button type="button" class="mpp-name-button" data-toggle-row="${escapeHtml(row.hrid)}"><span>${expanded ? "▾" : "▸"}</span>${escapeHtml(row.name)}</button>
          </div></td>
          <td>${row.method === "transmute" ? "转化" : "分解"}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
        </tr>
        ${expanded ? renderCraftRow(row) : ""}
      `;
    }
    const sourcePriceTitle = row.useCraft
      ? `末步材料成本 ${formatPrice(row.craft.total)}；来源市场最低卖一 ${formatPrice(row.sourceMarket.price)} (+${row.sourceMarket.level})`
      : `来源市场最低卖一 (+${row.sourceMarket.level})`;
    return `
      <tr class="mpp-main-row ${row.profit > 0 ? "mpp-positive-row" : "mpp-negative-row"}">
        <td>
          <div class="mpp-item-cell">
            <button type="button" class="mpp-icon-button" data-open-item="${escapeHtml(row.hrid)}" data-open-level="${row.sourceMarket.level}" data-toggle-row="${escapeHtml(row.hrid)}" title="展开末步材料并打开市场">
              ${itemIconHtml(row.hrid)}
            </button>
            <button type="button" class="mpp-name-button" data-toggle-row="${escapeHtml(row.hrid)}">
              <span>${expanded ? "▾" : "▸"}</span>${escapeHtml(row.name)}
            </button>
          </div>
        </td>
        <td>${row.method === "transmute" ? "转化" : "分解"}${row.rank ? `<small> · ${row.rank === 2 ? "至高" : "普通"}</small>` : ""}</td>
        <td>${formatPercent(row.successRate)}</td>
        <td>${formatNumber(row.stonesPerAttempt, 4)}</td>
        <td title="${escapeHtml(sourcePriceTitle)}">${formatPrice(row.sourceCost)}${row.useCraft ? "<small class='mpp-tag'>自制</small>" : ""}</td>
        <td>${formatPrice(row.byproductIncome)}</td>
        <td><b>${formatPrice(row.costPerStone)}</b></td>
        <td class="${row.profit >= 0 ? "mpp-profit" : "mpp-loss"}"><b>${formatSignedPrice(row.profit)}</b></td>
        <td class="${row.margin >= 0 ? "mpp-profit" : "mpp-loss"}">${formatPercent(row.margin, true)}</td>
      </tr>
      ${expanded ? renderCraftRow(row) : ""}
    `;
  }

  function renderCraftRow(row) {
    if (!row.craft) {
      return `<tr class="mpp-detail-row"><td colspan="9"><div class="mpp-no-recipe">没有可计算的锻造/制造/裁缝末步配方；当前按来源市场价计算。</div></td></tr>`;
    }
    const actionName = row.craft.action === "cheesesmithing" ? "锻造" : row.craft.action === "tailoring" ? "裁缝" : "制造";
    return `
      <tr class="mpp-detail-row"><td colspan="9">
        <div class="mpp-detail-head"><b>${actionName}末步材料</b><span>工匠节省 ${formatPercent(row.craft.artisanRate)} · 合计 ${formatPrice(row.craft.total)}</span></div>
        <div class="mpp-materials">
          ${row.craft.materials.map(material => `
            <button type="button" class="mpp-material" data-open-item="${escapeHtml(material.hrid)}" data-open-level="0" title="打开${escapeHtml(itemName(material.hrid))}市场并获取实时价">
              ${itemIconHtml(material.hrid)}
              <span>${escapeHtml(itemName(material.hrid))}</span>
              <small>${material.artisanApplied && material.baseCount !== material.count ? `${formatNumber(material.baseCount, 2)} → ` : ""}${formatNumber(material.count, 2)} × ${formatPrice(material.unitPrice)}</small>
              <b>${formatPrice(material.subtotal)}</b>
              ${isLive(material.hrid, 0) ? "<i>实时</i>" : ""}
            </button>
          `).join("")}
        </div>
      </td></tr>
    `;
  }

  async function handlePanelClick(event) {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.action === "close") {
      const firstNativeTab = runtime.tabBar?.querySelector(`button:not([${TAB_ATTRIBUTE}])`);
      if (firstNativeTab) firstNativeTab.click();
      else setActive(false);
      return;
    }
    if (target.dataset.action === "refresh") {
      try {
        await refreshSnapshot();
      } catch (error) {
        console.warn("[贤者利润] 刷新市场快照失败", error);
      }
      recalculate();
      renderPanel();
      return;
    }

    const toggleHrid = target.dataset.toggleRow;
    if (toggleHrid) {
      state.expanded[toggleHrid] = !state.expanded[toggleHrid];
      saveState();
    }
    const itemHrid = target.dataset.openItem;
    if (itemHrid) openGameMarketplace(itemHrid, Number(target.dataset.openLevel) || 0);
    if (toggleHrid) renderPanel();
  }

  function handlePanelChange(event) {
    const input = event.target.closest("[data-setting]");
    if (!input) return;
    const key = input.dataset.setting;
    state.settings[key] = input.type === "checkbox" ? input.checked : Number(input.value);
    saveState();
    recalculate();
    renderPanel();
  }

  function installWebSocketObserver() {
    const NativeWebSocket = window.WebSocket;
    if (!NativeWebSocket) return;
    installExistingSocketObserver(NativeWebSocket);
    if (NativeWebSocket.__milkonomyPhilosopherWrapped) return;

    let WrappedWebSocket;
    WrappedWebSocket = new Proxy(NativeWebSocket, {
      construct(Target, args, NewTarget) {
        const actualNewTarget = NewTarget === WrappedWebSocket ? Target : NewTarget;
        const socket = Reflect.construct(Target, args, actualNewTarget);
        socket.addEventListener("message", handleSocketMessage);
        return socket;
      }
    });
    Object.setPrototypeOf(WrappedWebSocket, NativeWebSocket);
    Object.defineProperty(WrappedWebSocket, "prototype", { value: NativeWebSocket.prototype });
    Object.defineProperty(WrappedWebSocket, "__milkonomyPhilosopherWrapped", { value: true });
    window.WebSocket = WrappedWebSocket;
  }

  function installExistingSocketObserver(NativeWebSocket) {
    const prototype = window.MessageEvent?.prototype;
    if (!prototype || prototype.__milkonomyPhilosopherDataWrapped) return;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "data");
    if (!descriptor?.get || !descriptor.configurable) return;
    const originalDataGetter = descriptor.get;

    Object.defineProperty(prototype, "data", {
      ...descriptor,
      get() {
        const data = originalDataGetter.call(this);
        try {
          if (this.currentTarget instanceof NativeWebSocket && !runtime.capturedMessageEvents.has(this)) {
            runtime.capturedMessageEvents.add(this);
            handleSocketData(data);
          }
        } catch {
          // 观察失败不能影响游戏读取消息。
        }
        return data;
      }
    });
    Object.defineProperty(prototype, "__milkonomyPhilosopherDataWrapped", {
      value: true,
      configurable: true
    });
  }

  function handleSocketMessage(event) {
    if (runtime.capturedMessageEvents.has(event)) return;
    runtime.capturedMessageEvents.add(event);
    handleSocketData(event.data);
  }

  function handleSocketData(data) {
    if (typeof data !== "string") return;
    try {
      inspectGameMessage(JSON.parse(data));
    } catch {
      // 非 JSON 消息与本脚本无关。
    }
  }

  function inspectGameMessage(message) {
    if (Array.isArray(message)) {
      message.forEach(inspectGameMessage);
      return;
    }
    if (message?.type !== "market_item_order_books_updated") return;
    const market = message.marketItemOrderBooks;
    const itemHrid = market?.itemHrid;
    if (!itemHrid || !Array.isArray(market.orderBooks)) return;

    runtime.livePrices[itemHrid] ||= {};
    market.orderBooks.forEach((orderBook, level) => {
      const bestAsk = getBestListing(orderBook?.asks, "ask");
      const bestBid = getBestListing(orderBook?.bids, "bid");
      runtime.livePrices[itemHrid][String(level)] = {
        ask: bestAsk?.price ?? -1,
        askQuantity: bestAsk?.quantity ?? null,
        bid: bestBid?.price ?? -1,
        bidQuantity: bestBid?.quantity ?? null,
        capturedAt: Date.now()
      };
    });
    recalculate();
    queueRender();
  }

  function getBestListing(listings, side) {
    if (!Array.isArray(listings) || !listings.length) return null;
    return listings.reduce((best, listing) => {
      const price = Number(listing?.price);
      if (!Number.isFinite(price)) return best;
      if (!best) return listing;
      return side === "ask"
        ? (price < Number(best.price) ? listing : best)
        : (price > Number(best.price) ? listing : best);
    }, null);
  }

  function openGameMarketplace(itemHrid, level = 0) {
    const handler = findGameMarketplaceHandler();
    if (!handler) {
      console.warn("[贤者利润] 未找到游戏市场导航入口", itemHrid);
      window.alert("暂时无法定位游戏市场入口，请刷新游戏后重试。");
      return;
    }
    handler(itemHrid, level);
  }

  function findGameMarketplaceHandler() {
    const root = document.getElementById("root");
    const gamePage = document.querySelector('[class*="GamePage_gamePage__"]');
    const candidates = [gamePage, root?.firstElementChild, root].filter(Boolean);
    for (const element of candidates) {
      const reactKey = Reflect.ownKeys(element).find(key => typeof key === "string" && (
        key.startsWith("__reactFiber$") ||
        key.startsWith("__reactInternalInstance$") ||
        key.startsWith("__reactContainer$")
      ));
      if (!reactKey) continue;
      let fiber = element[reactKey];
      const visited = new Set();
      while (fiber && !visited.has(fiber)) {
        visited.add(fiber);
        const instance = fiber.stateNode;
        if (typeof instance?.handleGoToMarketplace === "function") {
          return instance.handleGoToMarketplace.bind(instance);
        }
        fiber = fiber.return || fiber._debugOwner || null;
      }
    }
    return null;
  }

  function discoverItemSprite() {
    const resource = performance.getEntriesByType("resource")
      .find(entry => entry.name.includes("items_sprite.") && entry.name.includes(".svg"));
    let url = resource?.name;
    if (!url) {
      const image = document.querySelector('img[src*="items_sprite."][src*=".svg"]');
      const use = document.querySelector('use[href*="items_sprite."], use[xlink\\:href*="items_sprite."]');
      url = image?.src || use?.getAttribute("href") || use?.getAttribute("xlink:href");
    }
    if (!url) return false;
    runtime.itemSpriteBase = new URL(url.split("#")[0], location.href).href;
    return true;
  }

  function itemIconHtml(hrid) {
    const slug = escapeHtml(slugOf(hrid));
    if (runtime.itemSpriteBase) {
      const source = `${escapeHtml(runtime.itemSpriteBase)}#${slug}`;
      return `<svg class="mpp-item-icon" aria-hidden="true"><use href="${source}" xlink:href="${source}" width="100%" height="100%"></use></svg>`;
    }
    return `<span class="mpp-item-icon mpp-icon-fallback">${escapeHtml(itemName(hrid).charAt(0))}</span>`;
  }

  function itemName(hrid) {
    return runtime.gameData?.itemDetailMap?.[hrid]?.name || slugOf(hrid);
  }

  function isLive(hrid, level) {
    return Boolean(runtime.livePrices[hrid]?.[String(level)]?.capturedAt);
  }

  function queueRender() {
    if (runtime.renderQueued) return;
    runtime.renderQueued = true;
    requestAnimationFrame(() => {
      runtime.renderQueued = false;
      renderPanel();
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function finite(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function slugOf(hrid) {
    return String(hrid || "").split("/").pop() || String(hrid || "");
  }

  function numberAttr(value) {
    return escapeHtml(String(finite(Number(value), 0)));
  }

  function option(value, label, selected) {
    return `<option value="${value}"${Number(selected) === value ? " selected" : ""}>${label}</option>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatNumber(value, digits = 2) {
    if (!Number.isFinite(value)) return "—";
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  function formatPrice(value) {
    if (!Number.isFinite(value) || value < 0) return "—";
    const absolute = Math.abs(value);
    if (absolute >= 1e9) return `${trimZeros(value / 1e9)}B`;
    if (absolute >= 1e6) return `${trimZeros(value / 1e6)}M`;
    if (absolute >= 1e3) return `${trimZeros(value / 1e3)}K`;
    return Math.round(value).toLocaleString();
  }

  function formatSignedPrice(value) {
    if (!Number.isFinite(value)) return "—";
    return `${value >= 0 ? "+" : "−"}${formatPrice(Math.abs(value))}`;
  }

  function formatPercent(value, signed = false) {
    if (!Number.isFinite(value)) return "—";
    const prefix = signed && value > 0 ? "+" : "";
    return `${prefix}${(value * 100).toFixed(2)}%`;
  }

  function trimZeros(value) {
    return value.toFixed(3).replace(/\.?0+$/, "");
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const parent = document.head || document.documentElement;
    if (!parent) {
      document.addEventListener("DOMContentLoaded", installStyles, { once: true });
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${STATUS_ID} {
        position: fixed; right: 14px; bottom: 14px; z-index: 2147483646;
        padding: 8px 12px; border: 1px solid #7187df; border-radius: 7px;
        color: #f4f6ff; background: #252b48; box-shadow: 0 4px 18px #0008;
        font: 600 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        cursor: pointer;
      }
      #${STATUS_ID}:hover { background: #35406f; }
      [${TAB_ATTRIBUTE}] { cursor: pointer !important; }
      [${TAB_ATTRIBUTE}].milkonomy-philosopher-tab-active {
        color: #fff !important;
        background: #4b5fb0 !important;
        box-shadow: inset 0 -2px 0 #80a7ff;
      }
      #${PANEL_ID} {
        position: relative;
        inset: auto;
        z-index: auto;
        width: 100%;
        min-width: 0;
        min-height: 360px;
        overflow: visible;
        color: #e9ecff;
        background: #11131d;
        border-top: 1px solid #353a57;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      #${PANEL_ID}[hidden] { display: none !important; }
      #${PANEL_ID} * { box-sizing: border-box; }
      #${PANEL_ID} button, #${PANEL_ID} input, #${PANEL_ID} select { font: inherit; }
      #${PANEL_ID} .mpp-shell { width: 100%; min-height: 360px; display: flex; flex-direction: column; }
      #${PANEL_ID} .mpp-header {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 12px 18px 8px; background: #161925;
      }
      #${PANEL_ID} .mpp-header > div { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      #${PANEL_ID} .mpp-header strong { color: #f0c75e; font-size: 19px; }
      #${PANEL_ID} .mpp-header span { color: #aab2da; font-size: 12px; }
      #${PANEL_ID} .mpp-market-summary { justify-content: flex-end; }
      #${PANEL_ID} .mpp-market-summary b { color: #6bc5ff; }
      #${PANEL_ID} .mpp-live { color: #4fd59a !important; }
      #${PANEL_ID} .mpp-toolbar {
        display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap;
        padding: 8px 18px; background: #161925; border-bottom: 1px solid #2b3049;
      }
      #${PANEL_ID} .mpp-toolbar label { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #cdd3ed; }
      #${PANEL_ID} .mpp-toolbar input[type="number"] { width: 70px; }
      #${PANEL_ID} .mpp-toolbar input, #${PANEL_ID} .mpp-toolbar select, #${PANEL_ID} .mpp-toolbar button {
        min-height: 28px; color: #edf0ff; background: #24283a; border: 1px solid #444b6c; border-radius: 5px; padding: 3px 7px;
      }
      #${PANEL_ID} .mpp-toolbar button { cursor: pointer; }
      #${PANEL_ID} .mpp-toolbar button:hover { border-color: #758be6; background: #303653; }
      #${PANEL_ID} .mpp-note { padding: 7px 18px; color: #8790b9; font-size: 12px; background: #131620; }
      #${PANEL_ID} .mpp-error { margin: 8px 18px 0; padding: 8px 10px; color: #ffc2c2; background: #47252b; border-radius: 5px; }
      #${PANEL_ID} .mpp-table-wrap { flex: 1; min-height: 0; max-height: calc(100dvh - 330px); overflow: auto; padding: 0 12px 18px; }
      #${PANEL_ID} .mpp-table { width: 100%; min-width: 970px; border-collapse: collapse; font-size: 13px; }
      #${PANEL_ID} .mpp-table th { position: sticky; top: 0; z-index: 1; padding: 9px 8px; color: #9ca6d3; background: #191c29; border-bottom: 1px solid #343a55; text-align: right; white-space: nowrap; }
      #${PANEL_ID} .mpp-table th:first-child { text-align: left; }
      #${PANEL_ID} .mpp-table td { padding: 8px; border-bottom: 1px solid #262b3e; text-align: right; white-space: nowrap; }
      #${PANEL_ID} .mpp-table td:first-child { text-align: left; }
      #${PANEL_ID} .mpp-main-row:hover { background: #1b2030; }
      #${PANEL_ID} .mpp-item-cell { display: flex; align-items: center; gap: 6px; min-width: 210px; }
      #${PANEL_ID} .mpp-icon-button { width: 34px; height: 34px; flex: 0 0 34px; padding: 2px; cursor: pointer; color: inherit; background: #23283a; border: 1px solid #3d4564; border-radius: 6px; }
      #${PANEL_ID} .mpp-icon-button:hover { border-color: #72a8ff; box-shadow: 0 0 8px #458dff66; }
      #${PANEL_ID} .mpp-item-icon { display: block; width: 28px; height: 28px; }
      #${PANEL_ID} .mpp-icon-fallback { display: grid; place-items: center; color: #ffd66b; font-weight: 700; }
      #${PANEL_ID} .mpp-name-button { display: inline-flex; align-items: center; gap: 5px; max-width: 260px; padding: 0; color: #dce2ff; background: transparent; border: 0; cursor: pointer; text-align: left; white-space: normal; }
      #${PANEL_ID} .mpp-name-button:hover { color: #82b7ff; }
      #${PANEL_ID} td small { color: #8790b9; }
      #${PANEL_ID} .mpp-tag { display: inline-block; margin-left: 5px; padding: 1px 4px; color: #b8d6ff; background: #263e61; border-radius: 3px; }
      #${PANEL_ID} .mpp-profit { color: #4de09d; }
      #${PANEL_ID} .mpp-loss { color: #ff737d; }
      #${PANEL_ID} .mpp-detail-row td { padding: 0 8px 12px 48px; background: #151923; text-align: left; white-space: normal; }
      #${PANEL_ID} .mpp-detail-head { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; color: #aeb8df; }
      #${PANEL_ID} .mpp-materials { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
      #${PANEL_ID} .mpp-material { position: relative; display: grid; grid-template-columns: 32px minmax(95px, 1fr); grid-template-rows: auto auto; gap: 2px 7px; min-width: 210px; padding: 7px; color: #e7eaff; background: #202536; border: 1px solid #343b57; border-radius: 6px; cursor: pointer; text-align: left; }
      #${PANEL_ID} .mpp-material:hover { border-color: #6b9fff; background: #252c41; }
      #${PANEL_ID} .mpp-material .mpp-item-icon { grid-row: 1 / 3; align-self: center; }
      #${PANEL_ID} .mpp-material span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #${PANEL_ID} .mpp-material small { color: #8e98bf; }
      #${PANEL_ID} .mpp-material b { grid-column: 2; color: #efcf79; }
      #${PANEL_ID} .mpp-material i { position: absolute; top: 4px; right: 5px; color: #55dda2; font-size: 10px; font-style: normal; }
      #${PANEL_ID} .mpp-no-recipe { padding: 10px; color: #8d95b7; border: 1px dashed #3b415b; border-radius: 5px; }
      #${PANEL_ID} .mpp-empty { padding: 40px !important; color: #858eb5; text-align: center !important; }
      @media (max-width: 760px) {
        #${PANEL_ID} .mpp-header, #${PANEL_ID} .mpp-toolbar, #${PANEL_ID} .mpp-note { padding-left: 10px; padding-right: 10px; }
        #${PANEL_ID} .mpp-market-summary { display: none; }
      }
    `;
    parent.appendChild(style);
  }

  // LZString.decompressFromUTF16 的独立实现，用于读取游戏缓存中的 initClientData。
  function decompressFromUTF16(input) {
    if (input == null) return "";
    if (input === "") return null;
    const resetValue = 16384;
    const data = { val: input.charCodeAt(0) - 32, position: resetValue, index: 1 };

    function readBits(count) {
      let bits = 0;
      let power = 1;
      const maxPower = 2 ** count;
      while (power !== maxPower) {
        const resultBit = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = input.charCodeAt(data.index++) - 32;
        }
        if (resultBit > 0) bits |= power;
        power <<= 1;
      }
      return bits;
    }

    const dictionary = [0, 1, 2];
    let enlargeIn = 4;
    let dictionarySize = 4;
    let numberOfBits = 3;
    let character;
    switch (readBits(2)) {
      case 0: character = String.fromCharCode(readBits(8)); break;
      case 1: character = String.fromCharCode(readBits(16)); break;
      case 2: return "";
      default: return null;
    }
    dictionary[3] = character;
    let previous = character;
    const result = [character];

    while (true) {
      if (data.index > input.length) return "";
      let code = readBits(numberOfBits);
      switch (code) {
        case 0:
          dictionary[dictionarySize++] = String.fromCharCode(readBits(8));
          code = dictionarySize - 1;
          enlargeIn--;
          break;
        case 1:
          dictionary[dictionarySize++] = String.fromCharCode(readBits(16));
          code = dictionarySize - 1;
          enlargeIn--;
          break;
        case 2:
          return result.join("");
        default:
          break;
      }
      if (enlargeIn === 0) {
        enlargeIn = 2 ** numberOfBits;
        numberOfBits++;
      }
      let entry;
      if (dictionary[code]) entry = dictionary[code];
      else if (code === dictionarySize) entry = previous + previous.charAt(0);
      else return null;
      result.push(entry);
      dictionary[dictionarySize++] = previous + entry.charAt(0);
      enlargeIn--;
      previous = entry;
      if (enlargeIn === 0) {
        enlargeIn = 2 ** numberOfBits;
        numberOfBits++;
      }
    }
  }

  Object.defineProperty(window, "__MILKONOMY_PHILOSOPHER__", {
    configurable: true,
    value: {
      version: SCRIPT_VERSION,
      getState: () => JSON.parse(JSON.stringify({ state, runtime: { rows: runtime.rows, livePrices: runtime.livePrices } })),
      refresh: async () => {
        await refreshSnapshot();
        recalculate();
        renderPanel();
      },
      open: () => setActive(true)
    }
  });
})();
