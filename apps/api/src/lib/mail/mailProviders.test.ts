import { afterEach, describe, expect, it, vi } from "vitest";
import { createConsoleMailProvider } from "./consoleMailProvider.ts";
import { createMemoryMailProvider } from "./memoryMailProvider.ts";

const FROM = "NexusFlow <no-reply@nexusflow.local>";
const message = {
  to: "sana@acme.example",
  subject: "Verify your email",
  text: "Link: http://x/verify?t=1",
};

describe("memory mail provider", () => {
  it("keeps sent emails in order and empties on clear()", async () => {
    const mailbox = createMemoryMailProvider(FROM);
    await mailbox.send(message);
    await mailbox.send({ ...message, to: "dev@acme.example" });

    expect(mailbox.sent.map((mail) => mail.to)).toEqual(["sana@acme.example", "dev@acme.example"]);
    expect(mailbox.sent[0]).toMatchObject({ from: FROM, subject: "Verify your email" });

    mailbox.clear();
    expect(mailbox.sent).toHaveLength(0);
  });
});

describe("console mail provider", () => {
  afterEach(() => vi.restoreAllMocks());

  function captureOutput() {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    return () => write.mock.calls.map((call) => String(call[0])).join("");
  }

  it("prints the whole email in development", async () => {
    const output = captureOutput();
    await createConsoleMailProvider(FROM, true).send(message);
    expect(output()).toContain("To:      sana@acme.example");
    expect(output()).toContain("http://x/verify?t=1");
  });

  it("hides the body when told to (production), because it may contain private links", async () => {
    const output = captureOutput();
    await createConsoleMailProvider(FROM, false).send(message);
    expect(output()).toContain("Subject: Verify your email");
    expect(output()).not.toContain("http://x/verify?t=1");
  });
});
