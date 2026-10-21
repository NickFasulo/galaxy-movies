import { SITE_URL } from './site'

// Registered business address — CAN-SPAM requires a valid postal address in
// every commercial email footer.
export const MAILING_ADDRESS = '921 S Beacon St, Los Angeles, CA 90731'

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

export const escapeHtml = (s: unknown) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface EmailLayoutOptions {
  heading: string
  body: string
  preheader?: string
  // "Why am I getting this" line shown above the address block.
  reason?: string
  unsubUrl?: string
}

export function emailLayout({ heading, body, preheader, reason, unsubUrl }: EmailLayoutOptions): string {
  return `<!DOCTYPE html>
<html><head><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0; padding:0; background-color:#14181c;">
${preheader ? `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escapeHtml(preheader)}</div>` : ''}
<div style="background-color:#14181c; padding:36px 16px 28px; font-family:${FONT}; color:#d7dde4;">
  <div style="max-width:540px; margin:0 auto;">
    <div style="text-align:center; padding-bottom:22px;">
      <img src="${SITE_URL}/icons/icon-192.png" width="40" height="40" alt="" style="display:inline-block; vertical-align:middle; border:0; border-radius:9px;" /><span style="display:inline-block; vertical-align:middle; margin-left:10px; font-size:14px; font-weight:700; letter-spacing:0.14em; color:#ffffff;">GALAXY MOVIES</span>
    </div>
    <div style="background-color:#1f252b; border:1px solid #2a3138; border-radius:14px; padding:26px 28px;">
      <div style="font-size:20px; font-weight:700; color:#ffffff; margin:0 0 6px;">${heading}</div>
      ${body}
    </div>
    <div style="padding:20px 8px 0; text-align:center; font-size:12px; line-height:1.6; color:#6d7885;">
      ${reason ? `<div>${unsubUrl ? `${reason.replace(/\.$/, '')} · <a href="${unsubUrl}" style="color:#6d7885; text-decoration:underline;">Unsubscribe</a>` : reason}</div>` : ''}
      <div style="margin-top:6px;">Galaxy Movies · ${MAILING_ADDRESS}</div>
      <div>© ${new Date().getFullYear()} Galaxy Movies</div>
    </div>
  </div>
</div>
</body></html>`
}

export function emailCta(url: string, label: string, showRawLink = false): string {
  const button = `<p style="margin:22px 0 6px;"><a href="${url}" style="display:inline-block; background-color:#2b6cb0; color:#ffffff; padding:11px 22px; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px;">${label}</a></p>`
  if (!showRawLink) return button
  return button + `<p style="margin:14px 0 0; color:#6d7885; font-size:12px; word-break:break-all;">Or paste this link: ${url}</p>`
}

// Inset panel for the Plus upsell inside the raised card.
export function emailCallout(innerHtml: string): string {
  return `<p style="margin:18px 0 0; padding:12px 14px; background-color:#14181c; border:1px solid #2a3138; border-radius:8px; font-size:13px; line-height:1.55; color:#93a0ad;">${innerHtml}</p>`
}

export async function sendEmail(opts: { to: string; subject: string; html: string; headers?: Record<string, string> }): Promise<boolean> {
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Galaxy Movies <onboarding@resend.dev>',
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        headers: opts.headers
      })
    })
    return resp.ok
  } catch {
    return false
  }
}
