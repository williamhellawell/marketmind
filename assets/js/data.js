/* MarketMind shared data module. Loads startups.json and exposes helpers on window.MM. */
(function () {
  const STATE = {
    data: null,
    ready: null,
  };

  function load() {
    if (STATE.ready) return STATE.ready;
    STATE.ready = fetch('assets/data/startups.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load startups.json: ' + r.status);
        return r.json();
      })
      .then(function (json) {
        STATE.data = json;
        return json;
      });
    return STATE.ready;
  }

  function getAll() {
    return STATE.data ? STATE.data.startups : [];
  }

  function getById(id) {
    return getAll().find(function (s) { return s.id === id; }) || null;
  }

  function uniqueSectors() {
    const set = new Set();
    getAll().forEach(function (s) { set.add(s.sector); });
    return Array.from(set).sort();
  }

  function uniqueCountries() {
    const set = new Set();
    getAll().forEach(function (s) { set.add(s.hq.country); });
    return Array.from(set).sort();
  }

  function fundingBounds() {
    const vals = getAll().map(function (s) { return s.funding.total_eur_m; });
    return { min: Math.floor(Math.min.apply(null, vals)), max: Math.ceil(Math.max.apply(null, vals)) };
  }

  function applyFilters(filters) {
    const list = getAll();
    return list.filter(function (s) {
      if (filters.sectors && filters.sectors.length && filters.sectors.indexOf(s.sector) === -1) return false;
      if (filters.countries && filters.countries.length && filters.countries.indexOf(s.hq.country) === -1) return false;
      const f = s.funding.total_eur_m;
      if (filters.fundingMin != null && f < filters.fundingMin) return false;
      if (filters.fundingMax != null && f > filters.fundingMax) return false;
      return true;
    });
  }

  function formatEur(amountM) {
    if (amountM == null) return 'n/a';
    if (amountM >= 1000) return '€' + (amountM / 1000).toFixed(2).replace(/\.00$/, '') + 'B';
    return '€' + Math.round(amountM) + 'M';
  }

  function formatEurB(b) {
    if (b == null) return 'n/a';
    if (b >= 1) return '€' + b.toFixed(2).replace(/\.00$/, '') + 'B';
    return '€' + Math.round(b * 1000) + 'M';
  }

  function formatNumber(n) {
    if (n == null) return 'n/a';
    return n.toLocaleString('en-US');
  }

  function formatDate(iso) {
    if (!iso) return 'n/a';
    const parts = iso.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const m = months[parseInt(parts[1], 10) - 1] || '';
    return m + ' ' + parts[0];
  }

  function latestUpdated() {
    const dates = getAll().map(function (s) { return s.last_updated; }).sort();
    return dates[dates.length - 1] || '';
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  function readSession(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeSession(key, val) {
    try { sessionStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  window.MM = {
    load: load,
    getAll: getAll,
    getById: getById,
    uniqueSectors: uniqueSectors,
    uniqueCountries: uniqueCountries,
    fundingBounds: fundingBounds,
    applyFilters: applyFilters,
    formatEur: formatEur,
    formatEurB: formatEurB,
    formatNumber: formatNumber,
    formatDate: formatDate,
    latestUpdated: latestUpdated,
    showToast: showToast,
    readSession: readSession,
    writeSession: writeSession,
  };
})();
