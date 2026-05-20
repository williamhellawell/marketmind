/* MarketMind compare page logic. */
(function () {
  const SELECTED_KEY = 'mm.compare.selected';
  const METRICS_KEY = 'mm.compare.metrics';

  const METRIC_GROUPS = [
    { id: 'funding', label: 'Funding & valuation' },
    { id: 'team', label: 'Team & growth' },
    { id: 'product', label: 'Product & sector' },
    { id: 'traction', label: 'Traction' },
  ];

  const els = {
    selectCompanies: document.getElementById('select-companies'),
    selectMetrics: document.getElementById('select-metrics'),
    copyBtn: document.getElementById('copy-markdown'),
    thead: document.getElementById('compare-thead'),
    tbody: document.getElementById('compare-tbody'),
    footerUpdated: document.getElementById('footer-updated'),
  };

  let charts = { funding: null, headcount: null, radar: null };

  function init() {
    MM.load().then(function () {
      hydrateFromQuery();
      renderSelectors();
      renderAll();
      els.footerUpdated.textContent = 'Data last refreshed ' + MM.latestUpdated();
    });
    els.copyBtn.addEventListener('click', copyAsMarkdown);
  }

  function hydrateFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('selected');
    if (q) {
      const ids = q.split(',').filter(Boolean);
      MM.writeSession(SELECTED_KEY, ids);
    }
  }

  function getSelected() {
    const ids = MM.readSession(SELECTED_KEY, null);
    if (ids && ids.length) return ids;
    return MM.getAll().map(function (s) { return s.id; });
  }

  function getMetrics() {
    const saved = MM.readSession(METRICS_KEY, null);
    if (saved && saved.length) return saved;
    return METRIC_GROUPS.map(function (g) { return g.id; });
  }

  function renderSelectors() {
    const selected = getSelected();
    const metrics = getMetrics();

    els.selectCompanies.innerHTML = MM.getAll().map(function (s) {
      const active = selected.indexOf(s.id) !== -1;
      return '<button class="chip ' + (active ? 'active' : '') + '" data-id="' + s.id + '">' +
        '<span class="chip-dot"></span>' + escapeHtml(s.name) + '</button>';
    }).join('');

    els.selectMetrics.innerHTML = METRIC_GROUPS.map(function (g) {
      const active = metrics.indexOf(g.id) !== -1;
      return '<button class="chip ' + (active ? 'active' : '') + '" data-metric="' + g.id + '">' +
        escapeHtml(g.label) + '</button>';
    }).join('');

    els.selectCompanies.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const current = getSelected();
      const i = current.indexOf(id);
      if (i === -1) current.push(id); else current.splice(i, 1);
      if (current.length === 0) { MM.showToast('Select at least one company'); current.push(id); return; }
      MM.writeSession(SELECTED_KEY, current);
      btn.classList.toggle('active');
      renderAll();
    });

    els.selectMetrics.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-metric]');
      if (!btn) return;
      const id = btn.getAttribute('data-metric');
      const current = getMetrics();
      const i = current.indexOf(id);
      if (i === -1) current.push(id); else current.splice(i, 1);
      if (current.length === 0) { MM.showToast('Select at least one metric group'); current.push(id); return; }
      MM.writeSession(METRICS_KEY, current);
      btn.classList.toggle('active');
      renderTable();
    });
  }

  function renderAll() { renderTable(); renderCharts(); }

  function buildRows(selectedIds, metricIds) {
    const startups = selectedIds.map(MM.getById).filter(Boolean);
    const rows = [];

    function group(label) { rows.push({ type: 'group', label: label }); }
    function row(label, getter, kind) {
      rows.push({ type: 'row', label: label, kind: kind || 'text', values: startups.map(getter) });
    }

    if (metricIds.indexOf('funding') !== -1) {
      group('Funding & valuation');
      row('Total raised', function (s) { return s.funding.total_eur_m; }, 'eur-m');
      row('Valuation', function (s) { return s.funding.valuation_eur_b; }, 'eur-b');
      row('Last round', function (s) { return s.funding.last_round.stage + ' (' + MM.formatDate(s.funding.last_round.date) + ')'; });
      row('Last round size', function (s) { return s.funding.last_round.amount_eur_m; }, 'eur-m');
      row('Lead investor', function (s) { return s.funding.last_round.lead; });
      row('Notable investors', function (s) { return s.funding.notable_investors.join(', '); });
    }
    if (metricIds.indexOf('team') !== -1) {
      group('Team & growth');
      row('Headcount', function (s) { return s.headcount; }, 'number');
      row('Open roles', function (s) { return s.open_roles; }, 'number');
      row('Founded', function (s) { return s.founded; });
      row('HQ', function (s) { return s.hq.city + ', ' + s.hq.country; });
      row('Founders', function (s) { return s.founders.join(', '); });
    }
    if (metricIds.indexOf('product') !== -1) {
      group('Product & sector');
      row('Sector', function (s) { return s.sector; });
      row('Target market', function (s) { return s.product.target_market; });
      row('Key products', function (s) { return s.product.key_products.join(', '); });
    }
    if (metricIds.indexOf('traction') !== -1) {
      group('Traction');
      row('ARR (est.)', function (s) { return s.traction.arr_eur_m; }, 'eur-m');
      row('Press mentions, 90d', function (s) { return s.traction.press_mentions_90d; }, 'number');
      row('Notable customers', function (s) { return s.traction.notable_customers.join('; '); });
    }
    return { startups: startups, rows: rows };
  }

  function renderTable() {
    const selected = getSelected();
    const metrics = getMetrics();
    const built = buildRows(selected, metrics);

    els.thead.innerHTML = '<th>Metric</th>' + built.startups.map(function (s) {
      return '<th>' + escapeHtml(s.name) + '</th>';
    }).join('');

    els.tbody.innerHTML = built.rows.map(function (r) {
      if (r.type === 'group') {
        return '<tr class="group-header"><td colspan="' + (built.startups.length + 1) + '">' + escapeHtml(r.label) + '</td></tr>';
      }
      const isNumeric = r.kind === 'eur-m' || r.kind === 'eur-b' || r.kind === 'number';
      let maxIdx = -1;
      if (isNumeric) {
        let max = -Infinity;
        r.values.forEach(function (v, i) { if (typeof v === 'number' && v > max) { max = v; maxIdx = i; } });
      }
      const cells = r.values.map(function (v, i) {
        const cls = (isNumeric ? 'numeric' : '') + (i === maxIdx ? ' is-max' : '');
        return '<td class="' + cls + '">' + escapeHtml(formatValue(v, r.kind)) + '</td>';
      }).join('');
      return '<tr><td>' + escapeHtml(r.label) + '</td>' + cells + '</tr>';
    }).join('');
  }

  function formatValue(v, kind) {
    if (v == null || v === '') return 'n/a';
    if (kind === 'eur-m') return MM.formatEur(v);
    if (kind === 'eur-b') return MM.formatEurB(v);
    if (kind === 'number') return MM.formatNumber(v);
    return String(v);
  }

  function renderCharts() {
    const selected = getSelected();
    const startups = selected.map(MM.getById).filter(Boolean);
    const labels = startups.map(function (s) { return s.name; });
    const accent = '#1D4ED8';
    const accentSoft = 'rgba(29, 78, 216, 0.16)';

    const fundingData = startups.map(function (s) { return s.funding.total_eur_m; });
    const headcountData = startups.map(function (s) { return s.headcount; });

    drawBar('chart-funding', 'funding', labels, fundingData, '€M', accent);
    drawBar('chart-headcount', 'headcount', labels, headcountData, 'people', accent);

    const radarLabels = ['Funding', 'Valuation', 'Headcount', 'Press 90d', 'ARR'];
    const allStartups = MM.getAll();
    const max = {
      funding: Math.max.apply(null, allStartups.map(function (s) { return s.funding.total_eur_m; })),
      valuation: Math.max.apply(null, allStartups.map(function (s) { return s.funding.valuation_eur_b; })),
      headcount: Math.max.apply(null, allStartups.map(function (s) { return s.headcount; })),
      press: Math.max.apply(null, allStartups.map(function (s) { return s.traction.press_mentions_90d; })),
      arr: Math.max.apply(null, allStartups.map(function (s) { return s.traction.arr_eur_m; })),
    };

    const palette = ['#1D4ED8', '#0EA5E9', '#6366F1', '#8B5CF6', '#0F766E'];
    const datasets = startups.map(function (s, i) {
      const color = palette[i % palette.length];
      return {
        label: s.name,
        data: [
          norm(s.funding.total_eur_m, max.funding),
          norm(s.funding.valuation_eur_b, max.valuation),
          norm(s.headcount, max.headcount),
          norm(s.traction.press_mentions_90d, max.press),
          norm(s.traction.arr_eur_m, max.arr),
        ],
        backgroundColor: hexToRgba(color, 0.14),
        borderColor: color,
        borderWidth: 2,
        pointBackgroundColor: color,
        pointRadius: 3,
      };
    });

    if (charts.radar) charts.radar.destroy();
    charts.radar = new Chart(document.getElementById('chart-radar'), {
      type: 'radar',
      data: { labels: radarLabels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          r: {
            min: 0, max: 1,
            ticks: { display: false, stepSize: 0.25 },
            grid: { color: '#E5E7EB' },
            angleLines: { color: '#E5E7EB' },
            pointLabels: { font: { family: 'Inter', size: 12, weight: '500' }, color: '#6B7280' },
          },
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { family: 'Inter', size: 12 }, color: '#0F172A' } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ': ' + (ctx.parsed.r * 100).toFixed(0) + '% of peer max';
              },
            },
          },
        },
      },
    });
  }

  function drawBar(canvasId, key, labels, data, unit, color) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: hexToRgba(color, 0.85),
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 36,
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
                const v = ctx.parsed.x;
                if (unit === '€M') return MM.formatEur(v);
                return MM.formatNumber(v) + ' ' + unit;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: '#E5E7EB' },
            ticks: {
              font: { family: 'Inter', size: 11 }, color: '#6B7280',
              callback: function (v) { return unit === '€M' ? MM.formatEur(v) : MM.formatNumber(v); },
            },
          },
          y: {
            grid: { display: false },
            ticks: { font: { family: 'Inter', size: 12, weight: '500' }, color: '#0F172A' },
          },
        },
      },
    });
  }

  function norm(v, max) { return max > 0 ? v / max : 0; }

  function hexToRgba(hex, a) {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function copyAsMarkdown() {
    const selected = getSelected();
    const metrics = getMetrics();
    const built = buildRows(selected, metrics);
    const header = '| Metric | ' + built.startups.map(function (s) { return s.name; }).join(' | ') + ' |';
    const sep = '|' + new Array(built.startups.length + 1).fill('---').join('|') + '|';
    const lines = [header, sep];
    built.rows.forEach(function (r) {
      if (r.type === 'group') {
        lines.push('| **' + r.label + '** | ' + new Array(built.startups.length).fill('').join(' | ') + ' |');
      } else {
        lines.push('| ' + r.label + ' | ' + r.values.map(function (v) { return formatValue(v, r.kind); }).join(' | ') + ' |');
      }
    });
    const md = lines.join('\n');
    navigator.clipboard.writeText(md).then(function () {
      MM.showToast('Copied table as Markdown');
    }).catch(function () {
      MM.showToast('Copy failed, select and copy manually');
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
