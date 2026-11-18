import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { memoryMailbox } from "../src/lib/mail/index.ts";
import { prisma } from "../src/lib/prisma.ts";

// Accounts and sign-in, end to end over HTTP (PRD §11.1, AC-AUTH-01 to 08).
// Each "agent" behaves like one browser: it keeps its cookies between requests.

const app = createApp();
const RUN = randomUUID().slice(0, 8);
const DOMAIN = "auth-test.example";
const PASSWORD = "Correct-horse-42";

let counter = 0;
const newEmail = () => `user${++counter}-${RUN}@${DOMAIN}`;
const newAgent = () => request.agent(app);

// Every request that changes something needs the anti-forgery header (PRD §19.3).
function post(agent: ReturnType<typeof newAgent>, path: string, body: object = {}) {
  return agent.post(`/api/v1${path}`).set("X-Requested-With", "NexusFlow").send(body);
}

/** The token from the newest link in the test mailbox sent to `email`. */
function latestLinkToken(email: string) {
  const mail = memoryMailbox.sent.filter((m) => m.to === email).at(-1);
  const token = mail ? /token=([\w-]+)/.exec(mail.text)?.[1] : undefined;
  if (!token) throw new Error(`No link email found for ${email}`);
  return token;
}

async function registerUser(email = newEmail()) {
  const agent = newAgent();
  const response = await post(agent, "/auth/register", {
    name: "Test Person",
    email,
    password: PASSWORD,
  });
  return { agent, email, response };
}

beforeEach(() => memoryMailbox.clear());

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await prisma.activityLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("registration (AC-AUTH-01, 02)", () => {
  it("creates an unverified user, signs them in and sends exactly one verification email", async () => {
    const { agent, email, response } = await registerUser();

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      email,
      emailVerified: false,
      hasPassword: true,
    });
    const cookie = String(response.headers["set-cookie"]);
    expect(cookie).toContain("nf_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    const mails = memoryMailbox.sent.filter((m) => m.to === email);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.subject).toContain("Verify your email");

    const me = await agent.get("/api/v1/users/me").expect(200);
    expect(me.body.data.email).toBe(email);
  });

  it("answers the same for a taken email, creates no second user and emails the real owner", async () => {
    const { email } = await registerUser();
    memoryMailbox.clear();

    const { response } = await registerUser(email.toUpperCase());
    expect(response.status).toBe(200);
    expect(response.body.data.user).toBeNull();
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(memoryMailbox.sent.map((m) => m.subject)).toEqual([
      "You already have a NexusFlow account",
    ]);
  });

  it("rejects weak passwords with field-level errors", async () => {
    const response = await post(newAgent(), "/auth/register", {
      name: "Weak",
      email: newEmail(),
      password: "password1",
    }).expect(400);
    expect(response.body.error.details).toEqual([
      {
        path: "body.password",
        message: "This password is too common. Choose a less predictable one.",
      },
    ]);
  });
});

describe("email verification (AC-AUTH-03)", () => {
  it("verifies once; the same link then fails", async () => {
    const { agent, email } = await registerUser();
    const token = latestLinkToken(email);

    const first = await post(newAgent(), "/auth/verify-email", { token }).expect(200);
    expect(first.body.data.user.emailVerified).toBe(true);
    const me = await agent.get("/api/v1/users/me").expect(200);
    expect(me.body.data.emailVerified).toBe(true);

    const second = await post(newAgent(), "/auth/verify-email", { token }).expect(400);
    expect(second.body.error.code).toBe("TOKEN_INVALID");
  });

  it("refuses an expired link", async () => {
    const { email } = await registerUser();
    const token = latestLinkToken(email);
    await prisma.verificationToken.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await post(newAgent(), "/auth/verify-email", { token }).expect(400);
    expect(response.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("limits resending to one email a minute", async () => {
    const { agent } = await registerUser();
    const response = await post(agent, "/auth/resend-verification").expect(429);
    expect(response.body.error.code).toBe("TOO_MANY_ATTEMPTS");
  });
});

describe("login, logout and lockout (AC-AUTH-04, 05)", () => {
  it("logs in with the right password and out again", async () => {
    const { email } = await registerUser();
    const agent = newAgent();
    await post(agent, "/auth/login", { email, password: PASSWORD }).expect(200);
    await agent.get("/api/v1/users/me").expect(200);

    await post(agent, "/auth/logout").expect(200);
    const after = await agent.get("/api/v1/users/me").expect(401);
    expect(after.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const { email } = await registerUser();
    const wrong = await post(newAgent(), "/auth/login", { email, password: "Wrong-pass-1" }).expect(
      401,
    );
    const unknown = await post(newAgent(), "/auth/login", {
      email: newEmail(),
      password: PASSWORD,
    }).expect(401);
    expect(wrong.body.error).toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it("locks the account after 5 wrong passwords, even for the right one", async () => {
    const { email } = await registerUser();
    for (let i = 0; i < 5; i++) {
      await post(newAgent(), "/auth/login", { email, password: `Wrong-pass-${i}` }).expect(401);
    }
    const locked = await post(newAgent(), "/auth/login", { email, password: PASSWORD }).expect(429);
    expect(locked.body.error.code).toBe("TOO_MANY_ATTEMPTS");
  });
});

describe("password reset and change (AC-AUTH-06)", () => {
  it("resets the password from the emailed link and signs out every device", async () => {
    const { agent, email } = await registerUser();

    await post(newAgent(), "/auth/forgot-password", { email }).expect(200);
    const token = latestLinkToken(email);
    await post(newAgent(), "/auth/reset-password", { token, password: "Brand-new-pass-7" }).expect(
      200,
    );

    await agent.get("/api/v1/users/me").expect(401);
    await post(newAgent(), "/auth/login", { email, password: PASSWORD }).expect(401);
    await post(newAgent(), "/auth/login", { email, password: "Brand-new-pass-7" }).expect(200);
    await post(newAgent(), "/auth/reset-password", { token, password: "Another-pass-8" }).expect(
      400,
    );
  });

  it("answers the same for an unknown email and sends nothing", async () => {
    const response = await post(newAgent(), "/auth/forgot-password", { email: newEmail() }).expect(
      200,
    );
    expect(response.body.data.message).toContain("If an account uses this email");
    expect(memoryMailbox.sent).toHaveLength(0);
  });

  it("changes the password, keeping this device signed in and signing out the others", async () => {
    const { agent: here, email } = await registerUser();
    const elsewhere = newAgent();
    await post(elsewhere, "/auth/login", { email, password: PASSWORD }).expect(200);

    await post(here, "/auth/change-password", {
      currentPassword: "Wrong-pass-1",
      newPassword: "Next-pass-99",
    }).expect(401);
    await post(here, "/auth/change-password", {
      currentPassword: PASSWORD,
      newPassword: "Next-pass-99",
    }).expect(200);

    await here.get("/api/v1/users/me").expect(200);
    await elsewhere.get("/api/v1/users/me").expect(401);
  });
});

describe("active sessions", () => {
  it("lists my sessions and signs out another device", async () => {
    const { agent: here, email } = await registerUser();
    const elsewhere = newAgent();
    await post(elsewhere, "/auth/login", { email, password: PASSWORD }).expect(200);

    const list = await here.get("/api/v1/auth/sessions").expect(200);
    expect(list.body.data).toHaveLength(2);
    const other = list.body.data.find((session: { current: boolean }) => !session.current);

    await here
      .delete(`/api/v1/auth/sessions/${other.id}`)
      .set("X-Requested-With", "NexusFlow")
      .expect(200);
    await elsewhere.get("/api/v1/users/me").expect(401);
    await here.get("/api/v1/users/me").expect(200);
  });

  it("cannot see or end another person's session (404)", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const bobSessions = await bob.agent.get("/api/v1/auth/sessions").expect(200);
    const bobSession = bobSessions.body.data[0].id;
    await alice.agent
      .delete(`/api/v1/auth/sessions/${bobSession}`)
      .set("X-Requested-With", "NexusFlow")
      .expect(404);
  });
});

describe("security", () => {
  it("rejects state-changing requests without the anti-forgery header or from another website", async () => {
    const missing = await newAgent().post("/api/v1/auth/login").send({}).expect(403);
    expect(missing.body.error.code).toBe("CSRF_HEADER_MISSING");

    const foreign = await post(newAgent().set("Origin", "https://evil.example"), "/auth/login", {});
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe("CSRF_ORIGIN_MISMATCH");
  });

  it("never sends a password hash in any response", async () => {
    const { agent, email, response } = await registerUser();
    const login = await post(newAgent(), "/auth/login", { email, password: PASSWORD });
    const me = await agent.get("/api/v1/users/me");
    for (const body of [response.body, login.body, me.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain("passwordHash");
      expect(text).not.toContain("$argon2");
    }
  });
});
