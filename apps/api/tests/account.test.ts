import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import { createTestClient, TEST_PASSWORD } from "./helpers/http.ts";

// Profile, account deletion and optional features (PRD §11.1.6, §11.1.7).
const client = createTestClient("account-test.example");
const { newAgent, post, patch, del, registerUser } = client;

afterAll(async () => {
  await client.cleanup();
  await prisma.$disconnect();
});

describe("profile", () => {
  it("updates the name and time zone, and GET /users/me shows the change at once", async () => {
    const { agent } = await registerUser();
    const updated = await patch(agent, "/users/me", {
      name: "  Sana Khan  ",
      timezone: "Asia/Kolkata",
    }).expect(200);
    expect(updated.body.data).toMatchObject({ name: "Sana Khan", timezone: "Asia/Kolkata" });

    const me = await agent.get("/api/v1/users/me").expect(200);
    expect(me.body.data.name).toBe("Sana Khan");
  });

  it("rejects an unknown time zone", async () => {
    const { agent } = await registerUser();
    const response = await patch(agent, "/users/me", { timezone: "Mars/Olympus" }).expect(400);
    expect(response.body.error.details[0]).toMatchObject({
      path: "body.timezone",
      message: "Unknown time zone",
    });
  });

  it("needs a signed-in user", async () => {
    await patch(newAgent(), "/users/me", { name: "Nobody" }).expect(401);
  });
});

describe("account deletion (AC-AUTH-08)", () => {
  it("requires confirming the password first", async () => {
    const { agent } = await registerUser();
    const response = await del(agent, "/users/me").expect(403);
    expect(response.body.error.code).toBe("REAUTH_REQUIRED");

    await post(agent, "/auth/reauthenticate", { password: "Wrong-pass-1" }).expect(401);
  });

  it("deletes the account, signs out, and frees the email for a new sign-up", async () => {
    const { agent, email, userId } = await registerUser();
    client.remember(userId);
    await post(agent, "/auth/reauthenticate", { password: TEST_PASSWORD }).expect(200);
    await del(agent, "/users/me").expect(200);

    await agent.get("/api/v1/users/me").expect(401);
    await post(newAgent(), "/auth/login", { email, password: TEST_PASSWORD }).expect(401);

    const scrubbed = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(scrubbed).toMatchObject({ name: "Deleted User", passwordHash: null, avatarUrl: null });
    expect(scrubbed.email).not.toBe(email);
    expect(scrubbed.deletedAt).not.toBeNull();

    const again = await registerUser(email);
    expect(again.response.status).toBe(201);
  });

  it("is blocked while the person owns an organization (SOLE_OWNER)", async () => {
    const { agent, userId } = await registerUser();
    await prisma.organization.create({
      data: { name: "Owned Org", slug: `owned-${userId.slice(0, 8)}`, ownerId: userId },
    });
    await post(agent, "/auth/reauthenticate", { password: TEST_PASSWORD }).expect(200);

    const response = await del(agent, "/users/me").expect(409);
    expect(response.body.error.code).toBe("SOLE_OWNER");
    expect(response.body.error.details).toEqual([
      { name: "Owned Org", slug: `owned-${userId.slice(0, 8)}` },
    ]);
    await agent.get("/api/v1/users/me").expect(200);
  });
});

describe("optional features", () => {
  it("reports which optional features are set up", async () => {
    const response = await newAgent().get("/api/v1/auth/providers").expect(200);
    expect(response.body.data).toEqual({
      google: expect.any(Boolean),
      photoUpload: expect.any(Boolean),
    });
  });

  it("answers clearly when photo upload or Google sign-in is not set up", async () => {
    const { agent } = await registerUser();
    const { body } = await newAgent().get("/api/v1/auth/providers");

    const sign = await post(agent, "/users/me/avatar/sign", {
      mimeType: "image/png",
      sizeBytes: 1000,
    });
    if (body.data.photoUpload) {
      expect(sign.status).toBe(200);
      expect(sign.body.data.fields.signature).toMatch(/^[0-9a-f]{40}$/);
    } else {
      expect(sign.status).toBe(503);
      expect(sign.body.error.code).toBe("STORAGE_NOT_CONFIGURED");
    }

    const google = await newAgent().get("/api/v1/auth/google");
    expect(google.status).toBe(body.data.google ? 302 : 404);
  });

  it("rejects photos that are too big or not images, before any upload", async () => {
    const { agent } = await registerUser();
    const big = await post(agent, "/users/me/avatar/sign", {
      mimeType: "image/png",
      sizeBytes: 6 * 1024 * 1024,
    }).expect(400);
    expect(big.body.error.details[0].path).toBe("body.sizeBytes");
    const pdf = await post(agent, "/users/me/avatar/sign", {
      mimeType: "application/pdf",
      sizeBytes: 1000,
    }).expect(400);
    expect(pdf.body.error.details[0].path).toBe("body.mimeType");
  });

  it("refuses to confirm a photo stored in someone else's folder", async () => {
    const { agent } = await registerUser();
    const { body } = await newAgent().get("/api/v1/auth/providers");
    const response = await post(agent, "/users/me/avatar/confirm", {
      publicId: "nexusflow/development/avatars/someone-else/photo",
    });
    expect(response.status).toBe(body.data.photoUpload ? 400 : 503);
  });
});
