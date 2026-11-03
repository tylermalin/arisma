// Arisma digital twins: simulated projects that behave like live deployments.
//
// Every event is a pure function of (twin, machine, second), so the stream runs
// continuously with no database or cron: any window of time, past or present,
// computes to the same events for every caller. Past windows never change.
//
// Nothing here is a real machine or a real payment. Every event carries
// `simulated: true`. Receipts are real SHA-256 digests of each payment's inputs,
// so the determinism the whitepaper describes can be checked on this data.

import { createHash } from 'node:crypto';

export const CHAIN = 'base-sepolia';
const DAY = 86400;

/* ---------- deterministic randomness ---------- */
function h32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return h >>> 0;
}
const rnd = (...p) => h32(p.join('|')) / 4294967296;
const simHex = (n, ...p) => { let s = ''; for (let i = 0; s.length < n; i += 1) s += h32(`${p.join('|')}#${i}`).toString(16).padStart(8, '0'); return '0x' + s.slice(0, n); };
const usd = (n) => Math.round(n * 1e6) / 1e6; // USDC has 6 decimals
const confirmedMs = (...p) => Math.round(1150 + rnd(...p, 'conf') * 700);
const iso = (s) => new Date(s * 1000).toISOString();

// Deterministic receipt: SHA-256 over the canonical (sorted key) inputs.
function receipt(inputs) {
  const canon = JSON.stringify(inputs, Object.keys(inputs).sort());
  return 'sha256:' + createHash('sha256').update(canon).digest('hex');
}
const mandateOf = (twin, actor, s) => simHex(16, 'mandate', twin, actor, Math.floor(s / DAY));

// Site-local hour (Hawaii time, UTC-10) shapes daily demand.
const localHour = (s) => (((s / 3600 - 10) % 24) + 24) % 24;

/* ---------- twin 1: drone dock, inspection flights and pad charging ---------- */
const DRONE = {
  id: 'drone-dock',
  name: 'Drone dock DD-01',
  kind: 'Utility corridor inspection',
  drones: [{ id: 'fleet-04-a', off: 0 }, { id: 'fleet-04-b', off: 800 }, { id: 'fleet-04-c', off: 1600 }],
  cycle: 2400, flight: 840, chargeStart: 900, chargeEnd: 2100,
  perCapture: 0.85, charge: 0.14,
};
const flightMemo = new Map();
function flight(d, c) {
  const key = `${d.id}:${c}`;
  if (flightMemo.has(key)) return flightMemo.get(key);
  const cs = c * DRONE.cycle + d.off;
  const span = `span ${String(1 + Math.floor(rnd(d.id, c, 'span') * 48)).padStart(2, '0')}`;
  const captures = [];
  for (let s = cs + 20; s < cs + DRONE.flight - 20; s += 1) {
    if (rnd(d.id, s, 'cap') < 1 / 28) captures.push({ s, ok: rnd(d.id, s, 'ok') > 0.03 });
  }
  const f = { cs, span, captures, verified: captures.filter((x) => x.ok).length };
  if (flightMemo.size > 500) flightMemo.clear();
  flightMemo.set(key, f);
  return f;
}
function droneEvents(from, to) {
  const out = [];
  const T = DRONE.id;
  for (const d of DRONE.drones) {
    const c0 = Math.floor((from - d.off - DRONE.cycle) / DRONE.cycle);
    const c1 = Math.floor((to - d.off) / DRONE.cycle);
    for (let c = c0; c <= c1; c += 1) {
      const f = flight(d, c);
      const m = mandateOf(T, d.id, f.cs);
      const add = (s, e) => { if (s >= from && s < to) out.push({ id: `${T}:${d.id}:${s}:${e.type}`, t: s * 1000, ts: iso(s), twin: T, actor: `drone:${d.id}`, mandate: m, simulated: true, ...e }); };
      add(f.cs, { type: 'telemetry', summary: `${d.id} took off to inspect ${f.span}` });
      f.captures.forEach((x, i) => {
        const digest = simHex(32, 'frame', d.id, x.s);
        if (x.ok) add(x.s, { type: 'evidence', summary: `${d.id} capture ${i + 1}, ${f.span}, C2PA manifest attached`, evidence: { kind: 'c2pa', digest } });
        else add(x.s, { type: 'hold', summary: `${d.id} capture ${i + 1} held: C2PA manifest does not match the frame`, evidence: { kind: 'c2pa', digest } });
      });
      const rs = f.cs + DRONE.flight;
      const amount = usd(f.verified * DRONE.perCapture);
      const inputs = { from: 'utility:corridor-2', to: `operator:${d.id}`, asset: 'usdc', amount: String(amount), nonce: `${c}`, evidence: simHex(32, 'flight', d.id, c) };
      add(rs, { type: 'release', summary: `${d.id} inspection released: ${f.verified} verified captures`, amount, mode: 'single', chain: CHAIN, confirmed_ms: confirmedMs(d.id, c, 'rel'), receipt: receipt(inputs), from: inputs.from, to: inputs.to });
      add(rs + 30, { type: 'telemetry', summary: `${d.id} landed at the dock, battery 31%` });
      const ps = f.cs + DRONE.chargeStart;
      const pad = `pad:dd-01-p${1 + DRONE.drones.indexOf(d)}`;
      const pin = { from: `drone:${d.id}`, to: pad, asset: 'usdc', amount: String(DRONE.charge), nonce: `${c}c`, evidence: simHex(32, 'meter', d.id, c) };
      add(ps, { type: 'payment', summary: `${d.id} paid for a pad charge, signed meter reading`, amount: DRONE.charge, mode: 'single', chain: CHAIN, confirmed_ms: confirmedMs(d.id, c, 'chg'), receipt: receipt(pin), from: pin.from, to: pin.to, evidence: { kind: 'signed reading', digest: pin.evidence } });
    }
  }
  return out;
}
function droneStatus(now) {
  return DRONE.drones.map((d) => {
    const c = Math.floor((now - d.off) / DRONE.cycle);
    const e = now - (c * DRONE.cycle + d.off);
    let state; let battery;
    if (e < DRONE.flight) { state = 'Flying'; battery = 100 - (e / DRONE.flight) * 69; }
    else if (e < DRONE.chargeStart) { state = 'Landed'; battery = 31; }
    else if (e < DRONE.chargeEnd) { state = 'Charging'; battery = 31 + ((e - DRONE.chargeStart) / (DRONE.chargeEnd - DRONE.chargeStart)) * 69; }
    else { state = 'Ready'; battery = 100; }
    return { id: d.id, state, battery: Math.round(battery) };
  });
}

/* ---------- twin 2: warehouse robot cell, paid per pick, netted ---------- */
const WARE = {
  id: 'warehouse',
  name: 'Warehouse cell WH-07',
  kind: 'Robot picking, regional fulfillment',
  arms: ['cell-1', 'cell-2', 'cell-3', 'cell-4', 'cell-5', 'cell-6'],
  perPick: 0.002, batch: 300, rate: 0.16,
};
const demand = (s) => { const h = localHour(s); if (h < 5) return 0.3; if (h < 7) return 0.75; if (h < 19) return 1; if (h < 22) return 0.7; return 0.45; };
const isPick = (arm, s) => rnd(arm, s, 'pick') < WARE.rate * demand(s);
const isReplay = (arm, s) => rnd(arm, s, 'replay') < 0.0005;
function wareEvents(from, to) {
  const out = [];
  const T = WARE.id;
  for (let s = from; s < to; s += 1) {
    for (const arm of WARE.arms) {
      if (!isPick(arm, s)) continue;
      const base = { id: `${T}:${arm}:${s}:pick`, t: s * 1000, ts: iso(s), twin: T, actor: `robot:${arm}`, mandate: mandateOf(T, arm, s), simulated: true };
      if (isReplay(arm, s)) { out.push({ ...base, type: 'rejected', summary: 'Replayed pick rejected: sequence counter already used' }); continue; }
      const tote = `T-${(h32(`${arm}|${s}|tote`) % 9000 + 1000)}`;
      out.push({ ...base, type: 'payment', summary: `Pick, tote ${tote}, netted`, amount: WARE.perPick, mode: 'netted', evidence: { kind: 'signed reading', digest: simHex(32, 'pick', arm, s) } });
    }
    if (s % WARE.batch === 0) {
      let count = 0;
      for (let x = s - WARE.batch; x < s; x += 1) for (const arm of WARE.arms) if (isPick(arm, x) && !isReplay(arm, x)) count += 1;
      const amount = usd(count * WARE.perPick);
      const inputs = { from: 'operator:wh-07', to: 'fleet:wh-07-robots', asset: 'usdc', amount: String(amount), nonce: `${s}`, evidence: simHex(32, 'batch', s) };
      out.push({ id: `${T}:batch:${s}:settlement`, t: s * 1000, ts: iso(s), twin: T, actor: 'netting:wh-07', mandate: mandateOf(T, 'netting', s), simulated: true, type: 'settlement', summary: `Batch settled: ${count} picks netted`, amount, count, mode: 'batch', chain: CHAIN, confirmed_ms: confirmedMs(T, s), receipt: receipt(inputs), from: inputs.from, to: inputs.to });
    }
  }
  return out;
}
function wareStatus(now) {
  const picks = (a, b) => { let n = 0; for (let s = a; s < b; s += 1) for (const arm of WARE.arms) if (isPick(arm, s) && !isReplay(arm, s)) n += 1; return n; };
  const batchStart = now - (now % WARE.batch);
  const lastMin = picks(now - 60, now);
  const pending = picks(batchStart, now);
  return { arms: WARE.arms.length, picksPerMin: lastMin, pendingPicks: pending, pendingUsdc: usd(pending * WARE.perPick), nextBatchIn: WARE.batch - (now % WARE.batch), demand: demand(now) };
}

/* ---------- twin 3: autonomous EV depot, metered kWh under a capped mandate ---------- */
const EV = {
  id: 'ev-depot',
  name: 'EV depot EVD-03',
  kind: 'Autonomous fleet charging',
  chargers: ['ch-1', 'ch-2', 'ch-3', 'ch-4', 'ch-5', 'ch-6'],
  slot: 4500, perKwh: 0.31, cap: 30,
};
const sessionMemo = new Map();
function session(ch, i, k) {
  const key = `${ch}:${k}`;
  if (sessionMemo.has(key)) return sessionMemo.get(key);
  const slotStart = k * EV.slot + i * 700;
  const start = slotStart + Math.floor(rnd(ch, k, 'start') * 900);
  const plannedDur = 1500 + Math.floor(rnd(ch, k, 'dur') * 1800);
  const kw = 60 + rnd(ch, k, 'kw') * 90;
  const vehicle = `av-${String(1 + Math.floor(rnd(ch, k, 'av') * 14)).padStart(2, '0')}`;
  const intervals = []; let total = 0; let capped = false;
  const n = Math.floor(plannedDur / 60);
  for (let j = 1; j <= n; j += 1) {
    const p = j / n;
    const taper = p < 0.7 ? 1 : 1 - ((p - 0.7) / 0.3) * 0.6;
    const kwh = Math.round(((kw / 60) * taper) * 1000) / 1000;
    const amt = usd(kwh * EV.perKwh);
    if (total + amt > EV.cap) { capped = true; break; }
    total = usd(total + amt);
    intervals.push({ s: start + j * 60, kwh, amt });
  }
  const end = intervals.length ? intervals[intervals.length - 1].s : start + 60;
  const kwhTotal = Math.round(intervals.reduce((a, b) => a + b.kwh, 0) * 1000) / 1000;
  const v = { start, end, vehicle, kw: Math.round(kw), intervals, total, kwhTotal, capped };
  if (sessionMemo.size > 500) sessionMemo.clear();
  sessionMemo.set(key, v);
  return v;
}
function evEvents(from, to) {
  const out = [];
  const T = EV.id;
  EV.chargers.forEach((ch, i) => {
    const k0 = Math.floor((from - i * 700) / EV.slot) - 1;
    const k1 = Math.floor((to - i * 700) / EV.slot);
    for (let k = k0; k <= k1; k += 1) {
      const v = session(ch, i, k);
      const actor = `vehicle:${v.vehicle}`;
      const add = (s, e) => { if (s >= from && s < to) out.push({ id: `${T}:${ch}:${s}:${e.type}`, t: s * 1000, ts: iso(s), twin: T, actor, mandate: mandateOf(T, v.vehicle, v.start), simulated: true, charger: ch, ...e }); };
      add(v.start, { type: 'telemetry', summary: `${v.vehicle} plugged in at ${ch}, mandate check passed, cap $${EV.cap.toFixed(2)}` });
      v.intervals.forEach((x) => add(x.s, { type: 'payment', summary: `${x.kwh.toFixed(2)} kWh metered at ${ch}, netted`, amount: x.amt, mode: 'netted', evidence: { kind: 'signed reading', digest: simHex(32, 'kwh', ch, x.s) } }));
      if (v.capped) add(v.end + 1, { type: 'hold', summary: `Mandate cap reached for ${v.vehicle}. Session stopped at $${v.total.toFixed(2)}.` });
      const inputs = { from: actor, to: `charger:evd-03-${ch}`, asset: 'usdc', amount: String(v.total), nonce: `${k}`, evidence: simHex(32, 'session', ch, k) };
      add(v.end + 2, { type: 'settlement', summary: `Session settled: ${v.kwhTotal.toFixed(1)} kWh for ${v.vehicle}`, amount: v.total, count: v.intervals.length, mode: 'batch', chain: CHAIN, confirmed_ms: confirmedMs(ch, k), receipt: receipt(inputs), from: inputs.from, to: inputs.to });
    }
  });
  return out;
}
function evStatus(now) {
  return EV.chargers.map((ch, i) => {
    const k = Math.floor((now - i * 700) / EV.slot);
    for (const kk of [k, k - 1]) {
      const v = session(ch, i, kk);
      if (now >= v.start && now <= v.end + 2) {
        const done = v.intervals.filter((x) => x.s <= now);
        return { id: ch, state: 'Charging', vehicle: v.vehicle, kw: v.kw, kwh: Math.round(done.reduce((a, b) => a + b.kwh, 0) * 10) / 10, usdc: usd(done.reduce((a, b) => a + b.amt, 0)), cap: EV.cap };
      }
    }
    return { id: ch, state: 'Idle' };
  });
}

/* ---------- public surface ---------- */
export const TWINS = [
  { id: DRONE.id, name: DRONE.name, kind: DRONE.kind, events: droneEvents, status: droneStatus, units: `${DRONE.drones.length} drones, 3 pads` },
  { id: WARE.id, name: WARE.name, kind: WARE.kind, events: wareEvents, status: wareStatus, units: `${WARE.arms.length} robot arms` },
  { id: EV.id, name: EV.name, kind: EV.kind, events: evEvents, status: evStatus, units: `${EV.chargers.length} chargers, 14 vehicles` },
];

// Events in [fromSec, toSec), oldest first.
export function eventsBetween(fromSec, toSec, twinId) {
  const list = [];
  for (const t of TWINS) if (!twinId || t.id === twinId) list.push(...t.events(fromSec, toSec));
  return list.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

export function snapshot(nowSec) {
  return TWINS.map((t) => ({ id: t.id, name: t.name, kind: t.kind, units: t.units, status: t.status(nowSec) }));
}

// Totals for the hour ending at nowSec. Volume counts what actually settles:
// single payments, releases, and batch settlements, never netted actions twice.
export function hourStats(nowSec) {
  const ev = eventsBetween(nowSec - 3600, nowSec);
  const settled = ev.filter((e) => e.confirmed_ms);
  const perTwin = {};
  for (const t of TWINS) perTwin[t.id] = { events: 0, usdc: 0 };
  for (const e of ev) perTwin[e.twin].events += 1;
  for (const e of settled) perTwin[e.twin].usdc = usd(perTwin[e.twin].usdc + e.amount);
  return {
    window: '1h',
    events: ev.length,
    actions: ev.filter((e) => e.mode === 'netted').length,
    settlements: settled.length,
    usdc: usd(settled.reduce((a, e) => a + e.amount, 0)),
    avg_confirmed_ms: settled.length ? Math.round(settled.reduce((a, e) => a + e.confirmed_ms, 0) / settled.length) : null,
    holds: ev.filter((e) => e.type === 'hold' || e.type === 'rejected').length,
    per_twin: perTwin,
  };
}
