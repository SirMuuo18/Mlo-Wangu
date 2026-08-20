// Safaricom Daraja STK Push client.
// Credentials are read from process.env only — never hardcoded, never logged,
// never returned to any client. See .env.example for the expected variable
// names (MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE,
// MPESA_PASSKEY, MPESA_CALLBACK_URL, MPESA_ENVIRONMENT).

export const PREMIUM_PRICING: Record<'weekly' | 'monthly', { priceKsh: number; durationDays: number }> = {
  weekly: { priceKsh: 50, durationDays: 7 },
  monthly: { priceKsh: 150, durationDays: 30 },
};

// "Generate New Plan" gate — separate concept from Premium subscriptions.
// One payment (or one valid access code) buys exactly one new weekly
// meal-plan generation; it is never linked to a subscription and never
// flips profiles.is_premium.
export const MEAL_PLAN_GENERATION_PRICE_KSH = 50;
// How long a purchased/redeemed entitlement stays valid if unused.
export const MEAL_PLAN_GENERATION_ENTITLEMENT_VALID_MS = 24 * 60 * 60 * 1000;

interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  baseUrl: string;
  environment: 'sandbox' | 'production';
}

// MPESA_ENVIRONMENT must be explicitly 'sandbox' or 'production' — never
// defaulted, so a misconfigured deploy can't silently start sending
// production-mode transactions (or vice versa).
export function getDarajaConfig(): DarajaConfig | null {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;
  const environment = process.env.MPESA_ENVIRONMENT;

  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackUrl) return null;
  if (environment !== 'sandbox' && environment !== 'production') return null;

  const baseUrl = environment === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  return { consumerKey, consumerSecret, shortcode, passkey, callbackUrl, baseUrl, environment };
}

// Accepts common Kenyan formats (0712345678, 0112345678, 254712345678,
// +254712345678, with optional spaces/dashes) and normalizes to Daraja's
// required 2547XXXXXXXX / 2541XXXXXXXX format. Returns null if the input
// isn't a plausible Safaricom-reachable Kenyan mobile number.
export function normalizeKenyanPhone(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\s\-()]/g, '');
  const match = cleaned.match(/^(?:\+?254|0)([17]\d{8})$/);
  if (!match) return null;
  return `254${match[1]}`;
}

// Masks a normalized phone number for logging/diagnostics — never log the
// full number unnecessarily.
export function maskPhone(phone: string): string {
  if (phone.length < 6) return '***';
  return `${phone.slice(0, 6)}***${phone.slice(-2)}`;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(config: DarajaConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const res = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error('Daraja OAuth request failed');
  const data = await res.json() as { access_token: string; expires_in: string };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3599) * 1000 };
  return cachedToken.token;
}

function darajaTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  customerMessage: string;
}

// Initiates a real STK Push against Daraja. Throws on any failure — callers
// must not treat a thrown error as a successful payment.
export async function initiateStkPush(config: DarajaConfig, opts: {
  phone: string; amountKsh: number; accountReference: string; transactionDesc: string;
}): Promise<StkPushResult> {
  const token = await getAccessToken(config);
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64');

  const res = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: opts.amountKsh,
      PartyA: opts.phone,
      PartyB: config.shortcode,
      PhoneNumber: opts.phone,
      CallBackURL: config.callbackUrl,
      AccountReference: opts.accountReference,
      TransactionDesc: opts.transactionDesc,
    }),
  });

  const data = await res.json() as Record<string, any>;
  if (!res.ok || data.ResponseCode !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || 'STK push was rejected by Daraja');
  }

  return {
    merchantRequestId: data.MerchantRequestID,
    checkoutRequestId: data.CheckoutRequestID,
    responseCode: data.ResponseCode,
    customerMessage: data.CustomerMessage,
  };
}

export interface ParsedCallback {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  amountKsh?: number;
  mpesaReceipt?: string;
  phoneNumber?: string;
}

// Strictly validates the Daraja callback shape. Returns null (never throws)
// for anything that doesn't match — the caller acks Safaricom regardless and
// simply takes no action on an unparseable body.
export function parseDarajaCallback(body: any): ParsedCallback | null {
  const cb = body?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== 'string' || typeof cb.MerchantRequestID !== 'string' || typeof cb.ResultCode !== 'number') {
    return null;
  }

  const parsed: ParsedCallback = {
    merchantRequestId: cb.MerchantRequestID,
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: cb.ResultCode,
    resultDesc: typeof cb.ResultDesc === 'string' ? cb.ResultDesc : '',
  };

  const items = cb.CallbackMetadata?.Item;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item?.Name === 'Amount' && typeof item.Value === 'number') parsed.amountKsh = item.Value;
      if (item?.Name === 'MpesaReceiptNumber' && typeof item.Value === 'string') parsed.mpesaReceipt = item.Value;
      if (item?.Name === 'PhoneNumber') parsed.phoneNumber = String(item.Value);
    }
  }

  return parsed;
}
