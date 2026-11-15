// One email to send. `text` is required so every email also works in plain-text
// mail apps; `html` is the formatted version added with templates in Phase 2.
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Every way of sending email has the same shape, so the rest of the app never
// needs to know which one is active (PRD §22).
export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}
