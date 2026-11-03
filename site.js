// Arisma Network: shared page behavior. Loaded with `defer` on every page.
(() => {
  window.__site = true;
  const root = document.documentElement;
  root.classList.add('js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- mobile menu: built from the primary nav so pages stay in sync ---------- */
  const navIn = document.querySelector('.nav__in');
  const primary = document.querySelector('.nav__links');
  if (navIn && primary) {
    const toggle = document.createElement('button');
    toggle.className = 'nav__toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'menu');
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.innerHTML = '<span></span><span></span>';
    (navIn.querySelector('.nav__cta') || navIn).appendChild(toggle);

    const panel = document.createElement('div');
    panel.className = 'menu';
    panel.id = 'menu';
    panel.setAttribute('aria-label', 'Menu');
    const list = document.createElement('nav');
    list.setAttribute('aria-label', 'Mobile');
    const links = [...primary.querySelectorAll('a')];
    const wp = navIn.querySelector('.nav__cta .linklike');
    if (wp) links.push(wp);
    links.forEach((a, i) => {
      const c = document.createElement('a');
      c.href = a.getAttribute('href');
      c.textContent = a.textContent;
      if (a.getAttribute('aria-current')) c.setAttribute('aria-current', 'page');
      c.style.setProperty('--i', i);
      list.appendChild(c);
    });
    panel.appendChild(list);
    const cta = navIn.querySelector('.nav__cta .btn--primary');
    if (cta) {
      const b = cta.cloneNode(true);
      b.style.setProperty('--i', links.length);
      panel.appendChild(b);
    }
    document.querySelector('.nav').after(panel);

    const outside = () => [...document.querySelectorAll('main, footer')];
    const setOpen = (open) => {
      panel.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      outside().forEach((el) => { el.inert = open; });
      if (open) list.querySelector('a')?.focus({ preventScroll: true });
    };
    toggle.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
    panel.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    matchMedia('(min-width: 72.01rem)').addEventListener('change', (m) => { if (m.matches) setOpen(false); });
  }

  /* ---------- scroll reveal: rise and fade once ---------- */
  const groups = ['.section__head', '.schems > .schem', '.arch', '.pillars > .pillar', '.eco__grid', '.request__grid', '.metrics', '.devgrid > .devcard', '.feature', '.section .prose', '.actors', '.feed__head', '.ruled[role="table"]', '.codeblock'];
  const targets = document.querySelectorAll(groups.join(','));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    targets.forEach((el) => {
      el.classList.add('reveal');
      const sibs = el.parentElement ? [...el.parentElement.children].filter((s) => s.matches(groups.join(','))) : [];
      const idx = sibs.indexOf(el);
      if (idx > 0 && !reduced) el.style.transitionDelay = Math.min(idx, 4) * 80 + 'ms';
      io.observe(el);
    });
  } else {
    targets.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- schematics: loop only while on screen, never under reduced motion ---------- */
  const schems = document.querySelectorAll('.schem, [data-live]');
  if (schems.length && !reduced && 'IntersectionObserver' in window) {
    const live = new IntersectionObserver((entries) => {
      entries.forEach((en) => en.target.classList.toggle('is-live', en.isIntersecting));
    }, { threshold: 0.2 });
    schems.forEach((s) => live.observe(s));
  }

  /* ---------- hero video: slow loop reads as ambient motion ---------- */
  document.querySelectorAll('.hero__video').forEach((v) => {
    const slow = () => { v.playbackRate = 0.5; };
    slow();
    v.addEventListener('loadedmetadata', slow);
    v.addEventListener('play', slow);
  });

  /* ---------- copy to clipboard; without JS the command stays selectable ---------- */
  document.querySelectorAll('.copy').forEach((b) => {
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        const prev = b.textContent;
        b.textContent = 'copied';
        setTimeout(() => { b.textContent = prev; }, 1400);
      } catch (e) { /* clipboard unavailable */ }
    });
  });

  /* ---------- code tabs: arrow keys move between tabs ---------- */
  document.querySelectorAll('[data-tabs]').forEach((box) => {
    const tabs = [...box.querySelectorAll('[role="tab"]')];
    const select = (t, focus) => {
      tabs.forEach((x) => {
        const on = x === t;
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) t.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
  });

  /* ---------- JSON | Rust toggle fallback for engines without :has() ---------- */
  if (!CSS.supports || !CSS.supports('selector(:has(*))')) {
    document.querySelectorAll('.pillar').forEach((card) => {
      card.querySelectorAll('.toggle input').forEach((r) => r.addEventListener('change', () => {
        card.classList.toggle('is-rust', card.querySelector('.t-rust').checked);
      }));
    });
  }

  /* ---------- forms: validate inline, deliver through /api/submit (Resend) ---------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const clearError = (field) => {
    field.classList.remove('is-invalid');
    field.querySelector('.field__error')?.remove();
    field.querySelector('input, select, textarea')?.removeAttribute('aria-invalid');
  };
  const showError = (input, msg) => {
    const field = input.closest('.field');
    clearError(field);
    field.classList.add('is-invalid');
    const err = document.createElement('span');
    err.className = 'field__error';
    err.id = input.id + '-error';
    err.textContent = msg;
    field.appendChild(err);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', err.id);
  };

  document.querySelectorAll('form[data-form]').forEach((form) => {
    const status = form.querySelector('.form-status');
    const button = form.querySelector('button[type="submit"]');
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      el.addEventListener('input', () => { const f = el.closest('.field'); if (f) clearError(f); });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form-status';
      status.textContent = '';
      form.querySelectorAll('.field.is-invalid').forEach(clearError);

      const email = form.querySelector('input[type="email"]');
      const message = form.querySelector('textarea[required]');
      let firstBad = null;
      if (!email.value.trim()) { showError(email, 'Enter your work email.'); firstBad = email; }
      else if (!EMAIL.test(email.value.trim())) { showError(email, 'That email looks incomplete. Check the part after the @.'); firstBad = email; }
      if (message && !message.value.trim()) { showError(message, 'Add a short note so we know where to route this.'); firstBad = firstBad || message; }
      if (firstBad) { firstBad.focus(); return; }

      const data = Object.fromEntries(new FormData(form).entries());
      data.form = form.dataset.form;
      data.page = location.pathname;

      button.classList.add('is-busy');
      button.setAttribute('aria-disabled', 'true');
      const label = button.textContent;
      button.textContent = 'Sending';
      try {
        const res = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'send_failed');
        form.reset();
        status.classList.add('is-ok');
        status.textContent = form.dataset.ok.replace('{email}', data.email);
      } catch (err) {
        status.classList.add('is-error');
        status.textContent = err.message === 'invalid_email'
          ? 'We could not accept that email address. Check it and send again.'
          : 'Your request did not send. Check your connection and try again in a minute.';
      } finally {
        button.classList.remove('is-busy');
        button.removeAttribute('aria-disabled');
        button.textContent = label;
      }
    });
  });
})();
