import type { MailMessage, MailProvider } from "./types.ts";

export interface SentMail extends MailMessage {
  from: string;
  sentAt: Date;
}

export interface MemoryMailProvider extends MailProvider {
  /** Every email "sent" since the last clear(), oldest first. */
  readonly sent: SentMail[];
  clear(): void;
}

// Test email: nothing is sent; emails are kept in a list so automated tests can
// check them, e.g. "the verification email contains a link" (PRD §25.1).
export function createMemoryMailProvider(from: string): MemoryMailProvider {
  const sent: SentMail[] = [];
  return {
    name: "memory",
    sent,
    async send(message: MailMessage) {
      sent.push({ ...message, from, sentAt: new Date() });
    },
    clear() {
      sent.length = 0;
    },
  };
}
