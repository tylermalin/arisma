// Vercel Function: the digital twin testnet stream.
//
// GET /api/stream                 the last 60 seconds, live
// GET /api/stream?at=<ms>         the 60 seconds ending at that time (any past time)
//     &window=<seconds>           up to 900
//     &twin=<id>                  drone-dock | warehouse | ev-depot
//     &stats=0                    skip the hourly totals
//
// Events are computed from a seeded clock (lib/twins.js), so a window in the past
// always returns the same events. Those responses are cached for a day at the edge.
// Everything here is simulated; each event carries `simulated: true`.

import { eventsBetween, snapshot, hourStats, TWINS, CHAIN } from '../lib/twins.js';

const json = (status, body, cache) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*' },
});

export function GET(request) {
  const url = new URL(request.url);
  const nowSec = Math.floor(Date.now() / 1000);
  const atParam = url.searchParams.get('at');
  let at = atParam === null ? nowSec : Math.floor(Number(atParam) / 1000);
  if (!Number.isFinite(at)) return json(400, { error: 'bad_at' }, 'no-store');
  const future = at > nowSec;
  if (future) at = nowSec;

  const win = Math.min(Math.max(Math.floor(Number(url.searchParams.get('window') || 60)), 1), 900);
  const twin = url.searchParams.get('twin') || undefined;
  if (twin && !TWINS.some((t) => t.id === twin)) return json(400, { error: 'unknown_twin', twins: TWINS.map((t) => t.id) }, 'no-store');

  const body = {
    simulated: true,
    note: 'Digital twins: simulated projects on a seeded clock. Not real machines or payments.',
    chain: CHAIN,
    at: at * 1000,
    window_s: win,
    twins: snapshot(at),
    events: eventsBetween(at - win, at + 1, twin).reverse(),
  };
  if (url.searchParams.get('stats') !== '0') body.stats = hourStats(at);

  // A fixed past window never changes, so the edge can keep it for a day.
  const fixed = atParam !== null && !future && at <= nowSec - 2;
  return json(200, body, fixed ? 'public, max-age=60, s-maxage=86400, immutable' : 'public, max-age=0, s-maxage=1, stale-while-revalidate=4');
}
