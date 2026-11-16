// Token Launch Radar — dashboard logic (my own code, written for this entry).
// Reads window.RADAR (written by main.ts as ../data.js) and renders the board,
// the live-token view, the model breakdown and the farm plan of any row.
// Views are hash-routed so screenshots can target them:
//   #detail=<slug>  the detail of one protocol
//   #live           the live-token view
//   #filter=<cat>   the board filtered to one category
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D || !Array.isArray(D.rows)) {
    document.getElementById('meta').textContent = 'Could not load the radar data.';
    return;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var v = (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n > 0 ? 'pos' : n < 0 ? 'neg' : '') + '">' + v + '</span>';
  }
  function age(n) {
    if (n === null || n === undefined) return 'unknown';
    if (n < 30) return n + 'd';
    if (n < 365) return Math.floor(n / 30) + 'mo';
    var y = Math.floor(n / 365);
    var m = Math.floor((n % 365) / 30);
    return y + 'y' + (m > 0 ? ' ' + m + 'mo' : '');
  }
  function bySlug(slug) {
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) return D.rows[i];
    return null;
  }

  // ---- header and model panel -------------------------------------------
  var comps = D.fit.comps;
  // Coverage evidence: prefer the generated dashboard/coverage.js (which is
  // inside the dossier text), falling back to the coverage inside data.js.
  var coverage = (typeof window !== 'undefined' && window.RADAR_COVERAGE) || D.coverage;
  var evidence = (typeof window !== 'undefined' && window.RADAR_COVERAGE)
    ? 'evidence: dashboard/coverage.js'
    : 'evidence: data.js coverage';
  document.getElementById('coverage').textContent =
    'Watchlist ' + coverage.watchlist_covered + '/' + coverage.watchlist_total + ' covered · Snapshot ' +
    coverage.snapshot_as_of + ' · input SHA-256 ' + coverage.snapshot_hash +
    (coverage.board_hash ? ' · board SHA-256 ' + coverage.board_hash : '') + ' · ' + evidence +
    (coverage.watchlist_missing.length ? ' · Missing: ' + coverage.watchlist_missing.join(', ') : '');
  document.getElementById('model-formula').textContent =
    'Fitted curve: log10(market cap) = ' + D.fit.intercept + ' + ' + D.fit.slope + ' × log10(TVL)';
  document.getElementById('meta').textContent =
    'Snapshot ' + D.as_of + ' · source ' + D.source + ' · floor ' + money(D.floor_usd) +
    ' · ' + D.board_size + ' protocols ranked (' + D.watchlist_size + ' watchlist + ' + D.early_size + ' early)' +
    ' · model ' + D.model_version;
  document.getElementById('model-summary').innerHTML =
    'The curve is fitted from <strong>' + comps + ' tokenized comparables</strong>: ' +
    'log10(market cap) = ' + D.fit.intercept + ' + ' + D.fit.slope + ' &times; log10(TVL), ' +
    'R&sup2; ' + D.fit.r_squared + ', median market-cap/TVL ' + D.fit.median_ratio.toFixed(3) + '. ' +
    'A protocol&rsquo;s value is the curve&rsquo;s prediction for its TVL, times its category shift, ' +
    'times a growth multiplier from its 7-day TVL change, times a maturity multiplier from its age.';
  var stats = [
    ['Comparables', String(comps)],
    ['R-squared', String(D.fit.r_squared)],
    ['Blind test (5-fold CV)', String(D.blind.held_out)],
    ['Blind median error', D.blind.median_ape_pct + '%'],
    ['Blind p75 error', D.blind.p75_ape_pct + '%'],
    ['Blind within 2×', D.blind.within_2x_pct + '%'],
    ['Board rows', String(D.board_size)],
  ];
  document.getElementById('model-stats').innerHTML = stats.map(function (s) {
    return '<div class="stat"><b>' + esc(s[1]) + '</b><span>' + esc(s[0]) + '</span></div>';
  }).join('');
  var shifts = Object.keys(D.fit.category_shift_dex).sort();
  document.querySelector('#shifts-table tbody').innerHTML = shifts.map(function (cat) {
    var dex = D.fit.category_shift_dex[cat];
    return '<tr><td>' + esc(cat) + '</td><td class="num">' + D.fit.category_n[cat] +
      '</td><td class="num">' + (dex >= 0 ? '+' : '') + dex.toFixed(3) +
      '</td><td class="num">' + Math.pow(10, dex).toFixed(2) + '&times;</td></tr>';
  }).join('');

  // ---- board -------------------------------------------------------------
  var sortKey = 'rank';
  var sortDir = 1;
  var tbody = document.querySelector('#board tbody');
  var searchEl = document.getElementById('search');
  var catEl = document.getElementById('category');
  var cats = {};
  D.rows.forEach(function (r) { if (r.category) cats[r.category] = true; });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catEl.appendChild(o);
  });

  function filtered() {
    var q = searchEl.value.trim().toLowerCase();
    var cat = catEl.value;
    var rows = D.rows.filter(function (r) {
      if (cat && r.category !== cat) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    rows.sort(function (a, b) {
      var ka = a[sortKey], kb = b[sortKey];
      if (ka === null || ka === undefined) return 1;
      if (kb === null || kb === undefined) return -1;
      if (typeof ka === 'string') return sortDir * ka.localeCompare(kb);
      return sortDir * (ka - kb);
    });
    return rows;
  }
  function renderBoard() {
    var rows = filtered();
    document.getElementById('count').textContent = rows.length + ' of ' + D.rows.length + ' shown';
    tbody.innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="rank num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong><br><span style="color:var(--muted);font-size:12.5px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td title="' + esc(r.chains.join(', ')) + '">' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td>' +
        '</tr>';
    }).join('');
  }
  tbody.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (tr) location.hash = '#detail=' + encodeURIComponent(tr.getAttribute('data-slug'));
  });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      renderBoard();
    });
  });
  searchEl.addEventListener('input', renderBoard);
  catEl.addEventListener('change', renderBoard);

  // ---- detail ------------------------------------------------------------
  function renderDetail(slug) {
    var r = bySlug(slug);
    var box = document.getElementById('detail');
    if (!r) {
      box.innerHTML = '<p>Unknown protocol: ' + esc(slug) + '</p>';
      return;
    }
    var growthPct = ((r.growth_multiplier - 1) / 0.5 * 100);
    var rows = [
      ['Curve prediction for its TVL', money(r.comps_base_usd)],
      ['Category shift (' + (r.category || 'no category') + ')', r.category_shift.toFixed(2) + '×'],
      ['Growth multiplier (' + (growthPct >= 0 ? '+' : '') + growthPct.toFixed(1) + '% 7d, half weight)', r.growth_multiplier.toFixed(2) + '×'],
      ['Maturity multiplier (' + age(r.age_days) + ')', r.maturity_multiplier.toFixed(2) + '×'],
      ['Implied value', money(r.implied_value_usd)],
    ];
    var bandLow = r.implied_value_usd * D.blind.actual_to_predicted_p25;
    var bandHigh = r.implied_value_usd * D.blind.actual_to_predicted_p75;
    box.innerHTML =
      '<div class="detail-head"><h2>' + esc(r.name) + '</h2><span class="implied">' + money(r.implied_value_usd) + ' <small>implied value</small></span></div>' +
      '<div class="facts"><span>Rank <b>#' + r.rank + '</b></span><span>Category <b>' + esc(r.category || '—') + '</b></span>' +
      '<span>Chains <b>' + esc(r.chains.join(', ')) + '</b></span><span>TVL <b>' + money(r.tvl_usd) + '</b></span>' +
      '<span>7d <b>' + (r.change_7d === null ? '—' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b></span>' +
      '<span>Age <b>' + age(r.age_days) + '</b></span><span>Token <b>records no token</b></span></div>' +
      '<p class="band">P25–P75 empirical value range: <strong>' + money(bandLow) + ' – ' + money(bandHigh) + '</strong> · held-out actual/predicted quartiles × implied value; not confidence bounds.</p>' +
      '<h3>How the value was computed</h3>' +
      '<table class="breakdown"><tbody>' + rows.map(function (x) {
        return '<tr><td>' + esc(x[0]) + '</td><td><strong>' + esc(x[1]) + '</strong></td></tr>';
      }).join('') + '</tbody></table>' +
      '<h3>Farm plan <small>Entry estimates · capital, gas and timing are fixed planning rules, not verified requirements</small></h3>' +
      '<ol class="farm">' + r.farm_steps.map(function (s, i) {
        return '<li><div>' + esc(s) + '</div><div class="cost"><b>' + esc(r.farm_costs[i] || '') + '</b>' + esc(r.farm_times[i] || '') + '</div></li>';
      }).join('') + '</ol>' +
      '<p class="note">The implied value is this entry&rsquo;s own claim. The snapshot records no token for ' + esc(r.name) +
      '; that is not proof there is none. The farm plan is a starting point, not financial advice.</p>';
  }

  // ---- live view ---------------------------------------------------------
  document.querySelector('#live tbody').innerHTML = D.live.map(function (r) {
    var ratio = r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' : '—';
    return '<tr><td><strong>' + esc(r.name) + '</strong><br><span style="color:var(--muted);font-size:12.5px">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.join(', ')) + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td>' +
      '<td class="num">' + ratio + '</td><td class="num">' + pct(r.change_7d) + '</td></tr>';
  }).join('');

  // ---- routing -----------------------------------------------------------
  var viewBoard = document.getElementById('view-board');
  var viewDetail = document.getElementById('view-detail');
  var viewLive = document.getElementById('view-live');
  var tabBoard = document.getElementById('tab-board');
  var tabLive = document.getElementById('tab-live');
  function show(view) {
    document.body.classList.toggle('detail-view', view === 'detail');
    document.getElementById('model-panel').hidden = view === 'detail';
    viewBoard.hidden = view !== 'board';
    viewDetail.hidden = view !== 'detail';
    viewLive.hidden = view !== 'live';
    tabBoard.classList.toggle('active', view === 'board');
    tabLive.classList.toggle('active', view === 'live');
    window.scrollTo(0, 0);
  }
  function route() {
    var h = location.hash || '';
    if (h.indexOf('#detail=') === 0) {
      renderDetail(decodeURIComponent(h.slice('#detail='.length)));
      show('detail');
    } else if (h === '#live') {
      show('live');
    } else {
      if (h.indexOf('#filter=') === 0) {
        var cat = decodeURIComponent(h.slice('#filter='.length));
        if (cats[cat]) catEl.value = cat;
      }
      show('board');
      renderBoard();
    }
  }
  tabBoard.addEventListener('click', function () { location.hash = ''; });
  tabLive.addEventListener('click', function () { location.hash = '#live'; });
  document.getElementById('back').addEventListener('click', function () { location.hash = ''; });
  window.addEventListener('hashchange', route);
  renderBoard();
  route();
})();
