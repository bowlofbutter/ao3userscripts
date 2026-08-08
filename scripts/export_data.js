// ==UserScript==
// @name         AO3 Export Current Work to Notion-Ready HTML
// @namespace    https://github.com/bowlofbutter/ao3userscripts
// @version      1.0
// @description  Opens a small HTML page with the current fic's fields, each in its own element with a CSS class named after the field, for use with "Save to Notion" selector mapping.
// @icon         https://archiveofourown.org/favicon.ico
// @match        https://archiveofourown.org/works/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/bowlofbutter/ao3userscripts/main/scripts/export_data.js
// @downloadURL  https://raw.githubusercontent.com/bowlofbutter/ao3userscripts/main/scripts/export_data.js
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  const $ = jQuery.noConflict();

  // Only run on an actual work page (not e.g. /works/search)
  if (!/^https:\/\/archiveofourown\.org\/works\/\d+/.test(location.href)) return;
  if (!$('#workskin').length) return;

  function tagList(selector) {
    return $(selector).map(function () { return $(this).text().trim(); }).get().join(', ');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function generatePage() {
    var title = $('h2.title.heading').first().text().trim();
    var author = $('h3.byline.heading a[rel=author]').map(function () {
      return $(this).text().trim();
    }).get().join(', ') || $('h3.byline.heading').text().trim();

    var summary = $('.summary.module blockquote.userstuff').first().text().trim();

    var fandoms = tagList('dd.fandom.tags a.tag');
    var category = tagList('dd.category.tags a.tag');
    var relationships = tagList('dd.relationship.tags a.tag');
    var characters = tagList('dd.character.tags a.tag');
    var freeforms = tagList('dd.freeform.tags a.tag');
    var rating = tagList('dd.rating.tags a.tag');
    var warnings = tagList('dd.warning.tags a.tag');
    var date = $('dl.work.meta.group dd.published').text().trim();
    var updated = $('dl.work.meta.group dd.status').text().trim();
    var words = $('dl.stats dd.words').text().trim();
    var chapters = $('dl.stats dd.chapters').text().trim();
    var comments = $('dl.stats dd.comments').text().trim();
    var kudos = $('dl.stats dd.kudos').text().trim();
    var bookmarksCount = $('dl.stats dd.bookmarks').text().trim();
    var hits = $('dl.stats dd.hits').text().trim();

    // Series info (a work can be in multiple series; take the first listed)
    var $seriesSpan = $('dd.series span.series').first();
    var seriesTitle = '';
    var seriesPart = '';
    var seriesLink = '';
    if ($seriesSpan.length) {
      var $seriesAnchor = $seriesSpan.find('a').first();
      seriesTitle = $seriesAnchor.text().trim();
      var seriesHref = $seriesAnchor.attr('href') || '';
      seriesLink = seriesHref.indexOf('http') === 0 ? seriesHref : 'https://archiveofourown.org' + seriesHref;
      var partMatch = $seriesSpan.text().match(/Part\s+(\d+)/i);
      seriesPart = partMatch ? partMatch[1] : '';
    }

    // Completion status, derived from "current/total" chapter count (e.g. "34/34" vs "20/?")
    var status = '';
    var chapterParts = chapters.split('/');
    if (chapterParts.length === 2) {
      var current = chapterParts[0].trim();
      var total = chapterParts[1].trim();
      status = (total !== '?' && current === total) ? 'Completed' : 'In progress';
    }

    var workIdMatch = location.pathname.match(/works\/(\d+)/);
    var link = workIdMatch ? 'https://archiveofourown.org/works/' + workIdMatch[1] : location.href;

    // field name -> value. The field name doubles as the CSS class on its element.
    var fields = [
      ['title', title],
      ['author', author],
      ['summary', summary],
      ['fandoms', fandoms],
      ['category', category],
      ['relationships', relationships],
      ['characters', characters],
      ['freeforms', freeforms],
      ['rating', rating],
      ['warnings', warnings],
      ['date', date],
      ['updated', updated],
      ['words', words],
      ['chapters', chapters],
      ['status', status],
      ['comments', comments],
      ['kudos', kudos],
      ['bookmarks', bookmarksCount],
      ['hits', hits],
      ['series-title', seriesTitle],
      ['series-part', seriesPart],
      ['series-link', seriesLink],
      ['link', link],
    ];

    var rowsHtml = fields.map(function (f) {
      var name = f[0];
      var value = escapeHtml(f[1]);
      return '<div class="ao3-row">' +
        '<div class="ao3-label">' + name + '</div>' +
        '<div class="' + name + '">' + value + '</div>' +
        '</div>';
    }).join('\n');

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>' + escapeHtml(title || 'AO3 Export') + '</title>' +
      '<style>' +
      'body{font-family:-apple-system,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#222;}' +
      '.ao3-row{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #eee;align-items:baseline;}' +
      '.ao3-label{flex:0 0 110px;font-weight:600;color:#900;text-transform:uppercase;font-size:11px;letter-spacing:0.03em;}' +
      '.ao3-row > div:not(.ao3-label){flex:1;word-break:break-word;}' +
      'h1{font-size:16px;color:#666;margin-bottom:4px;}' +
      '</style></head><body>' +
      '<h1>AO3 export — select each value below by its field name as a CSS class (e.g. <code>.title</code>, <code>.words</code>)</h1>' +
      rowsHtml +
      '</body></html>';

    var win = window.open('', '_blank');
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  var toolbar = document.querySelector('ul.work.navigation.actions');

  if (toolbar) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = 'javascript:void(0);';
    a.textContent = 'Export';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      generatePage();
    });
    li.appendChild(a);
    toolbar.appendChild(li);
  } else {
    // fallback: floating button, in case the toolbar markup isn't found
    var btn = document.createElement('button');
    btn.textContent = 'Generate Notion HTML';
    btn.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 16px;
      z-index: 999999;
      background: #900;
      color: #fff;
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    btn.addEventListener('click', generatePage);
    document.body.appendChild(btn);
  }
})();
