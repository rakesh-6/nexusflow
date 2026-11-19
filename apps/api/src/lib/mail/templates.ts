import { APP_NAME } from "@nexusflow/shared";
import type { MailMessage } from "./types.ts";

// Account emails (PRD §11.1). Each has a plain-text version, which every mail
// app can show, and a simple HTML version with a button.

type EmailContent = Omit<MailMessage, "to">;

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Wraps paragraphs and an optional button in a minimal, mail-app-friendly layout. */
function html(paragraphs: string[], button?: { label: string; url: string }) {
  const body = paragraphs
    .map((text) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(text)}</p>`)
    .join("");
  const action = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#4F46E5;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(button.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;color:#64748B">Or copy this link: ${escapeHtml(button.url)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F8FAFC;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0F172A"><div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E2E8F0;border-radius:10px;padding:28px"><p style="margin:0 0 20px;font-size:18px;font-weight:700">${APP_NAME}</p>${body}${action}<p style="margin:24px 0 0;font-size:12px;color:#94A3B8">You received this email because of activity on your ${APP_NAME} account.</p></div></body></html>`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function verifyEmailMessage(input: { name: string; link: string }): EmailContent {
  const lines = [
    `Hi ${firstName(input.name)},`,
    `Please confirm your email address to start using ${APP_NAME}. The link works once and expires in 24 hours.`,
  ];
  return {
    subject: `Verify your email for ${APP_NAME}`,
    text: `${lines.join("\n\n")}\n\n${input.link}\n`,
    html: html(lines, { label: "Verify email", url: input.link }),
  };
}

export function accountExistsMessage(input: {
  name: string;
  loginLink: string;
  resetLink: string;
}): EmailContent {
  const lines = [
    `Hi ${firstName(input.name)},`,
    `Someone tried to create a new ${APP_NAME} account with this email address, but you already have one.`,
    `If that was you, just log in. If you forgot your password, you can reset it: ${input.resetLink}`,
    "If it was not you, you can ignore this email. Your account is unchanged.",
  ];
  return {
    subject: `You already have a ${APP_NAME} account`,
    text: `${lines.join("\n\n")}\n\nLog in: ${input.loginLink}\n`,
    html: html(lines, { label: "Log in", url: input.loginLink }),
  };
}

export function passwordResetMessage(input: { name: string; link: string }): EmailContent {
  const lines = [
    `Hi ${firstName(input.name)},`,
    "Someone asked to reset your password. Use the link below to choose a new one. It works once and expires in 1 hour.",
    "If you did not ask for this, you can ignore this email. Your password stays the same.",
  ];
  return {
    subject: `Reset your ${APP_NAME} password`,
    text: `${lines.join("\n\n")}\n\n${input.link}\n`,
    html: html(lines, { label: "Choose a new password", url: input.link }),
  };
}

export function invitationMessage(input: {
  organizationName: string;
  inviterName: string;
  role: string;
  link: string;
}): EmailContent {
  const role = input.role.charAt(0) + input.role.slice(1).toLowerCase();
  const lines = [
    `${input.inviterName} invited you to join ${input.organizationName} on ${APP_NAME} as ${role === "Admin" ? "an" : "a"} ${role}.`,
    "The invitation works for 7 days. If you do not know this person, you can ignore this email.",
  ];
  return {
    subject: `${input.inviterName} invited you to ${input.organizationName} on ${APP_NAME}`,
    text: `${lines.join("\n\n")}\n\n${input.link}\n`,
    html: html(lines, { label: "View invitation", url: input.link }),
  };
}

export function passwordChangedMessage(input: { name: string }): EmailContent {
  const lines = [
    `Hi ${firstName(input.name)},`,
    `Your ${APP_NAME} password was just changed, and you were signed out on your other devices.`,
    "If you did not do this, reset your password right away and check your account's active sessions.",
  ];
  return {
    subject: `Your ${APP_NAME} password was changed`,
    text: lines.join("\n\n") + "\n",
    html: html(lines),
  };
}

/** A notification by email (PRD §11.10.1, FR-NOTIF-02), with a link to change preferences. */
export function notificationMessage(input: {
  name: string;
  title: string;
  body: string | null;
  link: string;
  preferencesLink: string;
}): EmailContent {
  const lines = [
    `Hi ${firstName(input.name)},`,
    input.title,
    ...(input.body ? [input.body] : []),
    `You can choose which emails you get here: ${input.preferencesLink}`,
  ];
  return {
    subject: input.title,
    text: `${lines.join("\n\n")}\n\nOpen in ${APP_NAME}: ${input.link}\n`,
    html: html(lines, { label: `Open in ${APP_NAME}`, url: input.link }),
  };
}
