/**
 * Transactional email through Brevo's HTTP API (the same Brevo account that
 * sends PG Sathi's Supabase auth emails over SMTP).
 *
 * Needs the Worker secret BREVO_API_KEY (Brevo → SMTP & API → API keys; an
 * "xkeysib-…" key, not the SMTP key) and the verified sender in EMAIL_FROM.
 */
import type { Env, Fetch } from './http';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Same look as the auth emails in supabase/email-templates. */
function layout(title: string, body: string, footer: string, to: string) {
  const font = 'Segoe UI,Roboto,Helvetica,Arial,sans-serif';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F6F7FB">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F6F7FB"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 4px 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="40" height="40" align="center" valign="middle" bgcolor="#14213D" style="border-radius:11px;font-size:20px;line-height:40px">&#127968;</td>
<td style="padding-left:12px;font-family:${font};font-size:19px;font-weight:700;color:#14213D">PG Sathi</td></tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="border:1px solid #E3E6EE;border-radius:16px;padding:36px 32px;font-family:${font};color:#182230">
<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;font-weight:700;color:#14213D">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:20px 8px 0;font-family:${font};font-size:12px;line-height:18px;color:#667085;text-align:center">${footer}<br>This email was sent to ${esc(to)} by PG Sathi.</td></tr>
</table></td></tr></table></body></html>`;
}

export function loginEmailHtml(input: { name: string; business: string; email: string; password: string; reset: boolean }) {
  const p = (html: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:24px;color:#182230">${html}</p>`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:10px 14px;font-size:13px;color:#667085;width:90px">${label}</td><td style="padding:10px 14px;font-family:Consolas,Menlo,monospace;font-size:16px;font-weight:700;color:#14213D;word-break:break-all">${esc(value)}</td></tr>`;
  const first = input.name.split(' ')[0] || 'there';
  const body = `${p(
    input.reset
      ? `Hi ${esc(first)}, ${esc(input.business)} has set a new temporary password for your PG Sathi app.`
      : `Hi ${esc(first)}, ${esc(input.business)} has created your PG Sathi app login. Use it to see your room, pay rent and keep every receipt.`,
  )}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EEEEFD" style="margin:20px 0;border-radius:12px">
${row('Email', input.email)}
${row('Temporary password', input.password)}
</table>
<p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#14213D">How to sign in</p>
<ol style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:24px;color:#182230">
<li>Open the PG Sathi app (ask ${esc(input.business)} if you don’t have it yet).</li>
<li>Sign in with the email and temporary password above.</li>
<li>Choose your own password when the app asks.</li>
</ol>`;
  return layout(
    input.reset ? 'Your new PG Sathi password' : 'Welcome to PG Sathi',
    body,
    'Didn’t expect this? You can ignore it, or ask your PG to remove your app access.',
    input.email,
  );
}

/** Sends one email. Returns null when sent, otherwise a short reason. */
export async function sendEmail(env: Env, fetchImpl: Fetch, msg: { to: string; toName?: string; subject: string; html: string }): Promise<string | null> {
  if (!env.BREVO_API_KEY) return 'Email sending is not set up yet.';
  try {
    const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: env.EMAIL_FROM_NAME || 'PG Sathi', email: env.EMAIL_FROM },
        to: [{ email: msg.to, ...(msg.toName ? { name: msg.toName } : {}) }],
        subject: msg.subject,
        htmlContent: msg.html,
      }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    console.error('brevo send failed', res.status, body.message);
    return 'The email service rejected the message.';
  } catch {
    return 'Could not reach the email service.';
  }
}
