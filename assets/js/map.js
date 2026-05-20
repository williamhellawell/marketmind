/* MarketMind map page logic. */
(function () {
  const FILTER_KEY = 'mm.filters';
  let map, markers = [], activePillEl = null, slideChart = null;

  const els = {
    statStrip: document.getElementById('stat-strip'),
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
  };

  const BRAND_COLORS = {
    lovable:    '#FF5733',
    elevenlabs: '#18181B',
    mistral:    '#F97316',
    lexroom:    '#1B5FC1',
    helsing:    '#4B5563',
  };

  function init() {
    MM.load().then(function () {
      renderStats();
      renderFilters();
      initMap();
      applyAndRender();
      renderSnapshotCharts();
      els.footerUpdated.textContent = 'Data last refreshed ' + MM.latestUpdated();
    }).catch(function (err) {
      els.map.innerHTML = '<div class="map-empty">Failed to load data: ' + err.message + '</div>';
    });

    els.backdrop.addEventListener('click', closeSlideover);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSlideover();
    });
  }

  function getFilters() {
    const saved = MM.readSession(FILTER_KEY, null);
    if (saved) return saved;
    return { sectors: [], countries: [], fundingMin: null, fundingMax: null };
  }

  function saveFilters(f) { MM.writeSession(FILTER_KEY, f); }

  function renderStats() {
    const all = MM.getAll();
    const totalFunding = all.reduce(function (s, x) { return s + x.funding.total_eur_m; }, 0);
    const countries = new Set(all.map(function (x) { return x.hq.country; }));
    const avgFounded = Math.round(all.reduce(function (s, x) { return s + x.founded; }, 0) / all.length);

    els.statStrip.innerHTML = [
      statCard('Companies tracked', all.length),
      statCard('Total funding', MM.formatEur(totalFunding)),
      statCard('Countries', countries.size),
      statCard('Avg founded', avgFounded),
    ].join('');
  }

  function statCard(label, value) {
    return '<div class="stat-card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
  }

  function renderFilters() {
    const filters = getFilters();

    els.sectors.innerHTML = MM.uniqueSectors().map(function (s) {
      const active = filters.sectors.indexOf(s) !== -1;
      return '<button class="chip ' + (active ? 'active' : '') + '" data-sector="' + escapeAttr(s) + '">' +
        '<span class="chip-dot"></span>' + escapeHtml(s) + '</button>';
    }).join('');

    els.countries.innerHTML = MM.uniqueCountries().map(function (c) {
      const active = filters.countries.indexOf(c) !== -1;
      return '<button class="chip ' + (active ? 'active' : '') + '" data-country="' + escapeAttr(c) + '">' +
        escapeHtml(c) + '</button>';
    }).join('');

    if (filters.fundingMin != null) els.fundingMin.value = filters.fundingMin;
    if (filters.fundingMax != null) els.fundingMax.value = filters.fundingMax;

    els.sectors.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-sector]');
      if (!btn) return;
      const val = btn.getAttribute('data-sector');
      toggleListItem(filters.sectors, val);
      saveFilters(filters);
      btn.classList.toggle('active');
      applyAndRender();
    });

    els.countries.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-country]');
      if (!btn) return;
      const val = btn.getAttribute('data-country');
      toggleListItem(filters.countries, val);
      saveFilters(filters);
      btn.classList.toggle('active');
      applyAndRender();
    });

    const onRange = function () {
      const f = getFilters();
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
    const i = arr.indexOf(val);
    if (i === -1) arr.push(val); else arr.splice(i, 1);
  }

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
    const filters = getFilters();
    const list = MM.applyFilters(filters);

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
      const icon = L.divIcon({
        className: 'mm-pill-wrap',
        html: '<button class="mm-pill" data-id="' + s.id + '" type="button">' +
              '<img class="mm-pill-logo" src="' + escapeAttr(s.logo) + '" alt="" />' +
              escapeHtml(s.name) + '</button>',
        iconSize: null,
        iconAnchor: [0, 0],
      });
      const m = L.marker([s.hq.lat, s.hq.lng], { icon: icon, riseOnHover: true }).addTo(map);
      markers.push(m);
    });

    setTimeout(function () { map.invalidateSize(); }, 50);
    const bounds = L.latLngBounds(list.map(function (s) { return [s.hq.lat, s.hq.lng]; }));
    if (list.length > 1) map.fitBounds(bounds.pad(0.5), { maxZoom: 5.5, animate: true });
  }

  function mapPillClickDelegate(e) {
    const pill = e.target.closest('.mm-pill');
    if (!pill) return;
    e.stopPropagation();
    e.preventDefault();
    const id = pill.getAttribute('data-id');
    openSlideover(id, pill);
  }

  function openSlideover(id, pillEl) {
    const s = MM.getById(id);
    if (!s) return;

    if (activePillEl) activePillEl.classList.remove('is-active');
    activePillEl = pillEl;
    if (pillEl) pillEl.classList.add('is-active');

    els.slideover.innerHTML = slideoverHtml(s);
    els.slideover.classList.add('open');
    els.slideover.setAttribute('aria-hidden', 'false');
    els.backdrop.classList.add('open');

    const closeBtn = els.slideover.querySelector('.slideover-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSlideover);
    const compareLink = els.slideover.querySelector('[data-action="compare"]');
    if (compareLink) compareLink.addEventListener('click', function (e) {
      e.preventDefault();
      window.location.href = 'compare.html?selected=' + s.id;
    });

    renderSlideChart(s);
  }

  function renderSlideChart(s) {
    const canvas = document.getElementById('slide-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const all = MM.getAll();
    const max = {
      funding: Math.max.apply(null, all.map(function (x) { return x.funding.total_eur_m; })),
      valuation: Math.max.apply(null, all.map(function (x) { return x.funding.valuation_eur_b; })),
      headcount: Math.max.apply(null, all.map(function (x) { return x.headcount; })),
      press: Math.max.apply(null, all.map(function (x) { return x.traction.press_mentions_90d; })),
      arr: Math.max.apply(null, all.map(function (x) { return x.traction.arr_eur_m; })),
    };
    const labels = ['Funding', 'Valuation', 'Headcount', 'Press 90d', 'ARR'];
    const values = [
      norm(s.funding.total_eur_m, max.funding),
      norm(s.funding.valuation_eur_b, max.valuation),
      norm(s.headcount, max.headcount),
      norm(s.traction.press_mentions_90d, max.press),
      norm(s.traction.arr_eur_m, max.arr),
    ];
    const rawVals = [
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
              label: function (ctx) {
                return rawVals[ctx.dataIndex] + ' (' + Math.round(ctx.parsed.x * 100) + '% of peer max)';
              },
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
    const last = s.funding.last_round;
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
          '<div class="slideover-chart-caption">Each bar shows ' + escapeHtml(s.name) + '&rsquo;s value as a percentage of the highest among the five tracked companies. 100% means leading the pack.</div>'
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
      const x = new URL(u);
      return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 30) + (x.pathname.length > 30 ? '...' : '') : '');
    } catch (e) { return u; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function escapeAttr(s) { return escapeHtml(s); }

  function renderSnapshotCharts() {
    const all = MM.getAll();
    const labels = all.map(function (s) { return s.name; });
    const colors = all.map(function (s) { return BRAND_COLORS[s.id] || '#1D4ED8'; });
    const raisedData = all.map(function (s) { return s.funding.total_eur_m; });
    const arrData = all.map(function (s) { return s.traction.arr_eur_m; });

    function barConfig(data, unit) {
      return {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: colors,
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 32,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) { return MM.formatEur(ctx.parsed.x); },
                title: function (ctx) { return ctx[0].label; },
              },
              backgroundColor: '#0F172A',
              padding: 10,
              cornerRadius: 8,
              titleFont: { family: 'Inter', size: 12, weight: '600' },
              bodyFont: { family: 'Inter', size: 12 },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: '#F3F4F6' },
              border: { dash: [3, 3] },
              ticks: {
                font: { family: 'Inter', size: 10 },
                color: '#9CA3AF',
                callback: function (v) { return MM.formatEur(v); },
              },
            },
            y: {
              grid: { display: false },
              ticks: {
                font: { family: 'Inter', size: 12, weight: '600' },
                color: '#0F172A',
                callback: function (val, idx) {
                  var s = all[idx];
                  return s ? s.name : val;
                },
              },
            },
          },
        },
      };
    }

    new Chart(document.getElementById('chart-raised'), barConfig(raisedData, '€M'));
    new Chart(document.getElementById('chart-arr'), barConfig(arrData, '€M'));

    function renderLegend(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = all.map(function (s) {
        return '<div class="legend-item">' +
          '<span class="legend-dot" style="background:' + (BRAND_COLORS[s.id] || '#1D4ED8') + '"></span>' +
          escapeHtml(s.name) +
          '</div>';
      }).join('');
    }
    renderLegend('legend-raised');
    renderLegend('legend-arr');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
