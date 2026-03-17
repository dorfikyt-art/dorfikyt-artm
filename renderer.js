const { ipcRenderer, clipboard } = require('electron');

// DOM Elements
const tabsContainer = document.getElementById('tabs-container');
const viewsContainer = document.getElementById('view-container');
const btnNewTab = document.getElementById('new-tab');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnRefresh = document.getElementById('btn-refresh');
const btnHome = document.getElementById('btn-home');
const btnMenu = document.getElementById('btn-menu');
const btnBookmark = document.getElementById('btn-bookmark');
const btnDownloads = document.getElementById('btn-downloads');
const browserMenu = document.getElementById('browser-menu');
const menuNewTab = document.getElementById('menu-new-tab');
const menuIncognito = document.getElementById('menu-incognito');
const menuHistory = document.getElementById('menu-history');
const menuDownloads = document.getElementById('menu-downloads');
const menuBookmarksToggle = document.getElementById('menu-bookmarks-toggle');
const menuBookmarkPage = document.getElementById('menu-bookmark-page');
const menuFind = document.getElementById('menu-find');
const menuFullscreen = document.getElementById('menu-fullscreen');
const menuSettings = document.getElementById('menu-settings');
const menuClose = document.getElementById('menu-close');
const menuZoomIn = document.getElementById('menu-zoom-in');
const menuZoomOut = document.getElementById('menu-zoom-out');
const menuZoomLevel = document.getElementById('menu-zoom-level');
const urlInput = document.getElementById('url-input');
const sslIcon = document.getElementById('ssl-icon');
const bookmarksBar = document.getElementById('bookmarks-bar');
const loadingBar = document.getElementById('loading-bar');
const zoomIndicator = document.getElementById('zoom-indicator');
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
const findPrev = document.getElementById('find-prev');
const findNext = document.getElementById('find-next');
const findClose = document.getElementById('find-close');
const tabContextMenu = document.getElementById('tab-context-menu');
const pageContextMenu = document.getElementById('page-context-menu');
const contextMenuOverlay = document.getElementById('context-menu-overlay');
const downloadsPanel = document.getElementById('downloads-panel');
const downloadsList = document.getElementById('downloads-list');
const downloadsClose = document.getElementById('downloads-close');
const menuSavePage = document.getElementById('menu-save-page');

// Incognito mode detection
const urlParams = new URLSearchParams(window.location.search);
const isIncognito = urlParams.get('incognito') === 'true';

if (isIncognito) {
  document.body.classList.add('incognito');
}

// Default Settings
const DEFAULT_SETTINGS = {
  homepage: 'https://google.com',
  searchEngine: 'google',
  newTabUrl: 'browser://newtab',
  showBookmarksBar: true,
  openHomeOnStart: false,
  bookmarks: [
    { title: 'Google', url: 'https://google.com' },
    { title: 'YouTube', url: 'https://youtube.com' },
    { title: 'GitHub', url: 'https://github.com' },
    { title: 'Яндекс', url: 'https://yandex.ru' },
  ],
};

// State
let settings = loadSettings();
let tabs = [];
let tabRegistry = new Map();
let activeTabId = null;
let tabCount = 0;
let closedTabsHistory = [];
let lastWebviewTabId = null;
let settingsSaveTimer = null;
let currentZoom = 1;
let zoomTimeout = null;
let findBarActive = false;
let findCurrentIndex = 0;
let findTotalMatches = 0;
let contextMenuTabId = null;
let pageContextTarget = null;
let draggedTab = null;
let history = loadHistory();
let downloads = [];

// Utility Functions
function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem('browser-settings');
    if (!raw) return cloneSettings(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return { ...cloneSettings(DEFAULT_SETTINGS), ...parsed };
  } catch (_e) {
    return cloneSettings(DEFAULT_SETTINGS);
  }
}

function saveSettings() {
  localStorage.setItem('browser-settings', JSON.stringify(settings));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('browser-history');
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem('browser-history', JSON.stringify(history.slice(0, 1000)));
}

function addToHistory(title, url) {
  if (isIncognito || !url || url.startsWith('browser://')) return;
  history.unshift({
    title: title || url,
    url,
    timestamp: Date.now(),
  });
  saveHistory();
}

function normalizeUrl(value, fallback = DEFAULT_SETTINGS.homepage) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('browser://')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildSearchUrl(query) {
  const encoded = encodeURIComponent(query);
  if (settings.searchEngine === 'yandex') return `https://yandex.ru/search/?text=${encoded}`;
  if (settings.searchEngine === 'duckduckgo') return `https://duckduckgo.com/?q=${encoded}`;
  if (settings.searchEngine === 'bing') return `https://www.bing.com/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

function resolveInputToUrl(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.startsWith('browser://')) return input;
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    if (input.includes('.') && !input.includes(' ')) {
      return `https://${input}`;
    }
    return buildSearchUrl(input);
  }
  return input;
}

function getFaviconUrl(url) {
  if (!url || url.startsWith('browser://')) return 'Assets/Logo.png';
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
  } catch {
    return 'Assets/Logo.png';
  }
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 17) return 'Добрый день';
  if (hour >= 17 && hour < 22) return 'Добрый вечер';
  return 'Доброй ночи';
}

function formatTime(date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatHistoryTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatHistoryDate(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Tab Management
function createTabRecord(type, title, address) {
  tabCount += 1;
  const id = `tab-${tabCount}`;
  
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.id = `ui-${id}`;
  tabElement.draggable = true;

  const iconWrap = document.createElement('div');
  iconWrap.className = 'tab-icon-wrap';
  
  const iconElement = document.createElement('img');
  iconElement.className = 'tab-icon';
  iconElement.src = getFaviconUrl(address);
  iconElement.alt = '';
  iconElement.onerror = () => { iconElement.src = 'Assets/Logo.png'; };

  const spinner = document.createElement('div');
  spinner.className = 'tab-spinner';

  iconWrap.appendChild(iconElement);
  iconWrap.appendChild(spinner);

  const titleElement = document.createElement('span');
  titleElement.className = 'tab-title';
  titleElement.textContent = title;

  const audioIndicator = document.createElement('div');
  audioIndicator.className = 'tab-audio';
  audioIndicator.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
  audioIndicator.title = 'Нажмите, чтобы отключить звук';

  const closeButton = document.createElement('span');
  closeButton.className = 'tab-close';
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  closeButton.onclick = (e) => { e.stopPropagation(); closeTab(id); };

  tabElement.appendChild(iconWrap);
  tabElement.appendChild(titleElement);
  tabElement.appendChild(audioIndicator);
  tabElement.appendChild(closeButton);
  
  tabElement.onclick = () => switchTab(id);
  tabElement.addEventListener('auxclick', (e) => {
    if (e.button === 1) { e.preventDefault(); closeTab(id); }
  });
  tabElement.addEventListener('contextmenu', (e) => showTabContextMenu(e, id));

  // Drag and drop
  tabElement.addEventListener('dragstart', (e) => {
    draggedTab = id;
    tabElement.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  tabElement.addEventListener('dragend', () => {
    tabElement.classList.remove('dragging');
    draggedTab = null;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('drag-over'));
  });
  tabElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (draggedTab && draggedTab !== id) {
      tabElement.classList.add('drag-over');
    }
  });
  tabElement.addEventListener('dragleave', () => {
    tabElement.classList.remove('drag-over');
  });
  tabElement.addEventListener('drop', (e) => {
    e.preventDefault();
    tabElement.classList.remove('drag-over');
    if (draggedTab && draggedTab !== id) {
      reorderTabs(draggedTab, id);
    }
  });

  tabsContainer.appendChild(tabElement);

  const viewElement = type === 'webview' ? document.createElement('webview') : document.createElement('div');
  viewElement.id = `view-${id}`;
  viewElement.className = type === 'webview' ? '' : 'internal-view';
  
  if (type === 'webview') {
    if (isIncognito) viewElement.partition = 'incognito';
    viewElement.setAttribute('allowpopups', 'true');
    viewElement.setAttribute('webpreferences', 'contextIsolation=no');
  }
  
  viewsContainer.appendChild(viewElement);

  const record = {
    id, type, title, address,
    favicon: getFaviconUrl(address),
    tabElement, titleElement, iconElement, viewElement,
    pinned: false, muted: false, zoom: 1,
  };

  tabs.push(id);
  tabRegistry.set(id, record);
  return record;
}

function reorderTabs(fromId, toId) {
  const fromIndex = tabs.indexOf(fromId);
  const toIndex = tabs.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1) return;
  
  tabs.splice(fromIndex, 1);
  tabs.splice(toIndex, 0, fromId);
  
  const fromRecord = tabRegistry.get(fromId);
  const toRecord = tabRegistry.get(toId);
  if (fromRecord && toRecord) {
    tabsContainer.insertBefore(fromRecord.tabElement, toRecord.tabElement);
  }
}

function updateTabPresentation(id, data = {}) {
  const record = tabRegistry.get(id);
  if (!record) return;

  if (data.title !== undefined) {
    record.title = data.title;
    record.titleElement.textContent = data.title;
  }
  if (data.address !== undefined) record.address = data.address;
  if (data.favicon !== undefined) record.favicon = data.favicon;
  
  record.iconElement.src = record.favicon || getFaviconUrl(record.address);
}

function setTabLoading(id, loading) {
  const record = tabRegistry.get(id);
  if (!record) return;
  
  if (loading) {
    record.tabElement.classList.add('loading');
  } else {
    record.tabElement.classList.remove('loading');
  }
}

function setTabAudio(id, playing) {
  const record = tabRegistry.get(id);
  if (!record) return;
  
  if (playing) {
    record.tabElement.classList.add('playing-audio');
  } else {
    record.tabElement.classList.remove('playing-audio');
  }
}

function toggleTabPin(id) {
  const record = tabRegistry.get(id);
  if (!record) return;
  
  record.pinned = !record.pinned;
  record.tabElement.classList.toggle('pinned', record.pinned);
  
  // Move pinned tabs to the beginning
  if (record.pinned) {
    const firstUnpinned = tabs.find(t => !tabRegistry.get(t)?.pinned);
    if (firstUnpinned) {
      const idx = tabs.indexOf(id);
      tabs.splice(idx, 1);
      const newIdx = tabs.indexOf(firstUnpinned);
      tabs.splice(newIdx, 0, id);
      tabsContainer.insertBefore(record.tabElement, tabRegistry.get(firstUnpinned)?.tabElement);
    }
  }
}

function toggleTabMute(id) {
  const record = tabRegistry.get(id);
  if (!record || record.type !== 'webview') return;
  
  record.muted = !record.muted;
  try {
    record.viewElement.setAudioMuted(record.muted);
  } catch (e) {
    console.log('Could not mute tab:', e);
  }
}

function switchTab(id) {
  if (!tabs.includes(id)) return;

  if (activeTabId) {
    const previous = tabRegistry.get(activeTabId);
    if (previous) {
      previous.tabElement.classList.remove('active');
      previous.viewElement.classList.remove('active');
      previous.viewElement.style.display = 'none';
    }
  }

  activeTabId = id;
  const current = tabRegistry.get(id);
  if (!current) return;

  current.tabElement.classList.add('active');
  current.viewElement.classList.add('active');
  current.viewElement.style.display = 'flex';

  if (current.type === 'webview') {
    try {
      urlInput.value = current.viewElement.getURL() || current.address;
      updateSSLIcon(current.viewElement.getURL());
    } catch {
      urlInput.value = current.address;
    }
    lastWebviewTabId = current.id;
    currentZoom = current.zoom || 1;
    updateZoomDisplay();
  } else {
    urlInput.value = current.address;
    updateSSLIcon(current.address);
  }

  updateNavButtons();
  closeFindBar();
}

function closeTab(id) {
  const record = tabRegistry.get(id);
  if (!record) return;
  if (record.pinned) return; // Can't close pinned tabs with X button

  const index = tabs.indexOf(id);
  if (index === -1) return;

  if (record.type === 'webview') {
    try {
      const closedUrl = record.viewElement.getURL() || record.address;
      if (closedUrl && !closedUrl.startsWith('browser://')) {
        closedTabsHistory.push(closedUrl);
        if (closedTabsHistory.length > 30) closedTabsHistory.shift();
      }
    } catch (e) {
      // Ignore errors
    }
  }

  record.tabElement.remove();
  record.viewElement.remove();
  tabRegistry.delete(id);
  tabs.splice(index, 1);

  if (lastWebviewTabId === id) lastWebviewTabId = null;

  if (tabs.length === 0) {
    createNewTabPage();
    return;
  }

  if (activeTabId === id) {
    const nextIndex = Math.min(index, tabs.length - 1);
    switchTab(tabs[nextIndex]);
  }
}

function closeOtherTabs(keepId) {
  const toClose = tabs.filter(id => id !== keepId && !tabRegistry.get(id)?.pinned);
  toClose.forEach(id => closeTab(id));
}

function closeTabsToRight(fromId) {
  const index = tabs.indexOf(fromId);
  if (index === -1) return;
  const toClose = tabs.slice(index + 1).filter(id => !tabRegistry.get(id)?.pinned);
  toClose.forEach(id => closeTab(id));
}

function duplicateTab(id) {
  const record = tabRegistry.get(id);
  if (!record) return;
  
  if (record.type === 'webview') {
    try {
      createWebviewTab(record.viewElement.getURL() || record.address);
    } catch {
      createWebviewTab(record.address);
    }
  }
}

function reopenClosedTab() {
  const url = closedTabsHistory.pop();
  if (url) createWebviewTab(url);
}

// Navigation
function openUrlInCurrentContext(url) {
  const target = url;
  
  if (target.startsWith('browser://')) {
    if (target === 'browser://settings') { openSettingsTab(); return; }
    if (target === 'browser://history') { openHistoryTab(); return; }
    if (target === 'browser://newtab') { createNewTabPage(); return; }
    return;
  }

  const active = getActiveTab();
  if (!active || active.type !== 'webview') {
    const closedNewTabId = (active && active.type === 'newtab') ? active.id : null;
    createWebviewTab(target);
    if (closedNewTabId) {
      closeTab(closedNewTabId);
    }
    return;
  }

  active.viewElement.loadURL(target);
}

function updateNavButtons() {
  const webview = getActiveWebview();
  if (!webview) {
    btnBack.disabled = true;
    btnForward.disabled = true;
    return;
  }

  try {
    btnBack.disabled = !webview.canGoBack();
    btnForward.disabled = !webview.canGoForward();
  } catch (_e) {
    btnBack.disabled = true;
    btnForward.disabled = true;
  }
}

function updateSSLIcon(url) {
  if (!url || url.startsWith('browser://')) {
    sslIcon.className = 'internal';
    sslIcon.title = 'Страница браузера';
    sslIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    return;
  }
  
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol === 'https:') {
      sslIcon.className = 'secure';
      sslIcon.title = 'Безопасное соединение';
      sslIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
    } else {
      sslIcon.className = 'insecure';
      sslIcon.title = 'Небезопасное соединение';
      sslIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';
    }
  } catch {
    sslIcon.className = 'internal';
  }
}

// Webview Tab
function attachWebviewEvents(record) {
  const webview = record.viewElement;

  webview.addEventListener('did-start-loading', () => {
    setTabLoading(record.id, true);
    if (activeTabId === record.id) {
      loadingBar.classList.remove('hidden', 'complete');
      loadingBar.style.width = '30%';
    }
  });

  webview.addEventListener('did-stop-loading', () => {
    setTabLoading(record.id, false);
    if (activeTabId === record.id) {
      loadingBar.style.width = '100%';
      loadingBar.classList.add('complete');
      setTimeout(() => loadingBar.classList.add('hidden'), 300);
    }
    syncWebviewState(record);
  });

  webview.addEventListener('page-title-updated', (e) => {
    const title = e.title || webview.getTitle() || record.address;
    updateTabPresentation(record.id, { title });
    try {
      addToHistory(title, webview.getURL());
    } catch {}
  });

  webview.addEventListener('page-favicon-updated', (e) => {
    try {
      const iconUrl = e.favicons?.[0] || getFaviconUrl(webview.getURL());
      updateTabPresentation(record.id, { favicon: iconUrl });
    } catch {}
  });

  webview.addEventListener('did-navigate', () => syncWebviewState(record));
  webview.addEventListener('did-navigate-in-page', () => syncWebviewState(record));
  
  webview.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return; // Aborted
    setTabLoading(record.id, false);
    loadingBar.classList.add('hidden');
  });

  webview.addEventListener('context-menu', (e) => {
    showPageContextMenu(e.params, record.id);
  });

  webview.addEventListener('media-started-playing', () => setTabAudio(record.id, true));
  webview.addEventListener('media-paused', () => setTabAudio(record.id, false));

  webview.addEventListener('found-in-page', (e) => {
    if (e.result) {
      findCurrentIndex = e.result.activeMatchOrdinal;
      findTotalMatches = e.result.matches;
      findCount.textContent = `${findCurrentIndex} / ${findTotalMatches}`;
    }
  });
}

function syncWebviewState(record) {
  const webview = record.viewElement;
  try {
    const currentUrl = webview.getURL() || record.address;
    
    updateTabPresentation(record.id, {
      title: webview.getTitle() || currentUrl,
      address: currentUrl,
    });

    if (activeTabId === record.id) {
      urlInput.value = currentUrl;
      updateSSLIcon(currentUrl);
      updateNavButtons();
    }
  } catch (e) {
    // Ignore errors
  }
}

function createWebviewTab(url = settings.newTabUrl) {
  if (url === 'browser://newtab') {
    createNewTabPage();
    return;
  }
  
  const targetUrl = normalizeUrl(url, settings.homepage);
  const record = createTabRecord('webview', 'Загрузка...', targetUrl);
  record.viewElement.src = targetUrl;
  attachWebviewEvents(record);
  switchTab(record.id);
  return record.id;
}

// Internal Pages
function createNewTabPage() {
  const record = createTabRecord('newtab', 'Новая вкладка', 'browser://newtab');
  renderNewTabPage(record);
  switchTab(record.id);
  return record.id;
}

function renderNewTabPage(record) {
  const view = record.viewElement;
  view.className = 'internal-view newtab-page';
  
  const now = new Date();
  
  view.innerHTML = `
    <div class="newtab-header">
      <div class="newtab-greeting">${getGreeting()}</div>
      <div class="newtab-clock" id="newtab-clock-${record.id}">${formatTime(now)}</div>
      <div class="newtab-date">${formatDate(now)}</div>
    </div>
    <div class="newtab-search">
      <div class="newtab-search-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </div>
      <input type="text" id="newtab-search-${record.id}" placeholder="Поиск в интернете..." autocomplete="off" />
    </div>
    <div class="newtab-shortcuts" id="newtab-shortcuts-${record.id}"></div>
  `;

  // Update clock
  const clockEl = view.querySelector(`#newtab-clock-${record.id}`);
  const clockInterval = setInterval(() => {
    if (!document.contains(clockEl)) {
      clearInterval(clockInterval);
      return;
    }
    clockEl.textContent = formatTime(new Date());
  }, 1000);

  // Search input
  const searchInput = view.querySelector(`#newtab-search-${record.id}`);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim()) {
      openUrlInCurrentContext(resolveInputToUrl(searchInput.value));
    }
  });
  
  // Focus search input on tab activation
  setTimeout(() => searchInput.focus(), 100);

  // Render shortcuts
  const shortcutsContainer = view.querySelector(`#newtab-shortcuts-${record.id}`);
  settings.bookmarks.forEach(bookmark => {
    const shortcut = document.createElement('button');
    shortcut.className = 'newtab-shortcut';
    shortcut.innerHTML = `
      <div class="newtab-shortcut-icon">
        <img src="${getFaviconUrl(bookmark.url)}" alt="" onerror="this.src='Assets/Logo.png'">
      </div>
      <div class="newtab-shortcut-label">${bookmark.title}</div>
    `;
    shortcut.onclick = () => openUrlInCurrentContext(normalizeUrl(bookmark.url));
    shortcutsContainer.appendChild(shortcut);
  });
}

function openHistoryTab() {
  const existing = Array.from(tabRegistry.values()).find(t => t.type === 'history');
  if (existing) {
    renderHistoryPage(existing);
    switchTab(existing.id);
    return;
  }

  const record = createTabRecord('history', 'История', 'browser://history');
  renderHistoryPage(record);
  switchTab(record.id);
}

function renderHistoryPage(record) {
  const view = record.viewElement;
  view.className = 'internal-view history-page';
  
  view.innerHTML = `
    <div class="history-header">
      <h1>История</h1>
      <input type="text" class="history-search" id="history-search-${record.id}" placeholder="Поиск в истории..." />
      <button class="history-clear-btn" id="history-clear-${record.id}">Очистить историю</button>
    </div>
    <div class="history-content" id="history-content-${record.id}"></div>
  `;

  const searchInput = view.querySelector(`#history-search-${record.id}`);
  const contentEl = view.querySelector(`#history-content-${record.id}`);
  const clearBtn = view.querySelector(`#history-clear-${record.id}`);

  const renderHistoryItems = (filter = '') => {
    const filtered = history.filter(item => 
      !filter || item.title.toLowerCase().includes(filter.toLowerCase()) || 
      item.url.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
      contentEl.innerHTML = `
        <div class="history-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <div>${filter ? 'Ничего не найдено' : 'История пуста'}</div>
        </div>
      `;
      return;
    }

    // Group by date
    const grouped = {};
    filtered.forEach(item => {
      const dateKey = formatHistoryDate(item.timestamp);
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(item);
    });

    contentEl.innerHTML = '';
    Object.entries(grouped).forEach(([date, items]) => {
      const dayHeader = document.createElement('div');
      dayHeader.className = 'history-day-header';
      dayHeader.textContent = date;
      contentEl.appendChild(dayHeader);

      items.forEach((item, idx) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'history-item';
        itemEl.innerHTML = `
          <img class="history-item-icon" src="${getFaviconUrl(item.url)}" alt="" onerror="this.src='Assets/Logo.png'">
          <span class="history-item-title">${item.title}</span>
          <span class="history-item-url">${item.url}</span>
          <span class="history-item-time">${formatHistoryTime(item.timestamp)}</span>
          <button class="history-item-delete" data-idx="${history.indexOf(item)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        `;
        itemEl.onclick = (e) => {
          if (!e.target.closest('.history-item-delete')) {
            createWebviewTab(item.url);
          }
        };
        itemEl.querySelector('.history-item-delete').onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(e.currentTarget.dataset.idx);
          history.splice(idx, 1);
          saveHistory();
          renderHistoryItems(searchInput.value);
        };
        contentEl.appendChild(itemEl);
      });
    });
  };

  searchInput.oninput = () => renderHistoryItems(searchInput.value);
  clearBtn.onclick = () => {
    if (confirm('Очистить всю историю просмотров?')) {
      history = [];
      saveHistory();
      renderHistoryItems();
    }
  };

  renderHistoryItems();
}

function openSettingsTab() {
  const existing = Array.from(tabRegistry.values()).find(t => t.type === 'settings');
  if (existing) {
    renderSettingsTab(existing);
    switchTab(existing.id);
    return;
  }

  const record = createTabRecord('settings', 'Настройки', 'browser://settings');
  renderSettingsTab(record);
  switchTab(record.id);
}

function renderSettingsTab(record) {
  const draft = cloneSettings(settings);
  const view = record.viewElement;
  view.className = 'internal-view settings-page';
  
  view.innerHTML = `
    <div class="settings-header">
      <div class="settings-title">
        <img src="Assets/Logo.png" alt="Browser">
        <div class="settings-title-text">
          <strong>Настройки</strong>
          <span>Изменения сохраняются автоматически</span>
        </div>
      </div>
      <div class="settings-status" id="settings-status" style="opacity: 0">Сохранено</div>
    </div>
    <div class="settings-content">
      <section class="settings-card">
        <div class="settings-section-head">
          <h2>Основные настройки</h2>
          <div class="settings-microcopy">Настройте домашнюю страницу и поисковую систему по умолчанию</div>
        </div>
        <div class="settings-grid">
          <div class="settings-row">
            <div class="settings-field">
              <label>Домашняя страница</label>
              <input class="settings-input" id="settings-homepage" type="text" placeholder="https://google.com">
            </div>
            <div class="settings-field">
              <label>Поисковая система</label>
              <select class="settings-select" id="settings-search-engine">
                <option value="google">Google</option>
                <option value="yandex">Яндекс</option>
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="bing">Bing</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-section-head">
          <h2>Интерфейс</h2>
          <div class="settings-microcopy">Настройте отображение элементов браузера</div>
        </div>
        <div class="toggle-row">
          <span>Показывать панель закладок</span>
          <input class="toggle" id="settings-show-bookmarks" type="checkbox">
        </div>
        <div class="toggle-row">
          <span>Открывать домашнюю страницу при запуске</span>
          <input class="toggle" id="settings-open-home" type="checkbox">
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-section-head">
          <h2>Закладки</h2>
          <div class="settings-microcopy">Управляйте быстрыми ссылками на любимые сайты</div>
        </div>
        <div id="settings-bookmarks-list"></div>
        <div class="settings-btn-row">
          <button class="settings-btn primary" id="settings-add-bookmark">+ Добавить закладку</button>
          <button class="settings-btn" id="settings-add-current">Добавить текущую страницу</button>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-section-head">
          <h2>Данные</h2>
          <div class="settings-microcopy">Управление данными браузера</div>
        </div>
        <div class="settings-btn-row">
          <button class="settings-btn danger" id="settings-clear-history">Очистить историю</button>
          <button class="settings-btn danger" id="settings-reset">Сбросить настройки</button>
        </div>
      </section>
    </div>
  `;

  const homepageInput = view.querySelector('#settings-homepage');
  const searchEngineSelect = view.querySelector('#settings-search-engine');
  const showBookmarksToggle = view.querySelector('#settings-show-bookmarks');
  const openHomeToggle = view.querySelector('#settings-open-home');
  const bookmarksList = view.querySelector('#settings-bookmarks-list');
  const addBookmarkBtn = view.querySelector('#settings-add-bookmark');
  const addCurrentBtn = view.querySelector('#settings-add-current');
  const clearHistoryBtn = view.querySelector('#settings-clear-history');
  const resetBtn = view.querySelector('#settings-reset');
  const statusEl = view.querySelector('#settings-status');

  const showSaveStatus = () => {
    statusEl.style.opacity = '1';
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(() => { statusEl.style.opacity = '0'; }, 2000);
  };

  const persist = () => {
    settings = cloneSettings(draft);
    saveSettings();
    applySettings();
    showSaveStatus();
  };

  const syncForm = () => {
    homepageInput.value = draft.homepage;
    searchEngineSelect.value = draft.searchEngine;
    showBookmarksToggle.checked = draft.showBookmarksBar;
    openHomeToggle.checked = draft.openHomeOnStart;
  };

  const renderBookmarks = () => {
    bookmarksList.innerHTML = '';
    draft.bookmarks.forEach((bm, i) => {
      const item = document.createElement('div');
      item.className = 'settings-bookmark-item';
      item.innerHTML = `
        <img class="settings-bookmark-icon" src="${getFaviconUrl(bm.url)}" alt="" onerror="this.src='Assets/Logo.png'">
        <input type="text" value="${bm.title}" placeholder="Название" data-field="title" data-idx="${i}">
        <div class="split"></div>
        <input type="text" value="${bm.url}" placeholder="https://example.com" data-field="url" data-idx="${i}">
        <button class="settings-remove-btn" data-idx="${i}">Удалить</button>
      `;
      
      item.querySelectorAll('input').forEach(input => {
        input.oninput = () => {
          const idx = parseInt(input.dataset.idx);
          draft.bookmarks[idx][input.dataset.field] = input.value;
          if (input.dataset.field === 'url') {
            item.querySelector('.settings-bookmark-icon').src = getFaviconUrl(input.value);
          }
          persist();
        };
      });
      
      item.querySelector('.settings-remove-btn').onclick = () => {
        draft.bookmarks.splice(i, 1);
        renderBookmarks();
        persist();
      };
      
      bookmarksList.appendChild(item);
    });
  };

  syncForm();
  renderBookmarks();

  homepageInput.oninput = () => { draft.homepage = homepageInput.value; persist(); };
  searchEngineSelect.onchange = () => { draft.searchEngine = searchEngineSelect.value; persist(); };
  showBookmarksToggle.onchange = () => { draft.showBookmarksBar = showBookmarksToggle.checked; persist(); };
  openHomeToggle.onchange = () => { draft.openHomeOnStart = openHomeToggle.checked; persist(); };
  
  addBookmarkBtn.onclick = () => {
    draft.bookmarks.push({ title: 'Новая закладка', url: 'https://example.com' });
    renderBookmarks();
    persist();
  };
  
  addCurrentBtn.onclick = () => {
    const webview = getActiveWebview() || getWebviewByTabId(lastWebviewTabId);
    if (webview) {
      try {
        draft.bookmarks.push({
          title: webview.getTitle() || 'Страница',
          url: webview.getURL() || settings.homepage,
        });
        renderBookmarks();
        persist();
      } catch (e) {
        console.log('Could not get webview info:', e);
      }
    }
  };
  
  clearHistoryBtn.onclick = () => {
    if (confirm('Очистить всю историю просмотров?')) {
      history = [];
      saveHistory();
    }
  };
  
  resetBtn.onclick = () => {
    if (confirm('Сбросить все настройки к значениям по умолчанию?')) {
      Object.assign(draft, cloneSettings(DEFAULT_SETTINGS));
      syncForm();
      renderBookmarks();
      persist();
    }
  };
}

// Bookmarks
function renderBookmarks() {
  bookmarksBar.innerHTML = '';
  settings.bookmarks.forEach(bm => {
    const btn = document.createElement('button');
    btn.className = 'bookmark';
    btn.title = bm.url;
    btn.innerHTML = `
      <img class="bookmark-icon" src="${getFaviconUrl(bm.url)}" alt="" onerror="this.src='Assets/Logo.png'">
      <span>${bm.title}</span>
    `;
    btn.onclick = () => openUrlInCurrentContext(normalizeUrl(bm.url));
    bookmarksBar.appendChild(btn);
  });
}

function applySettings() {
  if (settings.showBookmarksBar) {
    bookmarksBar.classList.remove('hidden');
  } else {
    bookmarksBar.classList.add('hidden');
  }
  renderBookmarks();
}

function bookmarkCurrentPage() {
  const webview = getActiveWebview() || getWebviewByTabId(lastWebviewTabId);
  if (!webview) return;

  try {
    settings.bookmarks.push({
      title: webview.getTitle() || webview.getURL() || 'Закладка',
      url: webview.getURL() || settings.homepage,
    });
    saveSettings();
    applySettings();
  } catch (e) {
    console.log('Could not bookmark page:', e);
  }
}

// Find in Page
function openFindBar() {
  findBarActive = true;
  findBar.classList.add('visible');
  findInput.value = '';
  findInput.focus();
  findCount.textContent = '0 / 0';
}

function closeFindBar() {
  findBarActive = false;
  findBar.classList.remove('visible');
  const webview = getActiveWebview();
  if (webview) {
    try { webview.stopFindInPage('clearSelection'); } catch {}
  }
}

function findInPage(forward = true) {
  const webview = getActiveWebview();
  const query = findInput.value.trim();
  if (!webview || !query) return;

  try {
    webview.findInPage(query, { forward, findNext: true });
  } catch (e) {
    console.log('Find error:', e);
  }
}

// Zoom
function setZoom(delta) {
  const webview = getActiveWebview();
  if (!webview) return;

  currentZoom = Math.max(0.25, Math.min(3, currentZoom + delta));
  try {
    webview.setZoomFactor(currentZoom);
  } catch (e) {
    console.log('Zoom error:', e);
  }
  
  const record = getActiveTab();
  if (record) record.zoom = currentZoom;
  
  updateZoomDisplay();
  showZoomIndicator();
}

function resetZoom() {
  const webview = getActiveWebview();
  if (!webview) return;

  currentZoom = 1;
  try {
    webview.setZoomFactor(1);
  } catch (e) {
    console.log('Zoom error:', e);
  }
  
  const record = getActiveTab();
  if (record) record.zoom = 1;
  
  updateZoomDisplay();
  showZoomIndicator();
}

function updateZoomDisplay() {
  const percent = Math.round(currentZoom * 100);
  if (menuZoomLevel) menuZoomLevel.textContent = `${percent}%`;
  zoomIndicator.textContent = `${percent}%`;
}

function showZoomIndicator() {
  zoomIndicator.classList.add('visible');
  clearTimeout(zoomTimeout);
  zoomTimeout = setTimeout(() => {
    zoomIndicator.classList.remove('visible');
  }, 1500);
}

// Context Menu
function showTabContextMenu(e, tabId) {
  e.preventDefault();
  hidePageContextMenu();
  contextMenuTabId = tabId;
  
  const record = tabRegistry.get(tabId);
  if (!record) return;

  const pinText = tabContextMenu.querySelector('.ctx-pin-text');
  const muteText = tabContextMenu.querySelector('.ctx-mute-text');
  
  if (pinText) pinText.textContent = record.pinned ? 'Открепить вкладку' : 'Закрепить вкладку';
  if (muteText) muteText.textContent = record.muted ? 'Включить звук' : 'Отключить звук';

  contextMenuOverlay.style.display = 'block';
  tabContextMenu.classList.add('visible');

  let left = e.clientX;
  let top = e.clientY;
  const rect = tabContextMenu.getBoundingClientRect();

  if (left + rect.width > window.innerWidth) {
    left = window.innerWidth - rect.width;
  }
  if (top + rect.height > window.innerHeight) {
    top = window.innerHeight - rect.height;
  }

  tabContextMenu.style.left = `${left}px`;
  tabContextMenu.style.top = `${top}px`;
}

function hideContextMenu() {
  tabContextMenu.classList.remove('visible');
  contextMenuTabId = null;
  if (!pageContextMenu.classList.contains('visible')) {
    contextMenuOverlay.style.display = 'none';
  }
}

function hidePageContextMenu() {
  pageContextMenu.classList.remove('visible');
  pageContextTarget = null;
  if (!tabContextMenu.classList.contains('visible')) {
    contextMenuOverlay.style.display = 'none';
  }
}

function showPageContextMenu(params, tabId) {
  hideContextMenu();
  const tabRecord = tabRegistry.get(tabId);
  const webviewRect = tabRecord?.viewElement?.getBoundingClientRect();
  
  // params.x and params.y are relative to the webview content. Check if we need offset.
  // Actually, webview context-menu params x/y are relative to the WINDOW. So we shouldn't add webviewRect.left/top
  const menuX = Math.round(params?.x || 0);
  const menuY = Math.round(params?.y || 0);

  pageContextTarget = {
    tabId,
    linkURL: params?.linkURL || '',
    srcURL: params?.srcURL || '',
    hasImage: params?.mediaType === 'image',
    x: menuX,
    y: menuY,
  };

  const openLinkItem = document.getElementById('page-ctx-open-link');
  const copyLinkItem = document.getElementById('page-ctx-copy-link');
  const hasLink = Boolean(pageContextTarget.linkURL);

  const saveImageItem = document.getElementById('page-ctx-save-image');
  const copyImageItem = document.getElementById('page-ctx-copy-image');
  const hasImage = Boolean(pageContextTarget.hasImage);

  if (openLinkItem) openLinkItem.style.display = hasLink ? 'flex' : 'none';
  if (copyLinkItem) copyLinkItem.style.display = hasLink ? 'flex' : 'none';
  if (saveImageItem) saveImageItem.style.display = hasImage ? 'flex' : 'none';
  if (copyImageItem) copyImageItem.style.display = hasImage ? 'flex' : 'none';

  contextMenuOverlay.style.display = 'block';
  pageContextMenu.classList.add('visible');

  const rect = pageContextMenu.getBoundingClientRect();
  let left = pageContextTarget.x;
  let top = pageContextTarget.y;

  if (left + rect.width > window.innerWidth) {
    left = window.innerWidth - rect.width;
  }
  if (top + rect.height > window.innerHeight) {
    top = window.innerHeight - rect.height;
  }

  pageContextMenu.style.left = `${left}px`;
  pageContextMenu.style.top = `${top}px`;
}

// Downloads Panel
function toggleDownloadsPanel() {
  downloadsPanel.classList.toggle('visible');
}

// Helpers
function getActiveTab() {
  return activeTabId ? tabRegistry.get(activeTabId) : null;
}

function getActiveWebview() {
  const record = getActiveTab();
  return record?.type === 'webview' ? record.viewElement : null;
}

function getWebviewByTabId(id) {
  const record = tabRegistry.get(id);
  return record?.type === 'webview' ? record.viewElement : null;
}

function focusAddressBar() {
  urlInput.focus();
  urlInput.select();
}

function switchTabByOffset(offset) {
  if (tabs.length <= 1) return;
  const idx = tabs.indexOf(activeTabId);
  const nextIdx = (idx + offset + tabs.length) % tabs.length;
  switchTab(tabs[nextIdx]);
}

function switchTabByIndex(index) {
  if (index === -1) {
    switchTab(tabs[tabs.length - 1]);
  } else if (tabs[index]) {
    switchTab(tabs[index]);
  }
}

function toggleFullscreen() {
  try {
    ipcRenderer.send('toggle-fullscreen');
  } catch (e) {
    // Fullscreen toggle not available
  }
}

async function saveCurrentPage() {
  const webview = getActiveWebview();
  if (!webview) return;

  try {
    webview.downloadURL(webview.getURL());
  } catch (e) {
    console.error('Ошибка сохранения страницы:', e);
  }
}

// Event Listeners
btnBack.onclick = () => { 
  const wv = getActiveWebview();
  if (wv) try { wv.goBack(); } catch {} 
};
btnForward.onclick = () => { 
  const wv = getActiveWebview();
  if (wv) try { wv.goForward(); } catch {} 
};
btnRefresh.onclick = () => { 
  const wv = getActiveWebview();
  if (wv) try { wv.reload(); } catch {} 
};
btnHome.onclick = () => openUrlInCurrentContext(settings.homepage);
btnNewTab.onclick = () => createNewTabPage();
if (btnBookmark) btnBookmark.onclick = bookmarkCurrentPage;
if (btnDownloads) btnDownloads.onclick = toggleDownloadsPanel;
if (downloadsClose) downloadsClose.onclick = () => downloadsPanel.classList.remove('visible');

btnMenu.onclick = (e) => {
  e.stopPropagation();
  browserMenu.classList.toggle('hidden');
};

document.addEventListener('click', (e) => {
  if (!browserMenu.contains(e.target) && e.target !== btnMenu) {
    browserMenu.classList.add('hidden');
  }
  if (!e.target.closest('.context-menu')) {
    hideContextMenu();
    hidePageContextMenu();
  }
});

contextMenuOverlay.addEventListener('click', (e) => {
  hideContextMenu();
  hidePageContextMenu();
});

contextMenuOverlay.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  hideContextMenu();
  hidePageContextMenu();
});

// Menu items
if (menuNewTab) menuNewTab.onclick = () => { browserMenu.classList.add('hidden'); createNewTabPage(); };
if (menuIncognito) menuIncognito.onclick = () => { browserMenu.classList.add('hidden'); ipcRenderer.send('create-incognito-window'); };
if (menuHistory) menuHistory.onclick = () => { browserMenu.classList.add('hidden'); openHistoryTab(); };
if (menuDownloads) menuDownloads.onclick = () => { browserMenu.classList.add('hidden'); toggleDownloadsPanel(); };
if (menuBookmarksToggle) menuBookmarksToggle.onclick = () => { browserMenu.classList.add('hidden'); settings.showBookmarksBar = !settings.showBookmarksBar; saveSettings(); applySettings(); };
if (menuBookmarkPage) menuBookmarkPage.onclick = () => { browserMenu.classList.add('hidden'); bookmarkCurrentPage(); };
if (menuFind) menuFind.onclick = () => { browserMenu.classList.add('hidden'); openFindBar(); };
if (menuSavePage) menuSavePage.onclick = () => { browserMenu.classList.add('hidden'); saveCurrentPage(); };
if (menuFullscreen) menuFullscreen.onclick = () => { browserMenu.classList.add('hidden'); toggleFullscreen(); };
if (menuSettings) menuSettings.onclick = () => { browserMenu.classList.add('hidden'); openSettingsTab(); };
if (menuClose) menuClose.onclick = () => window.close();
if (menuZoomIn) menuZoomIn.onclick = () => setZoom(0.1);
if (menuZoomOut) menuZoomOut.onclick = () => setZoom(-0.1);

// URL input
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = resolveInputToUrl(urlInput.value);
    if (url) openUrlInCurrentContext(url);
    urlInput.blur();
  }
});

urlInput.addEventListener('focus', () => urlInput.select());

// Find bar
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    findInPage(!e.shiftKey);
  } else if (e.key === 'Escape') {
    closeFindBar();
  }
});
findInput.addEventListener('input', () => findInPage());
findPrev.onclick = () => findInPage(false);
findNext.onclick = () => findInPage(true);
findClose.onclick = closeFindBar;

// Tab context menu
tabContextMenu.addEventListener('click', (e) => {
  const action = e.target.closest('.ctx-item')?.dataset.action;
  if (!action || !contextMenuTabId) return;

  switch (action) {
    case 'reload':
      const wv = getWebviewByTabId(contextMenuTabId);
      if (wv) try { wv.reload(); } catch {}
      break;
    case 'duplicate':
      duplicateTab(contextMenuTabId);
      break;
    case 'pin':
      toggleTabPin(contextMenuTabId);
      break;
    case 'mute':
      toggleTabMute(contextMenuTabId);
      break;
    case 'close':
      closeTab(contextMenuTabId);
      break;
    case 'close-others':
      closeOtherTabs(contextMenuTabId);
      break;
    case 'close-right':
      closeTabsToRight(contextMenuTabId);
      break;
    case 'reopen':
      reopenClosedTab();
      break;
  }

  hideContextMenu();
});

pageContextMenu.addEventListener('click', (e) => {
  const action = e.target.closest('.ctx-item')?.dataset.action;
  if (!action) return;

  const targetTab = pageContextTarget?.tabId && tabRegistry.get(pageContextTarget.tabId);
  const webview = targetTab?.type === 'webview' ? targetTab.viewElement : getActiveWebview();

  if (action === 'back' && webview) {
    try { if (webview.canGoBack()) webview.goBack(); } catch {}
  }

  if (action === 'forward' && webview) {
    try { if (webview.canGoForward()) webview.goForward(); } catch {}
  }

  if (action === 'reload' && webview) {
    try { webview.reload(); } catch {}
  }

  if (action === 'open-link' && pageContextTarget?.linkURL) {
    createWebviewTab(pageContextTarget.linkURL);
  }

  if (action === 'copy-link' && pageContextTarget?.linkURL) {
    try {
      clipboard.writeText(pageContextTarget.linkURL);
    } catch (err) {
      console.error('Не удалось скопировать ссылку:', err);
    }
  }

  if (action === 'save-image' && pageContextTarget?.srcURL && webview) {
    try {
      webview.downloadURL(pageContextTarget.srcURL);
    } catch (err) {
      console.error('Ошибка скачивания картинки:', err);
    }
  }

  if (action === 'copy-image' && pageContextTarget?.srcURL) {
    try {
      clipboard.writeText(pageContextTarget.srcURL);
    } catch (err) {
      console.error('Не удалось скопировать URL картинки:', err);
    }
  }

  if (action === 'save-page') {
    saveCurrentPage();
  }

  hidePageContextMenu();
});

// IPC shortcuts
ipcRenderer.on('browser-shortcut', (_, data) => {
  switch (data.action) {
    case 'new-tab': createNewTabPage(); break;
    case 'close-tab': if (activeTabId) closeTab(activeTabId); break;
    case 'reopen-closed-tab': reopenClosedTab(); break;
    case 'next-tab': switchTabByOffset(1); break;
    case 'previous-tab': switchTabByOffset(-1); break;
    case 'focus-address': focusAddressBar(); break;
    case 'refresh': 
      const wv = getActiveWebview();
      if (wv) try { wv.reload(); } catch {}
      break;
    case 'go-back':
      const wvb = getActiveWebview();
      if (wvb) try { wvb.goBack(); } catch {}
      break;
    case 'go-forward':
      const wvf = getActiveWebview();
      if (wvf) try { wvf.goForward(); } catch {}
      break;
    case 'switch-to-index': switchTabByIndex(data.payload.index); break;
    case 'bookmark-current-page': bookmarkCurrentPage(); break;
    case 'toggle-bookmarks-bar': settings.showBookmarksBar = !settings.showBookmarksBar; saveSettings(); applySettings(); break;
    case 'open-settings': openSettingsTab(); break;
    case 'open-history': openHistoryTab(); break;
    case 'find-in-page': openFindBar(); break;
    case 'save-page': saveCurrentPage(); break;
    case 'zoom-in': setZoom(0.1); break;
    case 'zoom-out': setZoom(-0.1); break;
    case 'zoom-reset': resetZoom(); break;
    case 'toggle-fullscreen': toggleFullscreen(); break;
    case 'open-tab-url': createWebviewTab(data.payload); break;
    case 'escape':
      if (findBarActive) closeFindBar();
      browserMenu.classList.add('hidden');
      hidePageContextMenu();
      break;
  }
});

// Initialize
applySettings();

if (settings.openHomeOnStart) {
  createWebviewTab(settings.homepage);
} else {
  createNewTabPage();
}

// Download Events Handling
ipcRenderer.on('download-started', (_, item) => {
  downloads.push({ ...item, received: 0, state: 'progressing' });
  renderDownloads();
  downloadsPanel.classList.add('visible');
});

ipcRenderer.on('download-updated', (_, data) => {
  const download = downloads.find(d => d.id === data.id);
  if (download) {
    if (data.state) download.state = data.state;
    if (data.received !== undefined) download.received = data.received;
    if (data.savePath) download.savePath = data.savePath;
    renderDownloads();
  }
});

function renderDownloads() {
  if (downloads.length === 0) {
    downloadsList.innerHTML = '<div class="downloads-empty">Нет активных загрузок</div>';
    return;
  }
  
  downloadsList.innerHTML = '';
  downloads.forEach(d => {
    let progress = 0;
    if (d.total > 0) progress = Math.min(100, Math.floor((d.received / d.total) * 100));
    else if (d.state === 'completed') progress = 100;
    
    let statusText = d.state === 'completed' ? 'Завершено' : 
                     d.state === 'interrupted' ? 'Прервано' : 
                     d.state === 'cancelled' ? 'Отменено' :
                     d.total ? `${Math.round(d.received/1024/1024)} из ${Math.round(d.total/1024/1024)} МБ` : 'Загрузка...';

    const el = document.createElement('div');
    el.className = 'download-item';
    if (d.state === 'completed' && d.savePath) { 
      el.style.cursor = 'pointer'; 
      el.title = 'Открыть файл: ' + d.savePath;
    }
    el.innerHTML = `
      <div class="download-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </div>
      <div class="download-info">
        <div class="download-name">${d.filename}</div>
        <div class="download-status">${statusText}</div>
        ${d.state === 'progressing' ? `<div class="download-progress"><div class="download-progress-bar" style="width: ${progress}%"></div></div>` : ''}
      </div>
    `;
    
    if (d.state === 'completed' && d.savePath) {
      el.addEventListener('click', () => {
        require('electron').shell.openPath(d.savePath).catch(err => console.error(err));
      });
    }

    downloadsList.prepend(el);
  });
}
