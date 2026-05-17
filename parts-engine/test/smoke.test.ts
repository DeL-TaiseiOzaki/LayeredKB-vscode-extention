import { describe, it, expect } from "vitest";
import { VERSION } from "../src/core/index.js";
import type { PartFrontmatterCommon } from "../src/index.js";

describe("parts-engine skeleton", () => {
  it("exposes the v0.1 version", () => {
    expect(VERSION).toBe("0.1.0");
  });

  it("common frontmatter type is shaped per spec §3.1", () => {
    const part: PartFrontmatterCommon = {
      part: "auth/login",
      type: "code",
      title: "Login handler",
      oneline: "メール/パスワード認証とJWT発行を担当",
      summary: "POST /login を受けて認証しJWTを返す。",
      created_at: "2026-05-17",
      updated_at: "2026-05-17",
      summary_updated: "2026-05-17",
      code_hash: "a3f2c1",
    };
    expect(part.part).toBe("auth/login");
  });
});
