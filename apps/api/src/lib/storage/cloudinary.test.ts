import { describe, expect, it } from "vitest";
import { signParams } from "./cloudinary.ts";

describe("Cloudinary signature", () => {
  it("matches the worked example in Cloudinary's documentation", () => {
    const params = {
      timestamp: 1315060510,
      public_id: "sample_image",
      eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
    };
    expect(signParams(params, "abcd")).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("does not depend on the order the parameters were written in", () => {
    expect(signParams({ b: 2, a: 1 }, "secret")).toBe(signParams({ a: 1, b: 2 }, "secret"));
  });
});
