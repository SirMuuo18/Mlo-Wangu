// Transactional email — access-code delivery/resend.
// Modeled on mpesa.ts's getDarajaConfig(): config resolved from env, returns
// null (never throws) if unconfigured, so every caller fails closed exactly
// like the rest of this codebase's external integrations. Uses Resend's
// HTTP API via fetch — no new SDK, same style as every other outbound call
// here (Daraja, Supabase, Gemini are all bare fetch/thin-SDK, never a raw
// SMTP socket).

interface EmailConfig {
  apiKey: string;
  fromAddress: string;
}

export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !fromAddress) return null;
  return { apiKey, fromAddress };
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

// Never throws — callers treat a failure as non-fatal (log to email_log,
// never roll back the payment/notification/access-code that triggered it).
export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<SendEmailResult> {
  const config = getEmailConfig();
  if (!config) return { ok: false, error: 'not_configured' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.fromAddress,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Resend API returned ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Email send failed' };
  }
}

// Formats the exact content required for the "MLO WANGU — Your Access Code"
// email: payment verified, the code, 7-day validity, exact expiry, and where
// to enter it.
export function buildAccessCodeEmail(opts: { code: string; expiresAt: string | null }): { subject: string; html: string; text: string } {
  const expiryText = opts.expiresAt
    ? new Date(opts.expiresAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' })
    : 'in 7 days';

  const text = `MLO WANGU — Your Access Code

Your M-Pesa payment has been verified.

Access code: ${opts.code}

This code is valid for 7 days and expires on ${expiryText}.

To use it: open MLO WANGU, tap "Generate New Plan" → "Enter Access Code", and paste this code in.

If you didn't request this, you can ignore this email.`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #17201A;">
      <h2 style="color: #14532D;">MLO WANGU — Your Access Code</h2>
      <p>Your M-Pesa payment has been <strong>verified</strong>.</p>
      <div style="background: #FAF8F2; border: 1px solid #E8E5DD; border-radius: 12px; padding: 16px 20px; margin: 20px 0; text-align: center;">
        <span style="font-size: 22px; font-weight: 800; letter-spacing: 2px; color: #17201A;">${opts.code}</span>
      </div>
      <p>This code is valid for <strong>7 days</strong> and expires on <strong>${expiryText}</strong>.</p>
      <p>To use it: open MLO WANGU, tap <strong>"Generate New Plan"</strong> &rarr; <strong>"Enter Access Code"</strong>, and paste this code in.</p>
      <p style="color: #66736A; font-size: 12px; margin-top: 24px;">If you didn't request this, you can ignore this email.</p>
    </div>`;

  return { subject: 'MLO WANGU — Your Access Code', html, text };
}
