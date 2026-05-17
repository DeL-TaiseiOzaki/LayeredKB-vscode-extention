import { describe, it, expect } from "vitest";
import { parsePart, serializePart, splitPart, mergeParts, SPLIT_MARKER } from "../src/index.js";

const META = {
  part: "a/one",
  type: "code",
  title: "One",
  oneline: "O",
  summary: "S",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  summary_updated: "2026-01-01",
  code_hash: "x",
};

function part(body: string, over: Partial<typeof META> = {}, relations = {}) {
  const { part: p } = parsePart(serializePart({ ...META, ...over }, relations, {}, body), "f.md");
  return p!;
}

describe("serializePart", () => {
  it("round-trips through parsePart", () => {
    const doc = serializePart(META, { deps: ["b/two"] }, { max_lines: 30 }, "hello body");
    const { part: p, issues } = parsePart(doc, "f.md");
    expect(issues).toEqual([]);
    expect(p?.meta.part).toBe("a/one");
    expect(p?.relations.deps).toEqual(["b/two"]);
    expect(p?.shape.max_lines).toBe(30);
    expect(p?.body.trim()).toBe("hello body");
  });

  it("recomputes code_hash to match body", () => {
    const doc = serializePart(META, {}, {}, "body text");
    const { part: p } = parsePart(doc, "f.md");
    expect(p?.meta.code_hash).toBe(p?.bodyHash);
  });
});

describe("splitPart", () => {
  it("splits at marker and links via deps", () => {
    const p = part(`head part\n${SPLIT_MARKER}\ntail part`);
    const { original, extracted } = splitPart(p, {
      newId: "a/two",
      newTitle: "Two",
      today: "2026-05-17",
    });
    const o = parsePart(original, "o.md").part!;
    const e = parsePart(extracted, "e.md").part!;
    expect(o.body).toContain("head part");
    expect(o.body).not.toContain("tail part");
    expect(o.relations.deps).toContain("a/two");
    expect(e.meta.part).toBe("a/two");
    expect(e.body).toContain("tail part");
  });

  it("throws when no marker", () => {
    expect(() =>
      splitPart(part("no marker here"), { newId: "x", newTitle: "X", today: "d" }),
    ).toThrow(/分割マーカー/);
  });
});

describe("mergeParts", () => {
  it("merges bodies, unions relations, drops internal refs, sets supersedes", () => {
    const a = part("body A", { part: "m/a" }, { deps: ["m/b", "ext/x"] });
    const b = part("body B", { part: "m/b" }, { deps: ["ext/y"] });
    const doc = mergeParts([a, b], { newId: "m/all", newTitle: "All", today: "2026-05-17" });
    const m = parsePart(doc, "m.md").part!;
    expect(m.meta.part).toBe("m/all");
    expect(m.body).toContain("body A");
    expect(m.body).toContain("body B");
    expect(m.relations.deps?.sort()).toEqual(["ext/x", "ext/y"]);
    expect(m.relations.supersedes?.sort()).toEqual(["m/a", "m/b"]);
  });

  it("requires at least two parts", () => {
    expect(() => mergeParts([part("x")], { newId: "n", newTitle: "N", today: "d" })).toThrow();
  });
});
