// WhatsApp Cloud API, used by the public apply page: when an applicant opts in to WhatsApp, ask them for
// permission to call them there (Meta only lets a business place WhatsApp calls after the user approves
// inside WhatsApp; a checkbox on our page is not enough).
//
// Off until these are set (see .env.example):
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID   Cloud API credentials for T3Cogno's business number
//   WHATSAPP_CALL_TEMPLATE                     approved template with a call permission request; its body
//                                              takes {{1}} = first name and {{2}} = job title
//   WHATSAPP_DISPLAY_NUMBER (optional)         public number for "Say hi on WhatsApp" links, e.g. 919812345678
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

export function whatsappEnabled() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_CALL_TEMPLATE);
}

// Indian numbers default to +91. Returns digits only (the format the Cloud API expects), or null.
export function toWhatsAppNumber(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function whatsappChatLink(text) {
  const n = toWhatsAppNumber(process.env.WHATSAPP_DISPLAY_NUMBER);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export async function sendCallPermissionRequest({ phone, firstName, jobTitle }) {
  const to = toWhatsAppNumber(phone);
  if (!to) throw new Error('Phone number is not a valid WhatsApp number');
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: process.env.WHATSAPP_CALL_TEMPLATE,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: firstName }, { type: 'text', text: jobTitle }] }],
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${body.error?.message ?? 'request failed'}`);
  return body.messages?.[0]?.id ?? null;
}
