// Vercel Function: delivers site form submissions by email through Resend.
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY   Resend API key (re_...)
//   RESEND_FROM      verified sender, e.g. "Arisma Network <noreply@arisma.network>"
//   RESEND_TO        comma-separated inbox(es) that receive submissions

const FORMS = {
  access: { subject: 'Access request', fields: ['name', 'email', 'org', 'use', 'target'] },
  contact: { subject: 'Contact', fields: ['name', 'email', 'interest', 'message'] },
  status: { subject: 'Status alerts signup', fields: ['email', 'scope'] },
};
const LABELS = { name: 'Name', email: 'Email', org: 'Organization', use: 'Primary use', target: 'API key target', interest: 'Interest', message: 'Message', scope: 'Notify about' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX = { message: 4000, default: 300 };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const clean = (v, key) => String(v ?? '').replace(/[\r\n]+/g, key === 'message' ? '\n' : ' ').trim().slice(0, MAX[key] || MAX.default);

export async function POST(request) {
  const { RESEND_API_KEY, RESEND_FROM, RESEND_TO } = process.env;
  if (!RESEND_API_KEY || !RESEND_FROM || !RESEND_TO) return json(500, { error: 'not_configured' });

  let input;
  try { input = await request.json(); } catch { return json(400, { error: 'bad_request' }); }

  // honeypot: real people never fill the hidden "company_site" field
  if (input.company_site) return json(200, { ok: true });

  const form = FORMS[input.form];
  if (!form) return json(400, { error: 'unknown_form' });

  const email = clean(input.email, 'email');
  if (!EMAIL.test(email)) return json(400, { error: 'invalid_email' });

  const lines = form.fields
    .map((k) => [k, k === 'email' ? email : clean(input[k], k)])
    .filter(([, v]) => v)
    .map(([k, v]) => `${LABELS[k]}: ${v}`);
  lines.push('', `Page: ${clean(input.page, 'page') || 'unknown'}`, `Received: ${new Date().toISOString()}`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: RESEND_TO.split(',').map((s) => s.trim()).filter(Boolean),
      reply_to: email,
      subject: `[arisma.network] ${form.subject} from ${email}`,
      text: lines.join('\n'),
    }),
  });

  if (!res.ok) {
    console.error('resend_failed', res.status, await res.text().catch(() => ''));
    return json(502, { error: 'send_failed' });
  }
  return json(200, { ok: true });
}

export function GET() {
  return json(405, { error: 'method_not_allowed' });
}
