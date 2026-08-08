// ==UserScript==
// @name         AO3 Word Count + Reading Progress
// @namespace    ao3chapterwordcounter-progress
// @version      1.0
// @description  Adds word counts to chapter links/stats, and a floating reading-progress indicator weighted by real chapter word counts.
// @icon         https://archiveofourown.org/favicon.ico
// @match        https://archiveofourown.org/*/navigate
// @match        https://archiveofourown.org/*/chapters/*
// @match        https://archiveofourown.org/works/*
// @updateURL    https://raw.githubusercontent.com/bowlofbutter/ao3userscripts/main/scripts/progress.user.js
// @downloadURL  https://raw.githubusercontent.com/bowlofbutter/ao3userscripts/main/scripts/progress.user.js
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @grant        none
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

  // ---------- shared word-count helpers (from original script) ----------

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

  // ---------- chapter index page: add word counts to links ----------

  if (uri.endsWith('navigate')) {
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
    bottom: 16px;
    right: 16px;
    z-index: 999999;
    background: rgba(20, 20, 20, 0.85);
    color: #fff;
    font-family: -apple-system, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    cursor: pointer;
    user-select: none;
  `;

  // collapsed view: small round symbol, shown by default
  const collapsedView = document.createElement('div');
  collapsedView.textContent = '💠';
  collapsedView.style.cssText = `
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  `;

  // expanded view: full details, hidden by default
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
  barInner.style.cssText = 'height:100%; width:0%; background:#e49494; transition: width 0.15s;';
  barOuter.appendChild(barInner);
  expandedView.appendChild(chapterNumLine);
  expandedView.appendChild(chapterPctLine);
  expandedView.appendChild(overallLine);
  expandedView.appendChild(barOuter);

  box.appendChild(collapsedView);
  box.appendChild(expandedView);
  document.body.appendChild(box);

  let expanded = false;
  box.addEventListener('click', () => {
    expanded = !expanded;
    collapsedView.style.display = expanded ? 'none' : 'flex';
    expandedView.style.display = expanded ? 'block' : 'none';
  });

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

  // background-fill missing chapter word counts (throttled via shared fetch queue)
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
