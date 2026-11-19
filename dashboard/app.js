// Token Launch Radar — the dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a live-token view, filters, sortable columns and
// a per-protocol detail drawer with the model's own arithmetic and the farm plan.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');

  var state = { q: '', cat: 'all', chain: 'all', watch: false, tab: 'pre', sort: 'rank', dir: 1, detail: null };

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length !== 2) return;
      var k = kv[0], v = decodeURIComponent(kv[1]);
      if (k === 'detail') state.detail = v;
      if (k === 'cat') state.cat = v;
      if (k === 'chain') state.chain = v;
      if (k === 'tab' && (v === 'pre' || v === 'live')) state.tab = v;
      if (k === 'watch') state.watch = v === '1';
    });
  }
  function writeHash() {
    var parts = [];
    if (state.tab !== 'pre') parts.push('tab=' + state.tab);
    if (state.cat !== 'all') parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.watch) parts.push('watch=1');
    if (state.detail) parts.push('detail=' + encodeURIComponent(state.detail));
    var h = parts.join('&');
    if (window.location.hash.replace(/^#/, '') !== h) history.replaceState(null, '', h ? '#' + h : window.location.pathname);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (child) node.appendChild(child);
    }
    return node;
  }

  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function fmtPct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d < 365) return d + 'd';
    return (d / 365).toFixed(1) + 'y';
  }
  function fmtMult(n) { return '×' + Number(n).toFixed(2); }

  // The page recomputes a row's implied value from the figures it shows, so what the
  // reader sees is the model's arithmetic, not a number pasted beside it.
  function impliedOf(r) {
    return Math.max(1, Math.round(r.tvl_usd * r.category_multiple * r.growth_multiplier * r.maturity_multiplier * r.breadth_multiplier));
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.cat !== 'all' && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      return true;
    });
  }
  function sorted(list) {
    var key = state.sort, dir = state.dir;
    var val = function (r) {
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'chg') return r.change_7d === null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null ? -1 : r.age_days;
      if (key === 'implied') return r.implied_value_usd;
      return r.rank;
    };
    return list.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      if (x < y) return -dir; if (x > y) return dir;
      return a.rank - b.rank;
    });
  }

  function header() {
    var cal = DATA.calibration;
    var topCats = cal.categories.slice().sort(function (a, b) { return b.traded - a.traded; }).slice(0, 4);
    var chips = [
      el('span', { 'class': 'chip', html: 'Market multiple (median) <b>' + fmtMult(cal.global_median) + '</b>' })
    ];
    topCats.forEach(function (c) {
      chips.push(el('span', { 'class': 'chip', html: c.category + ' <b>' + fmtMult(c.multiple) + '</b> <span class="up">n=' + c.traded + '</span>' }));
    });
    return el('div', null,
      el('p', { 'class': 'kicker', text: 'Token Launch Radar' }),
      el('h1', { html: 'Protocols with no token yet,<br><span class="thin">priced by the ones that have one.</span>' }),
      el('p', { 'class': 'lede', html: 'This board ranks <strong>' + DATA.board_size + ' pre-token protocols</strong> by implied value: what a launch would be worth if the market paid for their TVL what it already pays for comparable traded protocols. It covers all <strong>' + DATA.watchlist_size + ' watchlist</strong> protocols and <strong>' + DATA.early_size + ' early finds</strong> below the $50M floor. Every row carries a farm plan.' }),
      el('p', { 'class': 'meta', text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · model ' + DATA.model_version + ' · calibrated on ' + cal.traded_protocols + ' traded protocols' }),
      el('div', { 'class': 'calib' }, chips)
    );
  }

  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search protocols…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; render(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' },
      [el('option', { value: 'all', text: 'All categories' })].concat(cats.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.cat ? 'selected' : null });
      })));
    catSel.addEventListener('change', function () { state.cat = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' },
      [el('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null });
      })));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', checked: state.watch ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    var preBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre'; writeHash(); render(); } });
    var liveBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { 'class': 'controls' },
      search, catSel, chainSel,
      el('label', { 'class': 'toggle' }, watchBox, document.createTextNode('Watchlist only ★')),
      el('span', { 'class': 'tabs' }, preBtn, liveBtn)
    );
  }

  function sortTh(label, key, cls) {
    var arrow = state.sort === key ? (state.dir === 1 ? ' ↑' : ' ↓') : '';
    return el('th', {
      'class': (cls || '') + (state.sort === key ? ' sorted' : ''), text: label + arrow, scope: 'col',
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; if (key === 'rank') state.dir = 1; }
        render();
      }
    });
  }

  function boardTable() {
    var list = sorted(visibleRows());
    var rows = list.map(function (r) {
      var tr = el('tr', { 'class': r.slug === state.detail ? 'sel' : null, tabindex: '0' },
        el('td', { 'class': 'rank', text: '#' + r.rank }),
        el('td', null,
          el('span', { 'class': 'name', text: r.name + (r.watchlist ? ' ' : '') }),
          r.watchlist ? el('span', { 'class': 'star', text: '★', title: 'On the snapshot watchlist' }) : null,
          el('span', { 'class': 'cat', text: (r.category || 'Uncategorised') + ' · ' + r.slug })),
        el('td', { text: fmtUsd(r.tvl_usd) }),
        el('td', { 'class': r.change_7d === null ? null : (r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { 'class': 'hide-s', text: fmtAge(r.age_days) }),
        el('td', { 'class': 'chains hide-s', text: r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') }),
        el('td', { 'class': 'implied', text: fmtUsd(r.implied_value_usd) })
      );
      var open = function () { state.detail = r.slug; writeHash(); render(); scrollDrawer(); };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
      return tr;
    });
    return el('div', null,
      el('p', { 'class': 'count', text: list.length + ' of ' + DATA.board_size + ' protocols shown · click a row for its model breakdown and farm plan' }),
      el('table', null,
        el('thead', null, el('tr', null,
          sortTh('Rank', 'rank'), sortTh('Protocol', 'name'), sortTh('TVL', 'tvl'), sortTh('7d', 'chg'),
          sortTh('Age', 'age', 'hide-s'), el('th', { 'class': 'hide-s', text: 'Chains' }), sortTh('Implied value', 'implied'))),
        el('tbody', null, rows))
    );
  }

  function liveTable() {
    var rows = DATA.live.map(function (r) {
      return el('tr', null,
        el('td', null, el('span', { 'class': 'name', text: r.name }), el('span', { 'class': 'cat', text: (r.category || 'Uncategorised') + ' · ' + r.slug })),
        el('td', { 'class': 'implied', text: fmtUsd(r.mcap_usd) }),
        el('td', { text: fmtUsd(r.tvl_usd) }),
        el('td', { text: r.ratio === null ? '—' : fmtMult(r.ratio) }),
        el('td', { 'class': r.change_7d === null ? null : (r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) })
      );
    });
    return el('div', null,
      el('p', { 'class': 'count', text: 'These protocols already have a token: the board never ranks them. Their market caps are the calibration set — the multiples on the pre-token board are the medians of ratios like these, per category.' }),
      el('table', null,
        el('thead', null, el('tr', null,
          el('th', { text: 'Protocol' }), el('th', { text: 'Market cap' }), el('th', { text: 'TVL' }), el('th', { text: 'MCap / TVL' }), el('th', { text: '7d' }))),
        el('tbody', null, rows))
    );
  }

  function drawer() {
    if (!state.detail) return null;
    var r = null;
    DATA.rows.forEach(function (x) { if (x.slug === state.detail) r = x; });
    if (!r) return null;
    var check = impliedOf(r) === r.implied_value_usd;
    var close = el('button', { 'class': 'close', type: 'button', text: 'Close ✕', onclick: function () { state.detail = null; writeHash(); render(); } });
    return el('section', { 'class': 'drawer', id: 'drawer' },
      close,
      el('h2', { text: r.name + (r.watchlist ? ' ★' : '') }),
      el('p', { 'class': 'sub', text: (r.category || 'Uncategorised') + ' · tracked since ' + (r.listed_at || 'an unreported date') + ' · ' + r.chains.join(', ') + (r.watchlist ? ' · on the snapshot watchlist' : ' · an early find below the watchlist floor') }),
      el('div', { 'class': 'stats' },
        el('div', { 'class': 'stat' }, el('b', { text: fmtUsd(r.implied_value_usd) }), el('span', { text: 'Implied value' })),
        el('div', { 'class': 'stat' }, el('b', { text: fmtUsd(r.tvl_usd) }), el('span', { text: 'TVL' })),
        el('div', { 'class': 'stat' }, el('b', { text: fmtPct(r.change_7d) }), el('span', { text: 'TVL change 7d' })),
        el('div', { 'class': 'stat' }, el('b', { text: fmtAge(r.age_days) }), el('span', { text: 'Age, no token' })),
        el('div', { 'class': 'stat' }, el('b', { text: '#' + r.rank }), el('span', { text: 'Board rank' }))),
      el('p', { 'class': 'formula', html:
        fmtUsd(r.tvl_usd) + ' TVL × ' + fmtMult(r.category_multiple) + ' category multiple × ' + fmtMult(r.growth_multiplier) + ' growth × ' + fmtMult(r.maturity_multiplier) + ' maturity × ' + fmtMult(r.breadth_multiplier) + ' breadth = <span class="res">' + fmtUsd(r.implied_value_usd) + '</span>' + (check ? ' · recomputed by this page ✓' : '') }),
      el('h3', { text: 'How to farm it' }),
      el('ol', { 'class': 'steps' }, r.farm_steps.map(function (s) { return el('li', { text: s }); }))
    );
  }

  function method() {
    return el('div', null,
      el('section', { 'class': 'method' },
        el('h3', { text: 'How the value is derived' }),
        el('p', { html: 'Model <code>' + DATA.model_version + '</code> prices a pre-token protocol at <code>TVL × category multiple × growth × maturity × breadth</code>. The category multiple is the median market-cap/TVL ratio of that category\'s traded protocols in this same snapshot, shrunk toward the global median (' + fmtMult(DATA.calibration.global_median) + ') by sample size and clamped to ×0.04–×2.50. Growth reads the 7-day TVL change (clamped −50%…+100%, weighted 0.35). Maturity rises with the days DefiLlama has tracked the protocol tokenless, up to four years. Breadth adds 3% per extra chain, to seven. No protocol name is special-cased: one function prices every row, and this page recomputes each row it shows.' })),
      el('footer', { text: 'An implied value is this board\'s own claim about what a launch would be worth if the protocol\'s record stayed as it is. It is not a prediction that a token will be issued, or when. A protocol "records no token" in the snapshot\'s data; that is not proof it has none. Data: ' + DATA.source + '.' })
    );
  }

  function scrollDrawer() {
    var d = document.getElementById('drawer');
    if (d) d.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    app.appendChild(header());
    app.appendChild(controls());
    app.appendChild(state.tab === 'live' ? liveTable() : boardTable());
    var d = drawer();
    if (d && state.tab === 'pre') app.appendChild(d);
    app.appendChild(method());
  }

  readHash();
  render();
  if (state.detail) scrollDrawer();
})();
