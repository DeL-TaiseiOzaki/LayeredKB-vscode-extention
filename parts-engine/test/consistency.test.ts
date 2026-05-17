import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanWorkspace, checkConsistency, computeBodyHash } from "../src/index.js";

const BODY = "実装本文\nもう一行\n";
const GOOD_HASH = computeBodyHash(BODY);

function doc(fields: Record<string, string>, body = BODY): string {
  const fm = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${fm}\n---\n${body}`;
}

function base(over: Record<string, string>): Record<string, string> {
  return {
    type: "code",
    title: "T",
    oneline: "O",
    summary: "S",
    created_at: "2026-05-01",
    updated_at: "2026-05-01",
    summary_updated: "2026-05-01",
    code_hash: GOOD_HASH,
    ...over,
  };
}

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "parts-consistency-"));
  // 正常パーツ
  await writeFile(join(root, "ok.md"), doc(base({ part: "ok/clean" })));
  // code_drift: ハッシュ不一致
  await writeFile(join(root, "drift.md"), doc(base({ part: "x/drift", code_hash: "deadbeef" })));
  // summary_drift: summary_updated < updated_at
  await writeFile(
    join(root, "sdrift.md"),
    doc(base({ part: "x/sdrift", updated_at: "2026-05-10", summary_updated: "2026-05-01" })),
  );
  // size_violation: max_lines 1 を超過（本文2行）
  await writeFile(
    join(root, "big.md"),
    doc(base({ part: "x/big", shape: "{ max_lines: 1 }" })),
  );
  // dangling + cycle
  await writeFile(
    join(root, "a.md"),
    doc(base({ part: "g/a", deps: "[g/b, g/missing]" })),
  );
  await writeFile(join(root, "b.md"), doc(base({ part: "g/b", deps: "[g/a]" })));
  // relation_type_violation: cites は reference を期待だが code を指す
  await writeFile(
    join(root, "cite.md"),
    doc(base({ part: "x/cite", cites: "[ok/clean]" })),
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("checkConsistency", () => {
  it("detects each violation kind with expected tier", async () => {
    const idx = await scanWorkspace(root);
    const v = checkConsistency(idx);
    const kinds = new Set(v.map((i) => i.kind));

    expect(kinds.has("code_drift")).toBe(true);
    expect(kinds.has("summary_drift")).toBe(true);
    expect(kinds.has("size_violation")).toBe(true);
    expect(kinds.has("dangling_reference")).toBe(true);
    expect(kinds.has("cyclic_dependency")).toBe(true);
    expect(kinds.has("relation_type_violation")).toBe(true);

    const dangling = v.find((i) => i.kind === "dangling_reference");
    expect(dangling?.tier).toBe("tier1_absolute_block");
    const cycle = v.find((i) => i.kind === "cyclic_dependency");
    expect(cycle?.tier).toBe("tier1_absolute_block");
    const size = v.find((i) => i.kind === "size_violation");
    expect(size?.tier).toBe("tier2_decision_block");
    const drift = v.find((i) => i.kind === "code_drift");
    expect(drift?.tier).toBe("tier3_review_required");
  });

  it("clean part produces no inconsistency for itself", async () => {
    const idx = await scanWorkspace(root);
    const v = checkConsistency(idx);
    expect(v.some((i) => i.part === "ok/clean")).toBe(false);
  });
});
