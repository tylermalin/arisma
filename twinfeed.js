// Arisma Network: small live readouts from the digital twin stream, for pages other
// than /interactions. Fills [data-twinlive] lists and [data-twinstat] lines. Simulated data.
(() => {
  const feeds = [...document.querySelectorAll('[data-twinlive]')];
  const stats = [...document.querySelectorAll('[data-twinstat]')];
  if (!feeds.length && !stats.length) return;

  const LABEL = { 'drone-dock': 'Drone dock', warehouse: 'Warehouse', 'ev-depot': 'EV depot' };
  const money = (n) => (n >= 1 ? '$' + n.toFixed(2) : n >= 0.01 ? '$' + n.toFixed(3).replace(/0$/, '') : '$' + n.toFixed(4).replace(/0+$/, ''));
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // One line per twin, built from its live status and last hour of activity.
  const line = (t, s) => {
    const hour = s ? `${money(s.per_twin[t.id].usdc)} settled in the last hour` : '';
    if (t.id === 'drone-dock') {
      const flying = t.status.filter((d) => d.state === 'Flying').length;
      return `${flying} of ${t.status.length} drones flying now. ${hour}.`;
    }
    if (t.id === 'warehouse') return `${t.status.picksPerMin} picks a minute right now, next batch in ${Math.floor(t.status.nextBatchIn / 60)}:${String(t.status.nextBatchIn % 60).padStart(2, '0')}. ${hour}.`;
    const charging = t.status.filter((c) => c.state === 'Charging').length;
    return `${charging} of ${t.status.length} chargers in use now. ${hour}.`;
  };

  const run = async () => {
    if (document.hidden) return;
    try {
      const res = await fetch('/api/stream?window=600');
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      for (const el of stats) {
        const t = d.twins.find((x) => x.id === el.dataset.twinstat);
        const out = el.querySelector('[data-out]');
        if (t && out) out.textContent = line(t, d.stats);
      }
      // Highlights: skip individual netted actions; show settlements, releases, holds, captures.
      const picked = d.events.filter((e) => e.type !== 'payment' || e.mode === 'single').slice(0, 5);
      for (const ul of feeds) {
        ul.innerHTML = picked.map((e) => `<li><span class="tl__t">${clock(e.t)}</span><span class="tl__twin">${LABEL[e.twin]}</span><span class="tl__what">${esc(e.summary)}</span><span class="tl__amt">${e.amount !== undefined ? money(e.amount) : ''}</span></li>`).join('');
      }
    } catch (err) {
      for (const ul of feeds) if (!ul.children.length) ul.innerHTML = '<li class="tl__err">The twin stream did not respond. It will retry.</li>';
    }
  };
  run();
  setInterval(run, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
})();
