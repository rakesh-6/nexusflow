import { env } from "../../config/env.ts";
import { logger } from "../logger.ts";
import { createBrevoMailProvider } from "./brevoMailProvider.ts";
import { createConsoleMailProvider } from "./consoleMailProvider.ts";
import { createMemoryMailProvider } from "./memoryMailProvider.ts";
import type { MailMessage, MailProvider } from "./types.ts";

export type { MailMessage, MailProvider } from "./types.ts";

// Tests read emails from here when MAIL_PROVIDER is "memory".
export const memoryMailbox = createMemoryMailProvider(env.MAIL_FROM);

function chooseProvider(): MailProvider {
  switch (env.MAIL_PROVIDER) {
    case "memory":
      return memoryMailbox;
    case "brevo":
      return createBrevoMailProvider({
        apiKey: env.BREVO_API_KEY ?? "",
        from: env.MAIL_FROM,
        dailyCap: env.MAIL_DAILY_CAP,
      });
    case "console":
      return createConsoleMailProvider(env.MAIL_FROM, env.NODE_ENV !== "production");
  }
}

// The email sender the whole app uses, chosen by the MAIL_PROVIDER setting.
export const mailer: MailProvider = chooseProvider();

/**
 * Sends an email without ever failing the request that triggered it: a broken
 * email service must not stop someone from signing up. Problems are logged,
 * and the person can ask for the email again (for example "resend link").
 */
export async function sendEmail(message: MailMessage): Promise<boolean> {
  try {
    await mailer.send(message);
    return true;
  } catch (error) {
    // Log "s***@acme.example", never the full address (personal data).
    const to = message.to.replace(/^(.)[^@]*@/, "$1***@");
    logger.error({ err: error, to, subject: message.subject }, "Email not sent");
    return false;
  }
}
