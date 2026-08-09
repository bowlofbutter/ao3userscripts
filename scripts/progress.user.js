// ==UserScript==
// @name         AO3 Word Count + Reading Progress
// @namespace    https://github.com/bowlofbutter/ao3userscripts
// @version      2.0
// @history 2.0  Added settings menu, icon, colors, position now can be chosen
// @history 1.0  Adds a floating box kn the bottom-right corner that display progression % based on chapter and overall wordcount. 
// @description  Adds word counts to chapter links/stats, and a floating reading-progress indicator weighted by real chapter word counts.
// @author		bowlofbutter
// @match        https://archiveofourown.org/*/navigate
// @match        https://archiveofourown.org/*/chapters/*
// @match        https://archiveofourown.org/works/*
// @icon         https://archiveofourown.org/favicon.ico
// @grant        none
// @updateURL    https://raw.githubusercontent.com/bowlofbutter/ao3userscripts/main/scripts/progress.user.js
// @downloadURL  https://raw.githubusercontent.com/bowlofbutter/ao3userscripts/main/scripts/progress.user.js
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const uri = location.protocol + '//' +
    location.hostname +
    (location.port ? ':' + location.port : '') +
    location.pathname +
    (location.search ? location.search : '');

  const wordCountRegex = /\s+/g;
  const chapterUrlRegex = new RegExp('https://archiveofourown\\.org/works/\\d+/chapters/\\d+/?');
  const cacheKeyPrefix = 'ao3-word-count-cache-';
  const cacheDurationMs = 30 * 24 * 60 * 60 * 1000;

  // ---------- settings (persisted, editable via the AO3 header menu) ----------

  const SETTINGS_KEY = 'ao3-progress-settings';
  const defaultSettings = {
    icon: '💠',
    textColor: '#B4C8CE',
    bgColor: '#252542',
    barColor: '#e49494',
    position: 'bottom-right', // bottom-right | bottom-left | top-right | top-left
    autoHideIdle: false,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign({}, defaultSettings, JSON.parse(raw)) : Object.assign({}, defaultSettings);
    } catch (e) {
      return Object.assign({}, defaultSettings);
    }
  }

  function saveSettingsToStorage(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function positionStyles(position) {
    switch (position) {
      case 'bottom-left': return 'bottom:16px; left:16px;';
      case 'top-right': return 'top:16px; right:16px;';
      case 'top-left': return 'top:16px; left:16px;';
      default: return 'bottom:16px; right:16px;';
    }
  }

  let settings = loadSettings();

  // ---------- shared word-count helpers ----------

  const getCachedWordCount = (href) => {
    const cacheKey = cacheKeyPrefix + href;
    const cachedValue = localStorage.getItem(cacheKey);
    if (cachedValue) {
      const { timestamp, wordCount } = JSON.parse(cachedValue);
      if (Date.now() - timestamp < cacheDurationMs && wordCount !== 0) {
        return wordCount;
      } else {
        localStorage.removeItem(cacheKey);
      }
    }
    return null;
  };

  const setCachedWordCount = (url, wordCount) => {
    const cacheKey = cacheKeyPrefix + url;
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), wordCount }));
  };

  let fetchInProgress = false;

  const countWords = (doc) => {
    const article = doc.querySelector('div[role=article]');
    return article ? article.textContent.trim().split(wordCountRegex).length : 0;
  };

  const fetchWordCount = async (url) => {
    try {
      if (fetchInProgress) {
        await new Promise((resolve) => {
          const interval = setInterval(() => {
            if (!fetchInProgress) {
              clearInterval(interval);
              resolve();
            }
          }, 2000);
        });
      }
      fetchInProgress = true;
      const response = await fetch(url);
      const text = await response.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const wordCount = countWords(doc);
      setCachedWordCount(url, wordCount);
      fetchInProgress = false;
      return wordCount;
    } catch (error) {
      console.log(error);
      fetchInProgress = false;
      return 0;
    }
  };

  const getWordCount = async (link, maxWidth, longTitles) => {
    const cached = getCachedWordCount(link.href);
    const wordCount = cached !== null ? cached : await fetchWordCount(link.href);
    const wordCountElement = document.createElement('span');
    wordCountElement.textContent = `(${wordCount} words)`;
    if (!longTitles) {
      const spanElement = link.parentElement.querySelector('span.datetime');
      const margin = maxWidth - link.getBoundingClientRect().width + 7;
      wordCountElement.style.marginLeft = `${margin}px`;
      spanElement.parentNode.insertBefore(wordCountElement, spanElement.nextSibling);
    } else {
      link.parentNode.insertBefore(wordCountElement, link);
      link.parentElement.style.paddingLeft = '7.5em';
      wordCountElement.style.position = 'absolute';
      wordCountElement.style.left = '0';
    }
  };

  // ---------- header settings menu (added on any matched page) ----------

  function buildSettingsMenu(onSave) {
    const navList = document.querySelector('ul.primary.navigation.actions')
      || document.querySelector('ul.primary.navigation');
    if (!navList || document.getElementById('ao3-progress-settings-item')) return;

    const li = document.createElement('li');
    li.className = 'dropdown';
    li.id = 'ao3-progress-settings-item';

    const toggle = document.createElement('a');
    toggle.href = '#';
    toggle.textContent = 'Progress ⚙';
    toggle.setAttribute('data-toggle', 'dropdown');
    toggle.addEventListener('click', (e) => e.preventDefault());

    const menu = document.createElement('ul');
    menu.className = 'menu dropdown-menu';
    menu.style.cssText = 'padding:10px; min-width:230px; box-sizing:border-box; overflow:hidden;';

    function addRow(labelText, inputEl) {
      const row = document.createElement('li');
      row.style.cssText = '        padding:4px 8px;        display:flex;        align-items:center;        gap:8px;        list-style:none;';
      const label = document.createElement('label');
      label.textContent = labelText;

      label.style.cssText = '  font-size:12px;  flex:1;  text-align:left;';
       inputEl.style.marginLeft = 'auto';

      row.appendChild(label);
      row.appendChild(inputEl);
      row.addEventListener('click', (e) => e.stopPropagation());
      menu.appendChild(row);
    }

    // Color inputs styled as a filled swatch box (matches the color currently set)
    function styleColorSwatch(input) {
      input.style.cssText = `
        width: 40px;
        height: 26px;
        padding: 0;
        margin: 0;
        border: 1px solid rgba(0,0,0,0.3);
        border-radius: 3px;
        cursor: pointer;
        background: none;
        box-sizing: border-box;
      `;
    }

    const iconInput = document.createElement('input');
    iconInput.type = 'text';
    iconInput.maxLength = 2;
    iconInput.value = settings.icon;
    iconInput.style.cssText = 'width:40px; height:26px; box-sizing:border-box; text-align:center;';
    addRow('Icon', iconInput);

    const textColorInput = document.createElement('input');
    textColorInput.type = 'color';
    textColorInput.value = settings.textColor;
    styleColorSwatch(textColorInput);
    addRow('Text color', textColorInput);

    const bgColorInput = document.createElement('input');
    bgColorInput.type = 'color';
    bgColorInput.value = settings.bgColor;
    styleColorSwatch(bgColorInput);
    addRow('Background', bgColorInput);

    const barColorInput = document.createElement('input');
    barColorInput.type = 'color';
    barColorInput.value = settings.barColor;
    styleColorSwatch(barColorInput);
    addRow('Progress bar', barColorInput);

    const positionSelect = document.createElement('select');
    ['bottom-right', 'bottom-left', 'top-right', 'top-left'].forEach((pos) => {
      const opt = document.createElement('option');
      opt.value = pos;
      opt.textContent = pos.replace('-', ' ');
      if (pos === settings.position) opt.selected = true;
      positionSelect.appendChild(opt);
    });
    addRow('Position', positionSelect);

    const autoHideInput = document.createElement('input');
    autoHideInput.type = 'checkbox';
    autoHideInput.checked = !!settings.autoHideIdle;
    addRow('Auto-hide when idle', autoHideInput);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.type = 'button';
    saveBtn.style.cssText = '  margin-top:6px;  width:100%; height:auto; box-sizing:border-box;  cursor:pointer;  white-space:nowrap;  font-size:12px;  padding:4px 8px;';
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      settings = {
        icon: iconInput.value || defaultSettings.icon,
        textColor: textColorInput.value,
        bgColor: bgColorInput.value,
        barColor: barColorInput.value,
        position: positionSelect.value,
        autoHideIdle: autoHideInput.checked,
      };
      saveSettingsToStorage(settings);
      if (onSave) onSave();
    });
    const saveRow = document.createElement('li');
    saveRow.style.cssText = 'padding:4px 8px; box-sizing:border-box; list-style:none;';
    saveRow.appendChild(saveBtn);
    saveRow.addEventListener('click', (e) => e.stopPropagation());
    menu.appendChild(saveRow);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset to defaults';
    resetBtn.type = 'button';
    resetBtn.style.cssText = '  margin-top:6px;  width:100%;  height:auto; box-sizing:border-box;  cursor:pointer;  white-space:nowrap;  font-size:12px;  padding:4px 8px;';
    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      settings = Object.assign({}, defaultSettings);
      saveSettingsToStorage(settings);
      iconInput.value = settings.icon;
      textColorInput.value = settings.textColor;
      bgColorInput.value = settings.bgColor;
      barColorInput.value = settings.barColor;
      positionSelect.value = settings.position;
      autoHideInput.checked = settings.autoHideIdle;
      if (onSave) onSave();
    });
    const resetRow = document.createElement('li');
    resetRow.style.cssText = 'padding:4px 8px; box-sizing:border-box; list-style:none;';
    resetRow.appendChild(resetBtn);
    resetRow.addEventListener('click', (e) => e.stopPropagation());
    menu.appendChild(resetRow);

    li.appendChild(toggle);
    li.appendChild(menu);
    navList.appendChild(li);
  }

  // ---------- chapter index page: add word counts to links ----------

  if (uri.endsWith('navigate')) {
    buildSettingsMenu(null);
    const chapterLinks = document.querySelectorAll('ol.chapter.index.group li a');
    if (chapterLinks.length) {
      const parentWidth = chapterLinks[0].parentElement.getBoundingClientRect().width;
      let maxWidth = 0;
      let longTitles = false;
      chapterLinks.forEach((link) => {
        const width = link.getBoundingClientRect().width;
        if (width > maxWidth) maxWidth = width;
        if (width + 175 >= parentWidth) longTitles = true;
      });
      chapterLinks.forEach((link) => getWordCount(link, maxWidth, longTitles));
    }
    return; // nothing else to do on this page
  }

  // ---------- chapter/work page: add word count to stats + reading progress ----------

  let currentChapterWords = null;
  if (chapterUrlRegex.test(uri) || document.querySelector('#workskin')) {
    currentChapterWords = countWords(document);
    if (chapterUrlRegex.test(uri)) {
      const statsElement = document.querySelector('dl.stats');
      if (statsElement && !statsElement.querySelector('dd.chapter-words')) {
        const ddElement = document.createElement('dd');
        ddElement.classList.add('chapter-words');
        ddElement.textContent = currentChapterWords;
        const dtElement = document.createElement('dt');
        dtElement.classList.add('chapter-words');
        dtElement.textContent = 'Chapter Words:';
        statsElement.appendChild(dtElement);
        statsElement.appendChild(ddElement);
      }
    }
    setCachedWordCount(uri, currentChapterWords);
  }

  // ---------- reading progress indicator ----------

  const content = document.querySelector('#workskin');
  if (!content) return;

  const box = document.createElement('div');
  box.id = 'ao3-progress-box';
  box.style.cssText = `
    position: fixed;
    z-index: 999999;
    font-family: -apple-system, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    cursor: pointer;
    user-select: none;
    opacity: 1;
    transition: opacity 0.4s;
  `;

  const collapsedView = document.createElement('div');
  collapsedView.style.cssText = `
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  `;

  const expandedView = document.createElement('div');
  expandedView.style.cssText = `
    display: none;
    padding: 8px 12px;
    min-width: fit-content;
  `;
  const chapterNumLine = document.createElement('div');
  const chapterPctLine = document.createElement('div');
  const overallLine = document.createElement('div');
  const barOuter = document.createElement('div');
  barOuter.style.cssText = 'margin-top:4px; height:4px; background:rgba(255,255,255,0.2); border-radius:2px; overflow:hidden;';
  const barInner = document.createElement('div');
  barInner.style.cssText = 'height:100%; width:0%; transition: width 0.15s;';
  barOuter.appendChild(barInner);
  expandedView.appendChild(chapterNumLine);
  expandedView.appendChild(chapterPctLine);
  expandedView.appendChild(overallLine);
  expandedView.appendChild(barOuter);

  box.appendChild(collapsedView);
  box.appendChild(expandedView);
  document.body.appendChild(box);

  let expanded = false;

  const IDLE_TIMEOUT_MS = 3000;
  const IDLE_OPACITY = '0.35';
  let idleTimer = null;

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    box.style.opacity = '1';
    if (!settings.autoHideIdle || expanded) return;
    idleTimer = setTimeout(() => {
      if (!expanded) box.style.opacity = IDLE_OPACITY;
    }, IDLE_TIMEOUT_MS);
  }

  function applyBoxSettings() {
    box.style.position = 'fixed';
    box.style.top = '';
    box.style.bottom = '';
    box.style.left = '';
    box.style.right = '';
    const posDecl = positionStyles(settings.position);
    posDecl.split(';').filter(Boolean).forEach((decl) => {
      const [prop, val] = decl.split(':').map((s) => s.trim());
      box.style[prop] = val;
    });
    box.style.background = hexToRgba(settings.bgColor, 0.85);
    box.style.color = settings.textColor;
    collapsedView.textContent = settings.icon;
    barInner.style.background = settings.barColor;
    resetIdleTimer();
  }

  box.addEventListener('click', () => {
    expanded = !expanded;
    collapsedView.style.display = expanded ? 'none' : 'flex';
    expandedView.style.display = expanded ? 'block' : 'none';
    resetIdleTimer();
  });

  applyBoxSettings();
  buildSettingsMenu(applyBoxSettings);

  const workIdMatch = location.pathname.match(/works\/(\d+)/);
  const workId = workIdMatch ? workIdMatch[1] : null;
  const chapterSelect = document.querySelector('#selected_id');

  let totalChapters = 1;
  let currentChapterIndex = 1;
  let chapterMeta = [{ url: uri, words: currentChapterWords }];

  if (chapterSelect && workId) {
    totalChapters = chapterSelect.options.length;
    currentChapterIndex = chapterSelect.selectedIndex + 1;
    chapterMeta = Array.from(chapterSelect.options).map((opt, i) => {
      const url = `https://archiveofourown.org/works/${workId}/chapters/${opt.value}`;
      const isCurrent = i + 1 === currentChapterIndex;
      return {
        url,
        words: isCurrent ? currentChapterWords : getCachedWordCount(url),
      };
    });
  }

  function getWithinChapterFraction() {
    const rect = content.getBoundingClientRect();
    const contentTop = rect.top + window.scrollY;
    const contentHeight = content.offsetHeight;
    const viewportBottom = window.scrollY + window.innerHeight;
    const scrolled = viewportBottom - contentTop;
    return Math.min(1, Math.max(0, scrolled / contentHeight));
  }

  function render() {
    const withinFraction = getWithinChapterFraction();
    const chapterPct = Math.round(withinFraction * 100);

    if (totalChapters > 1) {
      chapterNumLine.textContent = `Chapter #: ${currentChapterIndex}/${totalChapters}`;
      chapterNumLine.style.display = 'block';
    } else {
      chapterNumLine.style.display = 'none';
    }
    chapterPctLine.textContent = `Chapter %: ${chapterPct}%`;

    let overallPct = chapterPct;

    if (totalChapters > 1) {
      const allKnown = chapterMeta.every((m) => m.words !== null && m.words !== undefined);
      if (allKnown) {
        const totalWords = chapterMeta.reduce((s, m) => s + m.words, 0);
        const wordsBefore = chapterMeta
          .slice(0, currentChapterIndex - 1)
          .reduce((s, m) => s + m.words, 0);
        const wordsSoFar = wordsBefore + currentChapterWords * withinFraction;
        overallPct = totalWords > 0 ? Math.round((wordsSoFar / totalWords) * 100) : chapterPct;
        overallLine.textContent = `Overall %: ${overallPct}%`;
      } else {
        overallPct = Math.round(((currentChapterIndex - 1 + withinFraction) / totalChapters) * 100);
        overallLine.textContent = `Overall %: ~${overallPct}% (loading…)`;
      }
    } else {
      overallLine.style.display = 'none';
    }

    barInner.style.width = overallPct + '%';
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    resetIdleTimer();
    if (!ticking) {
      requestAnimationFrame(() => {
        render();
        ticking = false;
      });
      ticking = true;
    }
  });
  window.addEventListener('resize', render);

  render();

  if (totalChapters > 1) {
    chapterMeta.forEach((m) => {
      if (m.words === null || m.words === undefined) {
        fetchWordCount(m.url).then((wc) => {
          m.words = wc;
          render();
        });
      }
    });
  }
})();
