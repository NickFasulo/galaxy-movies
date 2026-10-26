import { SITE_URL } from './site'

// Registered business address — CAN-SPAM requires a valid postal address in
// every commercial email footer.
export const MAILING_ADDRESS = '921 S Beacon St, Los Angeles, CA 90731'

// Palette mirrors the site theme: surface.* and brand.accent from theme.ts,
// Chakra's gray ramp for text, and #9ec1ff (the logo swoosh blue) for links.
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

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
  // Gmail (esp. iOS dark mode) force-inverts every color — dark emails render
  // white. Defenses: `light only` opts out of the invert where honored; the
  // gradient decoy survives it (gradients aren't inverted); the u+.body blend
  // layers match only in Gmail (which swaps the doctype for <u>) and re-invert
  // the flip, restoring light text on dark. The table canvas + margin reset
  // kill the white edges — Gmail drops the body's inline styles, exposing the
  // webview's default 8px body margin.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><meta name="x-apple-disable-message-reformatting"><style>@font-face{font-family:'Inter';src:url('${SITE_URL}/fonts/inter-var-latin.woff2') format('woff2');font-weight:100 900;font-display:swap}
html,body,.body{margin:0;padding:0}u + .body .gmail-blend-screen{background:#000;mix-blend-mode:screen}u + .body .gmail-blend-difference{background:#000;mix-blend-mode:difference}</style></head>
<body class="body" bgcolor="#14181c" style="margin:0; padding:0; background-color:#14181c;">
${preheader ? `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#14181c" style="width:100%; background-color:#14181c; background-image:linear-gradient(#14181c,#14181c);">
  <tr>
    <td bgcolor="#14181c" style="padding:36px 16px 28px; font-family:${FONT}; color:#e2e8f0;">
      <div style="max-width:540px; margin:0 auto;">
        <div style="text-align:center; padding-bottom:22px;">
          <a href="${SITE_URL}" style="text-decoration:none;"><img src="${SITE_URL}/email-logo.png" width="264" alt="Galaxy Movies" style="display:inline-block; border:0; width:264px; max-width:100%; height:auto; color:#ffffff; font-size:20px; font-weight:700;" /></a>
        </div>
        <div class="gmail-blend-screen"><div class="gmail-blend-difference">
          <div style="background-color:#1f252b; border:1px solid #2a3138; border-radius:14px; padding:26px 28px;">
            <div style="font-size:20px; font-weight:700; color:#ffffff; margin:0 0 6px; text-align:center;">${heading}</div>
            ${body}
          </div>
          <div style="padding:20px 8px 0; text-align:center; font-size:12px; line-height:1.6; color:#718096;">
            ${reason ? `<div>${unsubUrl ? `${reason.replace(/\.$/, '')} · <a href="${unsubUrl}" style="color:#718096; text-decoration:underline;">Unsubscribe</a>` : reason}</div>` : ''}
            <div style="margin-top:6px;">Galaxy Movies · ${MAILING_ADDRESS}</div>
            <div>© ${new Date().getFullYear()} Galaxy Movies</div>
          </div>
        </div></div>
      </div>
    </td>
  </tr>
</table>
</body></html>`
}

export function emailCta(url: string, label: string, showRawLink = false): string {
  const button = `<p style="margin:22px 0 6px; text-align:center;"><a href="${url}" style="display:inline-block; background-color:#2b6cb0; color:#ffffff; padding:11px 22px; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px;">${label}</a></p>`
  if (!showRawLink) return button
  return button + `<p style="margin:14px 0 0; color:#718096; font-size:12px; word-break:break-all; text-align:center;">Or paste this link: ${url}</p>`
}

// Inset panel for the Plus upsell inside the raised card.
export function emailCallout(innerHtml: string): string {
  return `<p style="margin:18px 0 0; padding:12px 14px; background-color:#14181c; border:1px solid #2a3138; border-radius:8px; font-size:13px; line-height:1.55; color:#a0aec0;">${innerHtml}</p>`
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
