import { env } from "../../config/env.ts";
import { createConsoleMailProvider } from "./consoleMailProvider.ts";
import { createMemoryMailProvider } from "./memoryMailProvider.ts";
import type { MailProvider } from "./types.ts";

export type { MailMessage, MailProvider } from "./types.ts";

// Tests read emails from here when MAIL_PROVIDER is "memory".
export const memoryMailbox = createMemoryMailProvider(env.MAIL_FROM);

// The email sender the whole app uses, chosen by the MAIL_PROVIDER setting:
//   await mailer.send({ to, subject, text });
export const mailer: MailProvider =
  env.MAIL_PROVIDER === "memory"
    ? memoryMailbox
    : createConsoleMailProvider(env.MAIL_FROM, env.NODE_ENV !== "production");
