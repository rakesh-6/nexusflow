import type { MailMessage, MailProvider } from "./types.ts";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

/** "NexusFlow <me@gmail.com>" -> { name: "NexusFlow", email: "me@gmail.com" } */
export function parseAddress(address: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(address);
  if (!match) return { email: address.trim() };
  const [, name, email] = match;
  return name ? { name, email: email ?? "" } : { email: email ?? "" };
}

// Real email through Brevo's free plan (PRD §22): a plain HTTPS call, so it
// works on hosts that block email ports, and needs no extra library. The free
// plan allows 300 emails a day; past `dailyCap` emails are refused (and the
// caller logs that) instead of being rejected by Brevo.
export function createBrevoMailProvider(options: {
  apiKey: string;
  from: string;
  dailyCap: number;
}): MailProvider {
  const sender = parseAddress(options.from);
  let day = "";
  let sentToday = 0;

  return {
    name: "brevo",
    async send(message: MailMessage) {
      const today = new Date().toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        sentToday = 0;
      }
      if (sentToday >= options.dailyCap) {
        throw new Error(`Daily email limit of ${options.dailyCap} reached; email not sent`);
      }

      const response = await fetch(BREVO_SEND_URL, {
        method: "POST",
        headers: {
          "api-key": options.apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          ...(message.html ? { htmlContent: message.html } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 200);
        throw new Error(`Brevo answered ${response.status}: ${detail}`);
      }
      sentToday++;
    },
  };
}
