import type { MailMessage, MailProvider } from "./types.ts";

// Development email: nothing is sent. The email is printed in the terminal so
// you can read it and click its links (for example, a verification link).
export function createConsoleMailProvider(from: string, showBody: boolean): MailProvider {
  return {
    name: "console",
    async send(message: MailMessage) {
      const line = "─".repeat(60);
      const body = showBody
        ? message.text.split("\n").map((text) => `│ ${text}`)
        : ["│ (body hidden in production: it may contain private links)"];
      const block = [
        `┌─ Email (not sent: console mail provider) ${line.slice(42)}`,
        `│ From:    ${from}`,
        `│ To:      ${message.to}`,
        `│ Subject: ${message.subject}`,
        "│",
        ...body,
        `└${line}`,
      ];
      process.stdout.write(block.join("\n") + "\n");
    },
  };
}
