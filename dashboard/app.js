// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, filters and sorting, a per-protocol detail dialog with the model's own
// inputs and the protocol's farm plan, a live-token view and the model table. No network: every
// byte it shows is in data.js. State lives in the URL hash, so a filtered view or a detail view
// is a link: #/protocol/<slug> opens a protocol, #/?q=&cat=&chain=&min=&watch=1 filters the board.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // The model, recomputed in the page from the row's own figures, so the page's arithmetic and
  // board.json's number are visibly the same: TVL x category multiple x growth x maturity.
  // The factors are rounded to 4 decimals before they multiply, exactly as the model does.
  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = round4(1 + (growth / 100) * model.growth_weight);
    var maturity = row.age_days === null || row.age_days === undefined
      ? model.unknown_maturity
      : round4(model.maturity_floor + (Math.min(Math.max(row.age_days, 0), model.maturity_days) / model.maturity_days) * model.maturity_range);
    return Math.max(1, Math.round(row.tvl_usd * row.base_multiple * growthMult * maturity));
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL, age.
  function capitalFor(row) {
    if (row.tvl_usd >= 1e9) return 200;
    if (row.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdFor(row) {
    if (row.age_days === null || row.age_days === undefined) return 45;
    if (row.age_days < 180) return 90;
    if (row.age_days < 365) return 60;
    return 30;
  }
  function actionFor(row, capital) {
    var c = (row.category || '').toLowerCase();
    var chain = row.chains && row.chains.length ? row.chains[0] : 'its main chain';
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC into ' + name + ' on ' + chain + ' through its app and leave the loan open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + '\'s deepest pool on ' + chain + ' and hold the LP position.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s basis vault on ' + chain + ' and keep the position open.';
    if (c.indexOf('chain') >= 0 && c.indexOf('cross') < 0) return 'Bridge $' + capital + ' to ' + chain + ', use ' + name + '\'s native apps once, and hold a position there.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ', keeping the volume in one wallet.';
    if (c.indexOf('restak') >= 0) return 'Restake $' + capital + ' of ETH through ' + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('staking') >= 0) return 'Stake $' + capital + ' through ' + name + '\'s pool on ' + chain + ' and keep the receipt.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' in ' + name + '\'s incentives vault on ' + chain + ' and vote once.';
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' into ' + name + '\'s yield product on ' + chain + ' and hold the position.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(row) {
    var capital = capitalFor(row);
    var hold = holdFor(row);
    var steps = [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper, never in a screenshot or chat.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(row, capital), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week, a deposit, a swap, a vote or a borrow, from the same wallet.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity spans more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, check the protocol\'s own points or rewards page and claim only through a link it publishes.', cost: 'free to check, and never pay to claim', time: '10 minutes' },
      { text: 'Log the wallet, the dates and every transaction hash, so you can repeat the position or unwind it cleanly.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    return steps.map(function (s) {
      var out = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      if (out.length > 600) out = out.slice(0, 596) + '...';
      return out;
    });
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // Watchlist membership, carried in the data as the snapshot's own list of slugs.
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchOnly && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'change') d = (a.change_7d === null ? -9999 : a.change_7d) - (b.change_7d === null ? -9999 : b.change_7d);
      else if (key === 'age') d = (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days);
      else if (key === 'name') d = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      if (d === 0) d = a.slug < b.slug ? -1 : 1;
      return d * state.dir;
    });
    return rows;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', null,
        el('div', { class: 'eyebrow', text: 'Token Radar · model ' + DATA.model_version }),
        el('h1', { text: 'Pre-token protocols, ranked by implied value' })
      ),
      el('p', { class: 'meta', html: 'Snapshot <b>' + esc(DATA.as_of) + '</b> · ' + esc(DATA.source.split(', fetched')[0]) })
    );
  }
  function lede() {
    return el('p', { class: 'lede', html:
      'Every protocol below records <b>no token</b> in the snapshot. Its implied value is what a token ' +
      'would be worth if it launched with the record unchanged: TVL times a multiple drawn from the ' +
      'listed protocols in its own category, adjusted for 7-day growth and for how long it has run ' +
      'without a token. <b>This is an estimate, not a price</b>, and it says nothing about whether or ' +
      'when a token launches. The board covers all <b class="num">' + DATA.watchlist_size + '</b> watchlist ' +
      'protocols, plus <b class="num">' + DATA.early_size + '</b> more pre-token protocols below the floor.' });
  }
  function stats() {
    var top = DATA.rows[0];
    var total = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    return el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('span', { text: 'Protocols in snapshot' }), el('b', { class: 'num', text: String(DATA.snapshot_size) })),
      el('div', { class: 'stat' }, el('span', { text: 'On the watchlist' }), el('b', { class: 'num', text: String(DATA.watchlist_size) })),
      el('div', { class: 'stat' }, el('span', { text: 'Board rows' }), el('b', { class: 'num', text: String(DATA.board_size) })),
      el('div', { class: 'stat' }, el('span', { text: 'Top implied value' }), el('b', { class: 'num', text: top ? fmtUsd(top.implied_value_usd) : 'n/a' })),
      el('div', { class: 'stat' }, el('span', { text: 'Board total' }), el('b', { class: 'num', text: fmtUsd(total) }))
    );
  }
  function tabs() {
    var defs = [['pre-token', 'Pre-token board'], ['live', 'Live tokens'], ['model', 'The model']];
    return el('div', { class: 'tabs', role: 'tablist' }, defs.map(function (d) {
      return el('button', { class: 'tab', role: 'tab', 'aria-selected': String(state.tab === d[0]), text: d[1], onclick: function () { state.tab = d[0]; state.selected = null; syncHash(); render(); } });
    }));
  }
  function controls() {
    var cats = {};
    DATA.rows.forEach(function (r) { cats[r.category || 'Uncategorised'] = true; });
    var catOpts = [el('option', { value: 'all', text: 'All categories' })].concat(Object.keys(cats).sort().map(function (c) {
      return el('option', { value: c, text: c, selected: state.category === c ? 'selected' : null });
    }));
    var chains = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chains[c] = true; }); });
    var chainOpts = [el('option', { value: 'all', text: 'All chains' })].concat(Object.keys(chains).sort().map(function (c) {
      return el('option', { value: c, text: c, selected: state.chain === c ? 'selected' : null });
    }));
    var minOpts = [[0, 'Any TVL'], [1e8, 'TVL ≥ $100M'], [5e8, 'TVL ≥ $500M'], [1e9, 'TVL ≥ $1B']].map(function (m) {
      return el('option', { value: String(m[0]), text: m[1], selected: state.minTvl === m[0] ? 'selected' : null });
    });
    var sortOpts = [['implied', 'Implied value'], ['tvl', 'TVL'], ['change', '7-day change'], ['age', 'Age'], ['name', 'Name']].map(function (s) {
      return el('option', { value: s[0], text: 'Sort: ' + s[1], selected: state.sort === s[0] ? 'selected' : null });
    });
    return el('div', { class: 'controls' },
      el('input', { type: 'search', placeholder: 'Search name, slug or category…', value: state.q, 'aria-label': 'Search protocols', oninput: function (e) { state.q = e.target.value; syncHash(); render(); } }),
      el('select', { 'aria-label': 'Category', onchange: function (e) { state.category = e.target.value; syncHash(); render(); } }, catOpts),
      el('select', { 'aria-label': 'Chain', onchange: function (e) { state.chain = e.target.value; syncHash(); render(); } }, chainOpts),
      el('select', { 'aria-label': 'Minimum TVL', onchange: function (e) { state.minTvl = Number(e.target.value); syncHash(); render(); } }, minOpts),
      el('select', { 'aria-label': 'Sort by', onchange: function (e) { state.sort = e.target.value; syncHash(); render(); } }, sortOpts),
      el('label', null, el('input', { type: 'checkbox', checked: state.watchOnly ? 'checked' : null, onchange: function (e) { state.watchOnly = e.target.checked; syncHash(); render(); } }), ' Watchlist only')
    );
  }
  function boardTable() {
    var rows = filteredRows();
    var max = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
    var head = el('thead', null, el('tr', null,
      el('th', { class: 'r', text: '#' }),
      el('th', null, el('button', { text: 'Protocol', onclick: function () { setSort('name'); } })),
      el('th', null, 'Category'),
      el('th', null, 'Chains'),
      el('th', { class: 'r' }, el('button', { text: 'TVL', onclick: function () { setSort('tvl'); } })),
      el('th', { class: 'r' }, el('button', { text: '7d', onclick: function () { setSort('change'); } })),
      el('th', { class: 'r' }, el('button', { text: 'Implied value', onclick: function () { setSort('implied'); } }))
    ));
    var body = el('tbody', null, rows.map(function (r) {
      var pct = r.change_7d;
      return el('tr', { class: WATCH[r.slug] ? 'watch' : '', onclick: function () { state.selected = r.slug; syncHash(); render(); } },
        el('td', { class: 'r num', text: String(r.rank) }),
        el('td', null, el('b', { text: r.name }), WATCH[r.slug] ? el('span', { class: 'pill watch', text: 'Watchlist' }) : null, el('div', { class: 'meta', text: r.slug })),
        el('td', { text: r.category || '—' }),
        el('td', { text: (r.chains || []).slice(0, 3).join(', ') || '—' }),
        el('td', { class: 'r num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'r num ' + (pct === null ? '' : pct >= 0 ? 'pos' : 'neg'), text: fmtPct(pct) }),
        el('td', { class: 'r' }, el('b', { class: 'num', text: fmtUsd(r.implied_value_usd) }), el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round(100 * r.implied_value_usd / max)) + '%' })))
      );
    }));
    if (!rows.length) body = el('tbody', null, el('tr', null, el('td', { colspan: '7', class: 'empty', text: 'No protocol matches these filters.' })));
    return el('div', null,
      el('p', { class: 'count', text: rows.length + ' of ' + DATA.board_size + ' rows · click a row for its detail and farm plan' }),
      el('table', { class: 'board' }, head, body)
    );
  }
  function setSort(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
    render();
  }
  function liveTable() {
    var head = el('thead', null, el('tr', null,
      el('th', { class: 'r', text: '#' }), el('th', null, 'Protocol'), el('th', null, 'Category'), el('th', null, 'Chains'),
      el('th', { class: 'r', text: 'TVL' }), el('th', { class: 'r', text: 'Market cap' }), el('th', { class: 'r', text: '7d' })
    ));
    var body = el('tbody', null, DATA.live.map(function (r, i) {
      var pct = r.change_7d;
      return el('tr', null,
        el('td', { class: 'r num', text: String(i + 1) }),
        el('td', null, el('b', { text: r.name }), el('div', { class: 'meta', text: r.slug })),
        el('td', { text: r.category || '—' }),
        el('td', { text: (r.chains || []).slice(0, 3).join(', ') || '—' }),
        el('td', { class: 'r num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'r num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'r num ' + (pct === null ? '' : pct >= 0 ? 'pos' : 'neg'), text: fmtPct(pct) })
      );
    }));
    return el('div', null,
      el('p', { class: 'count', text: 'The market\'s own values, for comparison: the ' + DATA.live_size + ' largest listed tokens by market cap. These are not ranked by implied value.' }),
      el('table', { class: 'board' }, head, body)
    );
  }
  function modelPanel() {
    var m = DATA.model;
    var rows = DATA.multiples.map(function (x) {
      return el('tr', null,
        el('td', { text: x.category }),
        el('td', { class: 'r num', text: x.multiple.toFixed(3) }),
        el('td', { class: 'r num', text: String(x.listed_n) }),
        el('td', { text: x.source === 'category' ? 'Category median' : 'Overall median (fewer than 3 listed)' })
      );
    });
    return el('section', { class: 'model-panel' },
      el('h2', { text: 'The model, in full' }),
      el('p', null, 'implied value = TVL × category multiple × growth × maturity. The multiple is the median ' +
        'mcap/TVL of the listed protocols in the row\'s own category, when at least ' + m.min_category_n + ' of them trade; ' +
        'otherwise the median across every listed protocol (' + DATA.overall_multiple.toFixed(3) + '). Multiples are ' +
        'clamped to [' + m.min_multiple + ', ' + m.max_multiple + ']. Growth is the 7-day TVL change, clamped to ' +
        '[' + m.growth_floor + '%, ' + m.growth_cap + '%], at weight ' + m.growth_weight + '. Maturity is ' +
        m.maturity_floor + ' + min(age, ' + m.maturity_days + ' days)/' + m.maturity_days + ' × ' + m.maturity_range +
        ' (age unknown: ' + m.unknown_maturity + ').'),
      el('p', null, 'The multiples are computed from this snapshot when the board is built, never written in ' +
        'advance, and the same function scores every row. A token\'s implied value is an estimate of what it ' +
        'would be worth if it launched with the record unchanged — not a prediction that it launches, or when.'),
      el('table', { class: 'multiples' },
        el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'r', text: 'Multiple' }), el('th', { class: 'r', text: 'Listed' }), el('th', { text: 'Source' }))),
        el('tbody', null, rows)
      )
    );
  }

  var dialog = el('dialog', { class: 'detail' });
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    var recomputed = impliedOf(row, DATA.model);
    var steps = farmSteps(row);
    dialog.textContent = '';
    var inner = el('div', { class: 'detail-inner' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('div', { class: 'eyebrow', text: 'Rank #' + row.rank + (WATCH[row.slug] ? ' · Watchlist' : '') }),
          el('h2', { text: row.name })
        ),
        el('button', { text: 'Close', onclick: function () { dialog.close(); state.selected = null; syncHash(); } })
      ),
      el('p', { class: 'meta', text: row.slug + ' · ' + (row.category || 'Uncategorised') + ' · ' + (row.chains || []).join(', ') }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: '7-day change' }), el('b', { class: row.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Tracked' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('pre', { class: 'formula', text:
        fmtUsd(row.tvl_usd) + ' TVL × ' + row.base_multiple.toFixed(3) + ' multiple × ' +
        row.growth_multiplier.toFixed(4) + ' growth × ' + row.maturity_multiplier.toFixed(4) + ' maturity\n= ' +
        fmtUsd(row.implied_value_usd) + ' implied value' }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) +
        (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') +
        ' This is an estimate, not a price.' }),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
        }))
      ),
      el('p', { class: 'note', text: 'No token on record: the snapshot lists no market cap, CoinGecko id or symbol for ' + row.name +
        '. That is what the record says, not a claim that no token exists. Farming costs gas and carries smart-contract risk; never pay to claim.' })
    );
    dialog.appendChild(inner);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function syncHash() {
    var parts = [];
    if (state.selected) { location.hash = '#/protocol/' + encodeURIComponent(state.selected); return; }
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('cat=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.minTvl > 0) parts.push('min=' + state.minTvl);
    if (state.watchOnly) parts.push('watch=1');
    if (state.tab !== 'pre-token') parts.push('tab=' + state.tab);
    location.hash = parts.length ? '#/?' + parts.join('&') : '#/';
  }
  function readHash() {
    var h = location.hash || '';
    var m = h.match(/^#\/protocol\/(.+)$/);
    if (m) { state.selected = decodeURIComponent(m[1]); return; }
    var q = h.match(/^#\/\?(.*)$/);
    if (!q) return;
    var params = new URLSearchParams(q[1]);
    state.q = params.get('q') || '';
    state.category = params.get('cat') || 'all';
    state.chain = params.get('chain') || 'all';
    state.minTvl = Number(params.get('min') || 0);
    state.watchOnly = params.get('watch') === '1';
    state.tab = params.get('tab') || 'pre-token';
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(stats());
    shell.appendChild(tabs());
    if (state.tab === 'pre-token') {
      shell.appendChild(controls());
      shell.appendChild(boardTable());
      shell.appendChild(modelPanel());
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable());
    } else {
      shell.appendChild(modelPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
