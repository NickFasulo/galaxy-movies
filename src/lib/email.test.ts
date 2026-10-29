import { describe, expect, it } from 'vitest'
import { emailCallout, emailCta, emailLayout, escapeHtml, MAILING_ADDRESS } from './email'

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml('<img src="x" onerror="alert(1)">')).toBe('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;')
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })
})

describe('emailLayout', () => {
  it('wraps body content in the branded card with logo and mailing address', () => {
    const html = emailLayout({ heading: 'Hello', body: '<p>Body</p>' })
    expect(html).toContain('Hello')
    expect(html).toContain('<p>Body</p>')
    expect(html).toContain('/email-logo-light.png')
    expect(html).toContain(MAILING_ADDRESS)
  })

  it('renders reason line and unsubscribe link when provided', () => {
    const html = emailLayout({
      heading: 'H',
      body: '',
      reason: 'You asked for alerts.',
      unsubUrl: 'https://example.com/unsub?token=t1'
    })
    expect(html).toContain('You asked for alerts ·')
    expect(html).toContain('href="https://example.com/unsub?token=t1"')
    expect(html).toContain('Unsubscribe')
  })

  it('omits the unsubscribe link for transactional mail', () => {
    const html = emailLayout({ heading: 'H', body: '', reason: 'Security notice.' })
    expect(html).not.toContain('Unsubscribe')
  })

  it('escapes the preheader preview text', () => {
    const html = emailLayout({ heading: 'H', body: '', preheader: '<b>sneaky</b>' })
    expect(html).toContain('&lt;b&gt;sneaky&lt;/b&gt;')
    expect(html).not.toContain('<b>sneaky</b>')
  })

  it('uses an explicit light canvas without color inversion workarounds', () => {
    const html = emailLayout({ heading: 'H', body: '' })
    expect(html).toContain('bgcolor="#ffffff"')
    expect(html).toContain('color:#1f2937')
    expect(html).not.toContain('mix-blend-mode')
    expect(html).not.toContain('linear-gradient')
    expect(html).toContain('role="presentation" width="100%"')
  })
})

describe('emailCta', () => {
  it('renders a branded button and optionally the raw link', () => {
    const withRaw = emailCta('https://example.com/confirm', 'Confirm', true)
    expect(withRaw).toContain('href="https://example.com/confirm"')
    expect(withRaw).toContain('>Confirm</a>')
    expect(withRaw).toContain('Or paste this link')
    expect(emailCta('https://example.com/confirm', 'Confirm')).not.toContain('Or paste this link')
  })
})

describe('emailCallout', () => {
  it('wraps inner html in the inset panel', () => {
    const html = emailCallout('<a href="/plus">Plus</a>')
    expect(html).toContain('<a href="/plus">Plus</a>')
    expect(html).toContain('background-color:#ffffff')
  })
})
