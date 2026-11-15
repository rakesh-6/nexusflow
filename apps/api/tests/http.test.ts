import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { errorHandler } from "../src/middleware/errorHandler.ts";
import { createLimiter } from "../src/middleware/rateLimit.ts";
import { requestLogger } from "../src/middleware/requestLogger.ts";

// Real HTTP requests against the real app, without starting a server.
const app = createApp();

describe("health checks", () => {
  it("GET /api/v1/health says the server is running", async () => {
    const response = await request(app).get("/api/v1/health").expect(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: "ok", app: "NexusFlow" },
    });
  });

  it("GET /api/v1/health/ready reaches the test database", async () => {
    const response = await request(app).get("/api/v1/health/ready").expect(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: "ready", database: "ok" },
    });
  });
});

describe("error responses", () => {
  it("an unknown API route gets the standard 404 error with a request id", async () => {
    const response = await request(app).get("/api/v1/does-not-exist").expect(404);
    expect(response.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("broken JSON gets 400 VALIDATION_ERROR", async () => {
    const response = await request(app)
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("a body over 1 MB gets 413 PAYLOAD_TOO_LARGE", async () => {
    const response = await request(app)
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ text: "x".repeat(1_100_000) }))
      .expect(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("never sends a stack trace for errors raised on purpose", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");
    expect(response.body.error.stack).toBeUndefined();
  });
});

describe("security headers and request ids", () => {
  it("sends helmet's protective headers and hides the Express banner", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("keeps a safe request id sent by the caller and replaces an unsafe one", async () => {
    const safe = await request(app).get("/api/v1/health").set("X-Request-Id", "trace-123");
    expect(safe.headers["x-request-id"]).toBe("trace-123");

    const unsafe = await request(app).get("/api/v1/health").set("X-Request-Id", "<script>");
    expect(unsafe.headers["x-request-id"]).not.toBe("<script>");
  });
});

describe("rate limiting", () => {
  // A tiny app with a limit of 2 per minute, so the test does not need 300 requests.
  function appWithLimit() {
    const small = express();
    small.use(requestLogger);
    small.use(createLimiter({ name: "test", perMinute: 2, skip: (req) => req.path === "/free" }));
    small.get("/limited", (_req, res) => res.json({ ok: true }));
    small.get("/free", (_req, res) => res.json({ ok: true }));
    small.use(errorHandler);
    return small;
  }

  it("answers 429 RATE_LIMITED with Retry-After once the limit is used up", async () => {
    const small = appWithLimit();
    await request(small).get("/limited").expect(200);
    await request(small).get("/limited").expect(200);
    const blocked = await request(small).get("/limited").expect(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("never counts skipped paths (like health checks)", async () => {
    const small = appWithLimit();
    for (let i = 0; i < 5; i++) await request(small).get("/free").expect(200);
  });
});
