import { SITE_URL } from './site'

// Registered business address — CAN-SPAM requires a valid postal address in
// every commercial email footer.
export const MAILING_ADDRESS = '921 S Beacon St, Los Angeles, CA 90731'

// Email colors use a light canvas and readable contrast independently of the site theme.
const FONT = "Arial, Helvetica, sans-serif"

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
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><meta name="x-apple-disable-message-reformatting"></head>
<body class="body" bgcolor="#ffffff" style="margin:0; padding:0; background-color:#ffffff;">
${preheader ? `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%; background-color:#ffffff;">
  <tr>
    <td bgcolor="#ffffff" style="padding:36px 16px 28px; font-family:${FONT}; color:#1f2937;">
      <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:540px;"><tr><td bgcolor="#ffffff" style="font-family:${FONT}; color:#1f2937;">
        <div style="text-align:center; padding-bottom:22px;">
          <a href="${SITE_URL}" style="text-decoration:none;"><img src="${SITE_URL}/email-logo-light.png" width="264" alt="Galaxy Movies" style="display:inline-block; border:0; width:264px; max-width:100%; height:auto; color:#111827; font-size:20px; font-weight:700;" /></a>
        </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ffffff" style="background-color:#ffffff; color:#1f2937; border:1px solid #d1d5db; padding:24px 20px; font-family:${FONT}; font-size:16px; line-height:1.6;">
            <div style="font-size:20px; font-weight:700; color:#111827; margin:0 0 6px; text-align:center;">${heading}</div>
            ${body}
          </td></tr></table>
          <div style="padding:20px 8px 0; text-align:center; font-size:12px; line-height:1.6; color:#596579;">
            ${reason ? `<div>${unsubUrl ? `${reason.replace(/\.$/, '')} · <a href="${unsubUrl}" style="color:#596579; text-decoration:underline;">Unsubscribe</a>` : reason}</div>` : ''}
            <div style="margin-top:6px;">Galaxy Movies · ${MAILING_ADDRESS}</div>
            <div>© ${new Date().getFullYear()} Galaxy Movies</div>
          </div>

      </td></tr></table>
    </td>
  </tr>
</table>
</body></html>`
}

export function emailCta(url: string, label: string, showRawLink = false): string {
  const button = `<p style="margin:22px 0 6px; text-align:center;"><a href="${url}" style="display:inline-block; background-color:#2b6cb0; color:#ffffff; padding:11px 22px; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px;">${label}</a></p>`
  if (!showRawLink) return button
  return button + `<p style="margin:14px 0 0; color:#596579; font-size:12px; word-break:break-all; text-align:center;">Or paste this link: ${url}</p>`
}

// Inset panel for the Plus upsell inside the raised card.
export function emailCallout(innerHtml: string): string {
  return `<p style="margin:18px 0 0; padding:12px 14px; background-color:#ffffff; border:1px solid #d1d5db; border-radius:8px; font-size:13px; line-height:1.55; color:#4b5563;">${innerHtml}</p>`
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
