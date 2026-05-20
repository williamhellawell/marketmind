/* MarketMind map page logic. */
(function () {
  const FILTER_KEY = 'mm.filters';
  let map, markers = [], activePillEl = null;

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

  function init() {
    MM.load().then(function () {
      renderStats();
      renderFilters();
      initMap();
      applyAndRender();
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
              '<span class="mm-pill-dot"></span>' + escapeHtml(s.name) + '</button>',
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
  }

  function closeSlideover() {
    els.slideover.classList.remove('open');
    els.slideover.setAttribute('aria-hidden', 'true');
    els.backdrop.classList.remove('open');
    if (activePillEl) { activePillEl.classList.remove('is-active'); activePillEl = null; }
  }

  function slideoverHtml(s) {
    const last = s.funding.last_round;
    return (
      '<div class="slideover-header">' +
        '<div>' +
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

  document.addEventListener('DOMContentLoaded', init);
})();
