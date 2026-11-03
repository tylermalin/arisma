// Arisma Network: EnclaveEdge X1 page. Measured boot demo and payload tamper check.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- measured boot ---------- */
  const lab = $('[data-bootlab]');
  if (lab) {
    const stages = $$('[data-stage]', lab);
    const out = $('[data-boot-out]', lab);
    const run = $('[data-boot="run"]');
    const tamperBtn = $('[data-boot="tamper"]');
    let tampered = false;
    let timer = null;
    const clear = () => stages.forEach((s) => s.classList.remove('is-ok', 'is-fail', 'is-halt', 'is-busy'));
    const say = (kind, html) => { out.className = 'result is-' + kind; out.innerHTML = html; };
    const boot = () => {
      clearTimeout(timer); clear();
      say('wait', '<b>Booting.</b> Each stage is verified or measured before the next one runs.');
      let i = 0;
      const step = () => {
        const s = stages[i];
        if (tampered && s.dataset.stage === 'kernel') {
          s.classList.add('is-fail');
          stages.slice(i + 1).forEach((x) => x.classList.add('is-halt'));
          say('bad', '<b>Boot halted.</b> The kernel measurement does not match, so the TPM will not unseal the signing key. No container starts, and the modified system cannot sign anything.');
          return;
        }
        s.classList.add('is-ok');
        i += 1;
        if (i < stages.length) timer = setTimeout(step, reduced ? 0 : 450);
        else say('ok', '<b>Verified.</b> Every measurement matched, the TPM unsealed the signing key, and containers are running.');
      };
      step();
    };
    run.addEventListener('click', boot);
    tamperBtn.addEventListener('click', () => {
      tampered = !tampered;
      tamperBtn.textContent = tampered ? 'Restore the kernel' : 'Tamper with the kernel';
      lab.classList.toggle('is-tampered', tampered);
      boot();
    });
  }

  /* ---------- payload tamper: SHA-256 over payload and trust telemetry ---------- */
  const box = $('[data-payload]');
  if (box && window.crypto && crypto.subtle) {
    const pv = (k) => $(`[data-pv="${k}"]`, box);
    const base = {
      trust_telemetry: { attestation: { quote: '\u2026', nonce: '\u2026' }, hardware_tamper_tripped: false, internal_enclave_timestamp: '2026-11-03T18:25:34.012Z', packet_sequence_counter: 1048576 },
      payload: { vertical: 'industrial_machinery', local_ingest_protocol: 'modbus_tcp', source_actor_id: 'cnc_milling_floor_03' },
    };
    const digest = async (rpm, psi) => {
      const body = JSON.stringify({ ...base, payload: { ...base.payload, data: { spindle_rpm: rpm, coolant_pressure_psi: psi, vibration_amplitude_g: 0.12, emergency_stop_tripped: false } } });
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    };
    const inputs = { rpm: $('[data-pin="rpm"]', box), psi: $('[data-pin="psi"]', box) };
    let signed = null;
    const update = async () => {
      const rpm = inputs.rpm.value.trim();
      const psi = inputs.psi.value.trim();
      pv('rpm').textContent = rpm || '""';
      pv('psi').textContent = psi || '""';
      const now = await digest(rpm, psi);
      if (!signed) { signed = now; pv('signed').textContent = signed.slice(0, 16) + '…'; }
      pv('now').textContent = now;
      const status = pv('status');
      if (now === signed) {
        status.className = 'result is-ok';
        status.innerHTML = '<b>Signature verifies.</b> The digest matches what the TPM signed.';
      } else {
        status.className = 'result is-bad';
        status.innerHTML = '<b>Signature broken.</b> The digest no longer matches the signed one, so the backend rejects this message.';
      }
    };
    Object.values(inputs).forEach((i) => i.addEventListener('input', update));
    update();
  }
})();
