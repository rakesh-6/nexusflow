import { describe, expect, it } from "vitest";
import { withTimeout } from "./timeout.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withTimeout", () => {
  it("returns the result when the work finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("done"), 1_000)).resolves.toBe("done");
  });

  it("rejects when the work takes too long", async () => {
    await expect(withTimeout(wait(200), 20)).rejects.toThrow("Timed out after 20 ms");
  });

  it("passes the work's own error through", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1_000)).rejects.toThrow("boom");
  });
});
