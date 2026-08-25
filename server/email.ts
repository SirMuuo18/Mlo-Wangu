// Transactional email — access-code delivery/resend.
// Sends via SMTP (nodemailer) using a real mailbox — defaults to Gmail's
// SMTP endpoint, since that's what this deployment is configured with
// (an app password, not the account's real password — Gmail rejects plain
// password SMTP login). Host/port are still overridable via env for a
// future switch to a different SMTP provider without code changes.
// Config resolved from env, returns null (never throws) if unconfigured —
// same fail-closed pattern as mpesa.ts's getDarajaConfig(); every caller
// treats a missing config exactly like any other send failure.
import nodemailer from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromAddress: string;
}

export function getEmailConfig(): EmailConfig | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  if (!user || !pass || !fromAddress) return null;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  return { host, port, user, pass, fromAddress };
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

// Never throws — callers treat a failure as non-fatal (log to email_log,
// never roll back the payment/notification/access-code that triggered it).
// A fresh transport is created per call rather than kept as module-level
// state — this runs in a serverless function where a long-lived SMTP
// connection can't be relied on to survive between invocations anyway.
export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<SendEmailResult> {
  const config = getEmailConfig();
  if (!config) return { ok: false, error: 'not_configured' };

  try {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    await transport.sendMail({
      from: `"Mlo Wangu" <${config.fromAddress}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
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
