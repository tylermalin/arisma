// Arisma Network: interactive whitepaper. Loaded with `defer` on /whitepaper only.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const out = (root, key) => $(`[data-out="${key}"]`, root);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const usd = (n) => {
    if (n >= 1) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 0.01) return '$' + n.toFixed(3).replace(/0$/, '');
    return '$' + n.toFixed(4);
  };

  /* ---------- progress, kept in this browser only ---------- */
  const KEY = 'arisma.whitepaper.v1';
  let state = { done: [], ttl: 900 };
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } };

  const rail = $('.wp-rail');
  const reset = $('.wp-reset');
  const paint = () => {
    const n = state.done.length;
    $$('a[data-ch]', rail).forEach((a) => a.classList.toggle('is-done', state.done.includes(Number(a.dataset.ch))));
    const score = $('[data-score]', rail); if (score) score.textContent = n;
    const sum = out(document, 'summary');
    if (sum) sum.textContent = n === 5 ? 'All five checks passed. You have the core of the protocol.' : `You have passed ${n} of 5 checks.`;
    if (reset) reset.hidden = n === 0;
  };

  /* ---------- active chapter in the rail ---------- */
  const links = $$('a[href^="#"]', rail);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => {
          const on = a.getAttribute('href') === '#' + en.target.id;
          a.classList.toggle('is-active', on);
          if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    $$('.wp-ch[id]').forEach((s) => io.observe(s));
  }

  /* ---------- glossary terms open a short definition ---------- */
  const pop = document.createElement('div');
  pop.className = 'gloss'; pop.id = 'gloss-pop'; pop.setAttribute('role', 'tooltip'); pop.hidden = true;
  document.body.appendChild(pop);
  let openTerm = null;
  const closePop = () => { pop.hidden = true; if (openTerm) openTerm.setAttribute('aria-expanded', 'false'); openTerm = null; };
  const openPop = (t) => {
    const dt = document.getElementById(t.getAttribute('href').slice(1));
    if (!dt) return;
    pop.replaceChildren();
    const h = document.createElement('strong'); h.textContent = dt.textContent;
    const p = document.createElement('p'); p.textContent = dt.nextElementSibling.textContent;
    const more = document.createElement('a'); more.href = '#' + dt.id; more.textContent = 'Open the glossary';
    more.addEventListener('click', closePop);
    pop.append(h, p, more);
    pop.hidden = false;
    const r = t.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = Math.max(16, Math.min(r.left + scrollX, scrollX + innerWidth - w - 16)) + 'px';
    pop.style.top = (r.bottom + scrollY + 8) + 'px';
    openTerm = t; t.setAttribute('aria-expanded', 'true');
  };
  $$('a.term').forEach((t) => {
    t.setAttribute('aria-expanded', 'false');
    t.setAttribute('aria-controls', 'gloss-pop');
    t.addEventListener('click', (e) => { e.preventDefault(); if (openTerm === t) closePop(); else openPop(t); });
  });
  document.addEventListener('click', (e) => { if (openTerm && !e.target.closest('.term, .gloss')) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openTerm) { const t = openTerm; closePop(); t.focus(); } });
  addEventListener('resize', closePop);

  /* ---------- 01: card fee vs payment ---------- */
  const rails = $('[data-lab="rails"]');
  if (rails) {
    const update = () => {
      const v = Number($('input[name="rails-amt"]:checked', rails).value);
      const fee = 0.30 + 0.029 * v;
      const max = Math.max(v, fee);
      $('[data-bar="pay"]', rails).style.setProperty('--s', Math.max(v / max, 0.01));
      $('[data-bar="fee"]', rails).style.setProperty('--s', Math.max(fee / max, 0.01));
      out(rails, 'pay').textContent = usd(v);
      out(rails, 'fee').textContent = usd(fee);
      const x = fee / v;
      out(rails, 'verdict').textContent = x >= 1
        ? `The fee is ${x >= 10 ? Math.round(x).toLocaleString('en-US') : x.toFixed(1)}× the payment.`
        : `The fee takes ${(x * 100).toFixed(1)}% of the payment.`;
    };
    rails.addEventListener('change', update);
    update();
  }

  /* ---------- 02: session key builder and attacks ---------- */
  const sess = $('[data-lab="session"]');
  const mins = (s) => (s % 60 === 0 ? `${s / 60} min` : `${s}s`);
  if (sess) {
    const ttl = $('#ttl', sess);
    ttl.value = state.ttl;
    const scope = () => $$('input[name="scope"]:checked', sess).map((i) => i.value);
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const render = () => {
      const sc = scope();
      out(sess, 'ttl').textContent = mins(Number(ttl.value));
      out(sess, 'envelope').innerHTML = [
        '<span class="m">// delegation envelope</span>',
        '{',
        `  <span class="c">"standard"</span>: <span class="s">"erc-7702"</span>,`,
        `  <span class="c">"session"</span>: <span class="s">"0x7a…c4"</span>,`,
        `  <span class="c">"enclave"</span>: <span class="s">"tee:sev-snp"</span>,`,
        `  <span class="c">"scope"</span>: [${sc.map((s) => `<span class="s">"${esc(s)}"</span>`).join(', ')}],`,
        `  <span class="c">"expires"</span>: <span class="s">${Number(ttl.value)}</span>`,
        '}',
      ].join('\n');
    };
    const result = out(sess, 'scenario');
    const say = (kind, html) => { result.className = 'result is-' + kind; result.innerHTML = html; };
    const run = (scn) => {
      const sc = scope();
      const t = mins(Number(ttl.value));
      const list = sc.length ? sc.join(' and ') : 'nothing';
      if (scn === 'leak') {
        if (!sc.length) return say('ok', '<b>Nothing to steal.</b> A key with no scope cannot do anything.');
        if (sc.includes('withdraw')) return say('bad', `<b>Contained, but too wide.</b> The attacker can ${list} for up to ${t}. Withdraw is in scope, so funds could leave the account. Remove it.`);
        return say('ok', `<b>Contained.</b> The attacker can only ${list}, and only for up to ${t}. The master key never left the enclave.`);
      }
      if (scn === 'withdraw') {
        if (sc.includes('withdraw')) return say('bad', '<b>Allowed.</b> Withdraw is in this key’s scope, so the request goes through. The grant works as written, which is why scope deserves the most care.');
        return say('ok', '<b>Blocked.</b> Withdraw is not in scope, so the request fails before it reaches the clearinghouse.');
      }
      if (scn === 'replay') return say('ok', `<b>Rejected.</b> The key expired after ${t}, so the clearinghouse refuses it. A shorter expiry means a smaller window.`);
      if (scn === 'binary') return say('ok', '<b>Rejected.</b> Remote attestation reports a different code measurement, so the enclave issues no session key to the modified agent.');
    };
    sess.addEventListener('change', render);
    ttl.addEventListener('input', () => {
      render();
      state.ttl = Number(ttl.value); save();
      document.dispatchEvent(new CustomEvent('wp:ttl', { detail: state.ttl }));
    });
    $$('[data-scn]', sess).forEach((b) => b.addEventListener('click', () => {
      $$('[data-scn]', sess).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      run(b.dataset.scn);
    }));
    render();
  }

  /* ---------- 03a: walk the settlement path ---------- */
  const path = $('[data-lab="path"]');
  if (path) {
    const steps = [
      '<b>Delegate.</b> The owner grants a session key with scope settle and a 900 second expiry, signed in the enclave.',
      '<b>Attest.</b> The enclave proves its code measurement. Code nobody trusts never reaches this point.',
      '<b>Settle.</b> The clearinghouse moves 0.14 USDC from agent:dispatch to drone:fleet-04.',
      '<b>Verify.</b> The gate checks the policy proof and the C2PA hash of the charging event before release.',
      '<b>Anchor receipt.</b> A deterministic receipt is anchored for audit. Finality on this path: 1.4 seconds.',
    ];
    const items = $$('.path li', path);
    const detail = out(path, 'step');
    const play = $('[data-play]', path);
    let timer = null;
    const show = (i) => {
      items.forEach((li, k) => { li.classList.toggle('is-past', k < i); li.classList.toggle('is-current', k === i); });
      $('.path', path).style.setProperty('--p', i / (items.length - 1));
      detail.innerHTML = steps[i];
    };
    const stop = () => { clearInterval(timer); timer = null; play.textContent = 'Play the settlement'; };
    $$('[data-step]', path).forEach((b) => b.addEventListener('click', () => { stop(); show(Number(b.dataset.step)); }));
    play.addEventListener('click', () => {
      if (timer) return stop();
      let i = 0; show(i);
      play.textContent = 'Pause';
      timer = setInterval(() => { i += 1; if (i >= steps.length) return stop(); show(i); }, reduced ? 2400 : 1600);
    });
  }

  /* ---------- 03b: deterministic receipts ---------- */
  const rc = $('[data-lab="receipt"]');
  if (rc) {
    const hashEl = out(rc, 'hash');
    const cmp = out(rc, 'compare');
    const canSha = window.crypto && crypto.subtle;
    let last = null;
    const inputs = () => Object.fromEntries($$('input', rc).map((i) => [i.name, i.value.trim()]));
    const sha = async (obj) => {
      const canon = JSON.stringify(obj, Object.keys(obj).sort());
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    };
    const refresh = async () => { if (canSha) hashEl.textContent = await sha(inputs()); };
    if (!canSha) { hashEl.textContent = 'Hashing needs a secure (https) connection.'; }
    rc.addEventListener('input', refresh);
    $('[data-settle]', rc).addEventListener('click', async () => {
      if (!canSha) return;
      const h = await sha(inputs());
      hashEl.textContent = h;
      if (!last) cmp.innerHTML = '<b>Settled.</b> Now settle again without changing anything.';
      else if (last === h) cmp.innerHTML = '<b>Identical receipt.</b> Same inputs, same 64 characters, every time.';
      else {
        let diff = 0; for (let k = 0; k < 64; k += 1) if (h[k] !== last[k]) diff += 1;
        cmp.innerHTML = `<b>New inputs, new receipt.</b> ${diff} of 64 characters changed, so any edit to a settled payment is obvious.`;
      }
      cmp.className = 'result is-ok';
      last = h;
    });
    refresh();
  }

  /* ---------- 04: verification gate ---------- */
  const gate = $('[data-lab="gate"]');
  if (gate) {
    const human = $('[data-human]', gate);
    const light = (k, s) => { const l = $(`[data-light="${k}"] .l`, gate); l.className = 'l' + (s ? ' is-' + s : ''); };
    const update = () => {
      const on = (n) => $(`input[name="${n}"]`, gate).checked;
      const stakes = on('stakes');
      human.hidden = !stakes;
      const op = $('input[name="op"]:checked', gate).value;
      ['enclave', 'zk', 'c2pa'].forEach((k) => light(k, on(k) ? 'pass' : 'fail'));
      light('human', !stakes ? '' : op === 'approve' ? 'pass' : op === 'hold' ? 'fail' : 'wait');
      const v = out(gate, 'gate');
      const why = out(gate, 'gate-why');
      const set = (verdict, reason, kind) => { v.textContent = verdict; why.textContent = reason; v.className = 'verdict is-' + kind; };
      if (!on('enclave')) return set('Held.', 'The enclave attestation does not verify, so nothing it signed is trusted.', 'bad');
      if (!on('zk')) return set('Held.', 'The policy proof does not verify. Value stays where it is.', 'bad');
      if (!on('c2pa')) return set('Held.', 'The telemetry does not match its C2PA hash, so the event may have been altered.', 'bad');
      if (stakes && op === 'pending') return set('Waiting on a person.', 'Every automated check passed. This action needs a human decision.', 'wait');
      if (stakes && op === 'hold') return set('Held by the operator.', 'Automated checks passed, and the operator chose to hold. The operator always has the final say.', 'bad');
      if (stakes) return set('Released.', 'Checks passed and the operator approved.', 'ok');
      return set('Released.', 'All checks passed. No human gate is needed for this action.', 'ok');
    };
    gate.addEventListener('change', update);
    update();
  }

  /* ---------- 05: bounded worst case ---------- */
  const bound = $('[data-lab="bound"]');
  if (bound) {
    const rate = $('#rate', bound);
    const life = $('#life', bound);
    const cap = $('#cap', bound);
    life.value = Math.max(1, Math.min(60, Math.round(state.ttl / 60)));
    const update = () => {
      const p = Number($('input[name="price"]:checked', bound).value);
      const r = Number(rate.value);
      const m = Number(life.value);
      const c = parseFloat(cap.value);
      const raw = p * r * m;
      const capped = c > 0 && c < raw;
      out(bound, 'rate').textContent = r;
      out(bound, 'life').textContent = m;
      out(bound, 'worst').textContent = usd(capped ? c : raw);
      out(bound, 'formula').textContent = `${usd(p)} × ${r} per minute × ${m} minutes = ${usd(raw)}` + (capped ? `, capped at ${usd(c)}` : '');
    };
    bound.addEventListener('input', update);
    bound.addEventListener('change', update);
    document.addEventListener('wp:ttl', (e) => { life.value = Math.max(1, Math.min(60, Math.round(e.detail / 60))); update(); });
    update();
  }

  /* ---------- checks ---------- */
  $$('.check').forEach((form) => {
    const n = Number(form.dataset.check);
    const fb = $('.check__fb', form);
    const mark = (input) => {
      const ok = input.value === form.dataset.answer;
      $$('.check__opt', form).forEach((l) => l.classList.remove('is-right', 'is-wrong'));
      const opt = input.closest('.check__opt');
      opt.classList.add(ok ? 'is-right' : 'is-wrong');
      fb.textContent = opt.dataset.fb;
      fb.className = 'check__fb ' + (ok ? 'is-ok' : 'is-no');
      return ok;
    };
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', (e) => {
      if (mark(e.target) && !state.done.includes(n)) { state.done.push(n); save(); paint(); }
    });
    if (state.done.includes(n)) {
      const r = $(`input[value="${form.dataset.answer}"]`, form);
      r.checked = true; mark(r);
    }
  });

  if (reset) reset.addEventListener('click', () => {
    state.done = []; save();
    $$('.check').forEach((f) => { f.reset(); $$('.check__opt', f).forEach((l) => l.classList.remove('is-right', 'is-wrong')); $('.check__fb', f).textContent = ''; });
    paint();
  });
  paint();
})();
