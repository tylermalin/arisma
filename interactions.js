// Arisma Network: live view of the digital twin stream (/api/stream). Simulated data.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const list = $('[data-stream]');
  if (!list) return;

  const API = '/api/stream';
  const POLL_MS = 2000;
  const KEEP = 600;          // events kept in memory
  const SHOW = 40;           // rows on screen
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const statusEl = $('[data-status]');
  const pauseBtn = $('[data-pause]');

  const events = new Map();  // id -> event
  let filter = new URLSearchParams(location.search).get('twin') || '';
  const preset = document.querySelector(`input[name="twin"][value="${CSS.escape(filter)}"]`);
  if (preset) preset.checked = true; else filter = '';
  let paused = false;
  let timer = null;
  let polls = 0;
  let failures = 0;
  let lastAt = 0;
  let inflight = false;
  let shown = new Set();
  const open = new Set();

  const TWIN_LABEL = { 'drone-dock': 'Drone dock', warehouse: 'Warehouse', 'ev-depot': 'EV depot' };
  const money = (n) => (n >= 1 ? '$' + n.toFixed(2) : n >= 0.01 ? '$' + n.toFixed(3).replace(/0$/, '') : '$' + n.toFixed(4).replace(/0+$/, ''));
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- rows: warehouse picks group into 10 second rows ---------- */
  const rows = () => {
    const sorted = [...events.values()].filter((e) => !filter || e.twin === filter).sort((a, b) => b.t - a.t || b.id.localeCompare(a.id));
    const out = []; const groups = new Map();
    for (const e of sorted) {
      if (e.twin === 'warehouse' && e.type === 'payment') {
        const key = 'wh-picks:' + Math.floor(e.t / 10000);
        let g = groups.get(key);
        if (!g) { g = { id: key, group: true, t: e.t, twin: 'warehouse', type: 'payment', items: [] }; groups.set(key, g); out.push(g); }
        g.items.push(e);
        continue;
      }
      out.push(e);
    }
    for (const g of groups.values()) {
      const amt = g.items.reduce((a, b) => a + b.amount, 0);
      g.amount = Math.round(amt * 1e6) / 1e6;
      g.summary = `${g.items.length} pick${g.items.length === 1 ? '' : 's'} netted across ${new Set(g.items.map((i) => i.actor)).size} arms`;
      g.mode = 'netted';
    }
    return out.slice(0, SHOW);
  };

  const tag = (e) => {
    const map = { settlement: 'settled', release: 'released', payment: e.mode === 'netted' ? 'netted' : 'paid', evidence: 'evidence', telemetry: 'telemetry', hold: 'held', rejected: 'rejected', mandate: 'mandate' };
    return `<span class="ev-tag ev-tag--${e.type}">${map[e.type] || e.type}</span>`;
  };

  const detail = (e) => {
    const body = e.group ? { netted_picks: e.items.length, amount: e.amount, first: e.items[e.items.length - 1], last: e.items[0] } : e;
    return `<pre class="codeblock ev-json"><code>${esc(JSON.stringify(body, null, 2))}</code></pre>`;
  };

  const render = () => {
    const r = rows();
    const next = new Set(r.map((e) => e.id + (e.group ? ':' + e.items.length : '')));
    list.innerHTML = r.map((e) => {
      const key = e.id + (e.group ? ':' + e.items.length : '');
      const fresh = shown.size && !shown.has(key) && !reduced ? ' is-new' : '';
      const isOpen = open.has(e.id);
      return `<li class="ev${fresh}${isOpen ? ' is-open' : ''}" data-id="${esc(e.id)}">
        <button class="ev__row" type="button" aria-expanded="${isOpen}">
          <span class="ev__t">${clock(e.t)}</span>
          <span class="ev__twin">${TWIN_LABEL[e.twin]}</span>
          ${tag(e)}
          <span class="ev__what">${esc(e.summary)}</span>
          <span class="ev__amt">${e.amount !== undefined ? money(e.amount) : ''}</span>
        </button>
        ${isOpen ? detail(e) : ''}
      </li>`;
    }).join('');
    shown = next;
  };

  list.addEventListener('click', (ev) => {
    const li = ev.target.closest('.ev');
    if (!li || !ev.target.closest('.ev__row')) return;
    const id = li.dataset.id;
    if (open.has(id)) open.delete(id); else open.add(id);
    render();
  });

  /* ---------- twin cards and totals ---------- */
  const units = (t) => {
    if (t.id === 'drone-dock') return t.status.map((d) => `<li><span>${d.id}</span><b>${d.state}</b><span class="twin__bar" style="--v:${d.battery / 100}"></span><span>${d.battery}%</span></li>`).join('');
    if (t.id === 'warehouse') {
      const s = t.status;
      return `<li><span>Picks per minute</span><b>${s.picksPerMin}</b></li>
        <li><span>Netted since last batch</span><b>${s.pendingPicks} picks, ${money(s.pendingUsdc)}</b></li>
        <li><span>Next batch settles in</span><b>${Math.floor(s.nextBatchIn / 60)}:${String(s.nextBatchIn % 60).padStart(2, '0')}</b></li>`;
    }
    return t.status.map((c) => (c.state === 'Charging'
      ? `<li><span>${c.id}</span><b>${c.vehicle}, ${c.kw} kW</b><span class="twin__bar" style="--v:${Math.min(c.usdc / c.cap, 1)}"></span><span>${money(c.usdc)}</span></li>`
      : `<li class="is-idle"><span>${c.id}</span><b>Idle</b></li>`)).join('');
  };
  const paintTwins = (twins, stats) => {
    for (const t of twins) {
      const card = $(`[data-twin="${t.id}"]`);
      if (!card) continue;
      $('[data-units]', card).innerHTML = units(t);
      if (stats) {
        $('[data-usdc]', card).textContent = money(stats.per_twin[t.id].usdc);
        $('[data-events]', card).textContent = stats.per_twin[t.id].events.toLocaleString();
      }
    }
    if (stats) {
      $('[data-m="usdc"]').textContent = money(stats.usdc);
      $('[data-m="actions"]').textContent = stats.actions.toLocaleString();
      $('[data-m="confirmed"]').textContent = stats.avg_confirmed_ms ? (stats.avg_confirmed_ms / 1000).toFixed(2) + 's' : '—';
    }
  };

  /* ---------- polling ---------- */
  const poll = async () => {
    clearTimeout(timer); timer = null;
    if (paused || document.hidden || inflight) return;
    inflight = true;
    const first = polls === 0;
    const at = Math.floor((Date.now() - 3000) / 2000) * 2000;
    // catch up on any gap since the last poll (a pause or a hidden tab), up to 15 minutes
    const win = first ? 300 : Math.min(900, Math.max(20, Math.ceil((at - lastAt) / 1000) + 4));
    const withStats = first || polls % 5 === 0;
    try {
      const res = await fetch(`${API}?at=${at}&window=${win}${withStats ? '' : '&stats=0'}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      for (const e of data.events) events.set(e.id, e);
      if (events.size > KEEP) {
        const old = [...events.values()].sort((a, b) => a.t - b.t).slice(0, events.size - KEEP);
        old.forEach((e) => events.delete(e.id));
      }
      paintTwins(data.twins, data.stats);
      render();
      polls += 1; failures = 0; lastAt = at;
      statusEl.className = 'streamstatus is-live';
      statusEl.textContent = `Live. Updated ${clock(data.at)}, refreshing every ${POLL_MS / 1000} seconds.`;
    } catch (err) {
      failures += 1;
      statusEl.className = 'streamstatus is-error';
      statusEl.textContent = 'The stream did not respond. Retrying shortly.';
    }
    inflight = false;
    schedule();
  };
  const schedule = () => {
    clearTimeout(timer);
    if (paused || document.hidden) return;
    timer = setTimeout(poll, failures ? Math.min(30000, POLL_MS * 2 ** failures) : POLL_MS);
  };

  $$('input[name="twin"]').forEach((r) => r.addEventListener('change', () => { filter = r.value; shown = new Set(); render(); }));
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    statusEl.className = 'streamstatus';
    if (paused) statusEl.textContent = 'Paused. The twins keep running; resume to catch up.';
    else poll();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !paused) poll(); });
  poll();
})();
