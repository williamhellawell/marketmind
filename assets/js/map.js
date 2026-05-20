/* MarketMind map page logic. */
(function () {
  const FILTER_KEY = 'mm.filters';
  let map, markers = [], activePillEl = null, slideChart = null, timelineChart = null;

  const els = {
    quickbar: document.getElementById('company-quickbar'),
    sectors: document.getElementById('filter-sectors'),
    countries: document.getElementById('filter-countries'),
    fundingMin: document.getElementById('funding-min'),
    fundingMax: document.getElementById('funding-max'),
    reset: document.getElementById('filter-reset'),
    map: document.getElementById('map'),
    empty: document.getElementById('map-empty'),
    slideover: document.getElementById('slideover'),
    backdrop: document.getElementById('slideover-backdrop'),
    footerUpdated: document.getElementById('footer-updated'),
    timelineLegend: document.getElementById('timeline-legend'),
  };

  const TICKER_ITEMS = [
    { co: 'LOVABLE',     text: 'Raises $330M Series B at $6.6B valuation in record European AI round' },
    { co: 'LOVABLE',     text: 'Surpasses 25 million projects created in its first year of launch' },
    { co: 'ELEVENLABS',  text: 'Closes $500M Series D at $11B valuation backed by Nvidia and Sequoia' },
    { co: 'ELEVENLABS',  text: 'Hits $465M ARR as enterprise demand for voice AI accelerates globally' },
    { co: 'MISTRAL AI',  text: 'Secures €772M debt financing to expand its Paris AI data centre cluster' },
    { co: 'MISTRAL AI',  text: 'Le Chat assistant reaches 1 million daily users across European markets' },
    { co: 'LEXROOM',     text: 'Raises €42.9M Series B to scale legal AI across civil-law Europe' },
    { co: 'LEXROOM',     text: 'Onboards 8,000+ law firms across Italy, France, and Spain' },
    { co: 'HELSING',     text: 'Closes €1.1B Series E at €16.7B valuation, Europe\'s largest defence AI raise' },
    { co: 'HELSING',     text: 'Altra ISR platform deployed operationally with Ukrainian Armed Forces' },
  ];

  const BRAND_COLORS = {
    lovable:    '#FF5733',
    elevenlabs: '#18181B',
    mistral:    '#F97316',
    lexroom:    '#1B5FC1',
    helsing:    '#4B5563',
  };

  /* ---- TIMELINE MONTHS ---- */
  /* monthly ticks from 2021-01 to 2026-05 */
  const MONTHS = (function () {
    var out = [], y = 2021, m = 1;
    while (y < 2026 || (y === 2026 && m <= 5)) {
      out.push(y + '-' + (m < 10 ? '0' + m : '' + m));
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  })();

  function monthIndex(dateStr) {
    return MONTHS.indexOf(dateStr.slice(0, 7));
  }

  function buildCumulativeSeries(rounds) {
    var running = 0;
    var events = rounds.map(function (r) {
      return { idx: monthIndex(r.date), amount: r.amount_eur_m };
    }).sort(function (a, b) { return a.idx - b.idx; });

    return MONTHS.map(function (_, i) {
      events.forEach(function (e) { if (e.idx === i) running += e.amount; });
      return running > 0 ? running : null;
    });
  }

  function buildArrSeries(history) {
    var sorted = history.map(function (h) {
      return { idx: monthIndex(h.date), val: h.value_eur_m };
    }).sort(function (a, b) { return a.idx - b.idx; });

    var data = MONTHS.map(function () { return null; });
    sorted.forEach(function (p) { if (p.idx >= 0) data[p.idx] = p.val; });
    return data;
  }

  /* ---- NEWS TICKER ---- */
  function initTicker() {
    var el    = document.getElementById('ticker-text');
    var track = document.getElementById('ticker-track');
    if (!el || !track) return;

    var SPEED    = 60;  /* px per second */
    var FPS      = 30;
    var INTERVAL = 1000 / FPS;
    var idx = 0;
    var x   = 0;
    var endX = -600;

    function loadItem() {
      var item = TICKER_ITEMS[idx];
      idx = (idx + 1) % TICKER_ITEMS.length;
      el.innerHTML = '<b style="margin-right:12px;letter-spacing:.06em;font-size:11px">' +
        escapeHtml(item.co) + '</b>' + escapeHtml(item.text);
      x    = (track.clientWidth || window.innerWidth) + 10;
      endX = -(el.scrollWidth + 10);
    }

    loadItem();

    setInterval(function () {
      x -= SPEED / FPS;
      el.style.left = x + 'px';
      if (x < endX) { loadItem(); }
    }, INTERVAL);
  }

  /* ---- INIT ---- */
  function init() {
    initTicker();
    MM.load().then(function () {
      renderQuickbar();
      renderFilters();
      initMap();
      applyAndRender();
      renderTimeline('funding');
      els.footerUpdated.textContent = 'Data last refreshed ' + MM.latestUpdated();
    }).catch(function (err) {
      els.map.innerHTML = '<div style="padding:40px;text-align:center;color:#9CA3AF">Failed to load data: ' + err.message + '</div>';
    });

    els.backdrop.addEventListener('click', closeSlideover);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSlideover();
    });

    /* timeline toggle */
    document.querySelector('.timeline-toggle').addEventListener('click', function (e) {
      var btn = e.target.closest('.tgl-btn');
      if (!btn) return;
      document.querySelectorAll('.tgl-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderTimeline(btn.getAttribute('data-metric'));
    });
  }

  /* ---- QUICKBAR ---- */
  function renderQuickbar() {
    if (!els.quickbar) return;
    els.quickbar.innerHTML = MM.getAll().map(function (s) {
      return '<button class="company-qpill" data-id="' + s.id + '">' +
        '<img class="company-qpill-logo" src="' + escapeAttr(s.logo) + '" alt="" />' +
        escapeHtml(s.name) +
        '</button>';
    }).join('');

    els.quickbar.addEventListener('click', function (e) {
      var btn = e.target.closest('.company-qpill');
      if (!btn) return;
      openSlideover(btn.getAttribute('data-id'), null);
    });
  }

  /* ---- FILTERS ---- */
  function getFilters() {
    var saved = MM.readSession(FILTER_KEY, null);
    if (saved) return saved;
    return { sectors: [], countries: [], fundingMin: null, fundingMax: null };
  }

  function saveFilters(f) { MM.writeSession(FILTER_KEY, f); }

  function renderFilters() {
    var filters = getFilters();

    els.sectors.innerHTML = MM.uniqueSectors().map(function (s) {
      var active = filters.sectors.indexOf(s) !== -1;
      return '<button class="chip ' + (active ? 'active' : '') + '" data-sector="' + escapeAttr(s) + '">' +
        '<span class="chip-dot"></span>' + escapeHtml(s) + '</button>';
    }).join('');

    els.countries.innerHTML = MM.uniqueCountries().map(function (c) {
      var active = filters.countries.indexOf(c) !== -1;
      return '<button class="chip ' + (active ? 'active' : '') + '" data-country="' + escapeAttr(c) + '">' +
        escapeHtml(c) + '</button>';
    }).join('');

    if (filters.fundingMin != null) els.fundingMin.value = filters.fundingMin;
    if (filters.fundingMax != null) els.fundingMax.value = filters.fundingMax;

    els.sectors.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sector]');
      if (!btn) return;
      var val = btn.getAttribute('data-sector');
      toggleListItem(filters.sectors, val);
      saveFilters(filters);
      btn.classList.toggle('active');
      applyAndRender();
    });

    els.countries.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-country]');
      if (!btn) return;
      var val = btn.getAttribute('data-country');
      toggleListItem(filters.countries, val);
      saveFilters(filters);
      btn.classList.toggle('active');
      applyAndRender();
    });

    var onRange = function () {
      var f = getFilters();
      f.fundingMin = els.fundingMin.value === '' ? null : parseFloat(els.fundingMin.value);
      f.fundingMax = els.fundingMax.value === '' ? null : parseFloat(els.fundingMax.value);
      saveFilters(f);
      applyAndRender();
    };
    els.fundingMin.addEventListener('input', onRange);
    els.fundingMax.addEventListener('input', onRange);

    els.reset.addEventListener('click', function () {
      saveFilters({ sectors: [], countries: [], fundingMin: null, fundingMax: null });
      els.fundingMin.value = '';
      els.fundingMax.value = '';
      document.querySelectorAll('#filter-sectors .chip, #filter-countries .chip').forEach(function (c) {
        c.classList.remove('active');
      });
      applyAndRender();
    });
  }

  function toggleListItem(arr, val) {
    var i = arr.indexOf(val);
    if (i === -1) arr.push(val); else arr.splice(i, 1);
  }

  /* ---- MAP ---- */
  function initMap() {
    map = L.map('map', {
      center: [50.5, 10],
      zoom: 4,
      zoomControl: true,
      scrollWheelZoom: false,
      worldCopyJump: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);
    map.getContainer().addEventListener('click', mapPillClickDelegate, true);
  }

  function applyAndRender() {
    var filters = getFilters();
    var list = MM.applyFilters(filters);

    markers.forEach(function (m) { map.removeLayer(m); });
    markers = [];

    if (list.length === 0) {
      els.empty.hidden = false;
      els.map.style.display = 'none';
      return;
    }
    els.empty.hidden = true;
    els.map.style.display = '';

    list.forEach(function (s) {
      var icon = L.divIcon({
        className: 'mm-pill-wrap',
        html: '<button class="mm-pill" data-id="' + s.id + '" type="button">' +
              '<img class="mm-pill-logo" src="' + escapeAttr(s.logo) + '" alt="" />' +
              escapeHtml(s.name) + '</button>',
        iconSize: null,
        iconAnchor: [0, 0],
      });
      var m = L.marker([s.hq.lat, s.hq.lng], { icon: icon, riseOnHover: true }).addTo(map);
      markers.push(m);
    });

    setTimeout(function () { map.invalidateSize(); }, 50);
    var bounds = L.latLngBounds(list.map(function (s) { return [s.hq.lat, s.hq.lng]; }));
    if (list.length > 1) map.fitBounds(bounds.pad(0.5), { maxZoom: 5.5, animate: true });
  }

  function mapPillClickDelegate(e) {
    var pill = e.target.closest('.mm-pill');
    if (!pill) return;
    e.stopPropagation();
    e.preventDefault();
    openSlideover(pill.getAttribute('data-id'), pill);
  }

  /* ---- SLIDE-OVER ---- */
  function openSlideover(id, pillEl) {
    var s = MM.getById(id);
    if (!s) return;

    if (activePillEl) activePillEl.classList.remove('is-active');
    activePillEl = pillEl;
    if (pillEl) pillEl.classList.add('is-active');

    els.slideover.innerHTML = slideoverHtml(s);
    els.slideover.classList.add('open');
    els.slideover.setAttribute('aria-hidden', 'false');
    els.backdrop.classList.add('open');

    var closeBtn = els.slideover.querySelector('.slideover-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSlideover);
    var compareLink = els.slideover.querySelector('[data-action="compare"]');
    if (compareLink) compareLink.addEventListener('click', function (e) {
      e.preventDefault();
      window.location.href = 'compare.html?selected=' + s.id;
    });

    renderSlideChart(s);
  }

  function renderSlideChart(s) {
    var canvas = document.getElementById('slide-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    var all = MM.getAll();
    var max = {
      funding:   Math.max.apply(null, all.map(function (x) { return x.funding.total_eur_m; })),
      valuation: Math.max.apply(null, all.map(function (x) { return x.funding.valuation_eur_b; })),
      headcount: Math.max.apply(null, all.map(function (x) { return x.headcount; })),
      press:     Math.max.apply(null, all.map(function (x) { return x.traction.press_mentions_90d; })),
      arr:       Math.max.apply(null, all.map(function (x) { return x.traction.arr_eur_m; })),
    };
    var labels = ['Funding', 'Valuation', 'Headcount', 'Press 90d', 'ARR'];
    var values = [
      norm(s.funding.total_eur_m, max.funding),
      norm(s.funding.valuation_eur_b, max.valuation),
      norm(s.headcount, max.headcount),
      norm(s.traction.press_mentions_90d, max.press),
      norm(s.traction.arr_eur_m, max.arr),
    ];
    var rawVals = [
      MM.formatEur(s.funding.total_eur_m),
      MM.formatEurB(s.funding.valuation_eur_b),
      MM.formatNumber(s.headcount) + ' people',
      MM.formatNumber(s.traction.press_mentions_90d) + ' mentions',
      MM.formatEur(s.traction.arr_eur_m) + ' ARR',
    ];

    if (slideChart) slideChart.destroy();
    slideChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: 'rgba(29, 78, 216, 0.85)',
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 18,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return rawVals[ctx.dataIndex] + ' (' + Math.round(ctx.parsed.x * 100) + '% of peer max)'; },
              title: function () { return ''; },
            },
          },
        },
        scales: {
          x: {
            min: 0, max: 1,
            grid: { color: '#E5E7EB' },
            ticks: {
              font: { family: 'Inter', size: 10 }, color: '#9CA3AF',
              callback: function (v) { return Math.round(v * 100) + '%'; },
              stepSize: 0.25,
            },
          },
          y: {
            grid: { display: false },
            ticks: { font: { family: 'Inter', size: 11, weight: '500' }, color: '#0F172A' },
          },
        },
      },
    });
  }

  function norm(v, max) { return max > 0 ? v / max : 0; }

  function closeSlideover() {
    els.slideover.classList.remove('open');
    els.slideover.setAttribute('aria-hidden', 'true');
    els.backdrop.classList.remove('open');
    if (activePillEl) { activePillEl.classList.remove('is-active'); activePillEl = null; }
    if (slideChart) { slideChart.destroy(); slideChart = null; }
  }

  function slideoverHtml(s) {
    var last = s.funding.last_round;
    return (
      '<div class="slideover-header">' +
        '<img class="slideover-logo" src="' + escapeAttr(s.logo) + '" alt="' + escapeAttr(s.name + ' logo') + '" />' +
        '<div style="min-width:0;flex:1">' +
          '<h2 class="slideover-title">' + escapeHtml(s.name) + '</h2>' +
          '<div class="slideover-sub">' + escapeHtml(s.tagline) + '</div>' +
        '</div>' +
        '<button class="slideover-close" aria-label="Close">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="slideover-body">' +
        section('At a glance',
          '<dl class="slideover-kv">' +
            kv('HQ', s.hq.city + ', ' + s.hq.country) +
            kv('Founded', s.founded) +
            kv('Sector', s.sector) +
            kv('Headcount', MM.formatNumber(s.headcount)) +
            kv('Open roles', MM.formatNumber(s.open_roles)) +
          '</dl>'
        ) +
        section('Where it stands vs peers',
          '<div class="slideover-chart-wrap"><canvas id="slide-chart"></canvas></div>' +
          '<div class="slideover-chart-caption">Each bar shows ' + escapeHtml(s.name) + '’s value as a percentage of the highest among the five tracked companies.</div>'
        ) +
        section('Funding',
          '<dl class="slideover-kv">' +
            kv('Total raised', MM.formatEur(s.funding.total_eur_m)) +
            kv('Valuation', MM.formatEurB(s.funding.valuation_eur_b)) +
            kv('Last round', last.stage + ', ' + MM.formatEur(last.amount_eur_m) + ' (' + MM.formatDate(last.date) + ')') +
            kv('Lead investor', last.lead) +
          '</dl>' +
          '<div style="margin-top:10px"><div class="slideover-section-label">Notable investors</div>' +
          tagList(s.funding.notable_investors, 'neutral') + '</div>'
        ) +
        section('Founders', tagList(s.founders, 'neutral')) +
        section('Product',
          '<dl class="slideover-kv">' +
            kv('Target market', s.product.target_market) +
          '</dl>' +
          '<div style="margin-top:10px"><div class="slideover-section-label">Key products</div>' +
          tagList(s.product.key_products) + '</div>'
        ) +
        section('Traction',
          '<dl class="slideover-kv">' +
            kv('ARR (est.)', MM.formatEur(s.traction.arr_eur_m)) +
            kv('Press mentions, 90d', MM.formatNumber(s.traction.press_mentions_90d)) +
          '</dl>' +
          '<div style="margin-top:10px"><div class="slideover-section-label">Notable customers</div>' +
          tagList(s.traction.notable_customers, 'neutral') + '</div>'
        ) +
        section('Sources',
          '<ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary)">' +
            s.sources.map(function (u) {
              return '<li><a href="' + escapeAttr(u) + '" target="_blank" rel="noopener">' + escapeHtml(shortenUrl(u)) + '</a></li>';
            }).join('') +
          '</ul>'
        ) +
      '</div>' +
      '<div class="slideover-footer">' +
        '<a href="compare.html?selected=' + s.id + '" class="btn-primary" data-action="compare">Compare with others</a>' +
      '</div>'
    );
  }

  function section(label, body) {
    return '<div class="slideover-section">' +
      '<div class="slideover-section-label">' + escapeHtml(label) + '</div>' +
      body + '</div>';
  }

  function kv(k, v) {
    return '<dt>' + escapeHtml(k) + '</dt><dd>' + escapeHtml(String(v)) + '</dd>';
  }

  function tagList(items, modifier) {
    return '<div class="tag-list">' +
      items.map(function (i) {
        return '<span class="tag ' + (modifier || '') + '">' + escapeHtml(i) + '</span>';
      }).join('') + '</div>';
  }

  function shortenUrl(u) {
    try {
      var x = new URL(u);
      return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 30) + (x.pathname.length > 30 ? '...' : '') : '');
    } catch (e) { return u; }
  }

  /* ---- TIMELINE CHART ---- */
  function renderTimeline(metric) {
    var all = MM.getAll();
    var canvas = document.getElementById('chart-timeline');
    if (!canvas) return;

    var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    var datasets = all.map(function (s) {
      var color = BRAND_COLORS[s.id] || '#1D4ED8';
      var data = metric === 'funding'
        ? buildCumulativeSeries(s.funding_rounds || [])
        : buildArrSeries(s.arr_history || []);

      return {
        label: s.name,
        data: data,
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.07),
        borderWidth: 2.5,
        pointRadius: function (ctx) {
          return ctx.raw !== null ? 3 : 0;
        },
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        fill: metric === 'funding',
        stepped: metric === 'funding' ? 'after' : false,
        tension: metric === 'arr' ? 0.35 : 0,
        spanGaps: metric === 'arr',
      };
    });

    /* legend */
    if (els.timelineLegend) {
      els.timelineLegend.innerHTML = all.map(function (s) {
        var color = BRAND_COLORS[s.id] || '#1D4ED8';
        return '<div class="tl-legend-item">' +
          '<span class="tl-legend-line" style="background:' + color + '"></span>' +
          escapeHtml(s.name) + '</div>';
      }).join('');
    }

    if (timelineChart) timelineChart.destroy();
    timelineChart = new Chart(canvas, {
      type: 'line',
      data: { labels: MONTHS, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0F172A',
            padding: 12,
            cornerRadius: 10,
            titleFont: { family: 'Inter', size: 12, weight: '600' },
            bodyFont: { family: 'Inter', size: 12 },
            filter: function (item) { return item.parsed.y !== null; },
            callbacks: {
              title: function (items) {
                var lbl = items[0].label;
                var parts = lbl.split('-');
                return MONTH_NAMES[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
              },
              label: function (ctx) {
                if (ctx.parsed.y === null) return null;
                return ctx.dataset.label + ': ' + MM.formatEur(ctx.parsed.y);
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: '#F3F4F6' },
            border: { dash: [3, 3] },
            ticks: {
              font: { family: 'Inter', size: 11 },
              color: '#9CA3AF',
              maxRotation: 0,
              autoSkip: false,
              callback: function (val, idx) {
                var lbl = MONTHS[idx];
                if (!lbl) return '';
                /* show year label only on Jan */
                return lbl.slice(5) === '01' ? lbl.slice(0, 4) : '';
              },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: '#F3F4F6' },
            border: { dash: [3, 3] },
            ticks: {
              font: { family: 'Inter', size: 11 },
              color: '#9CA3AF',
              callback: function (v) { return MM.formatEur(v); },
            },
          },
        },
      },
    });
  }

  function hexToRgba(hex, a) {
    var m = hex.replace('#', '');
    var r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ---- UTILS ---- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function escapeAttr(s) { return escapeHtml(s); }

  document.addEventListener('DOMContentLoaded', init);
})();
