import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseFrontmatter,
  FrontmatterError,
  parsePart,
  computeBodyHash,
  scanWorkspace,
  RelationGraph,
} from "../src/index.js";

function partDoc(fields: Record<string, string>, body = "本文"): string {
  const fm = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${fm}\n---\n${body}\n`;
}

const BASE = {
  part: "a/one",
  type: "code",
  title: "T",
  oneline: "O",
  summary: "S",
  created_at: "2026-05-17",
  updated_at: "2026-05-17",
  summary_updated: "2026-05-17",
  code_hash: "abc123",
};

describe("frontmatter", () => {
  it("splits yaml and body", () => {
    const r = parseFrontmatter("---\nfoo: bar\n---\nhello\n");
    expect(r.frontmatter).toEqual({ foo: "bar" });
    expect(r.body.trim()).toBe("hello");
  });

  it("returns null frontmatter when no delimiter", () => {
    const r = parseFrontmatter("plain text");
    expect(r.frontmatter).toBeNull();
    expect(r.body).toBe("plain text");
  });

  it("throws on invalid yaml", () => {
    expect(() => parseFrontmatter("---\n: : :\n---\n")).toThrow(FrontmatterError);
  });
});

describe("parsePart", () => {
  it("parses a valid part with relations and shape", () => {
    const doc = partDoc({
      ...BASE,
      deps: "[b/two, c/three]",
      shape: "{ max_lines: 50 }",
    });
    const { part, issues } = parsePart(doc, "a.md");
    expect(issues).toEqual([]);
    expect(part?.meta.part).toBe("a/one");
    expect(part?.relations.deps).toEqual(["b/two", "c/three"]);
    expect(part?.shape.max_lines).toBe(50);
  });

  it("reports missing required fields", () => {
    const { part, issues } = parsePart("---\npart: x\n---\nbody\n", "x.md");
    expect(part).not.toBeNull();
    expect(issues.map((i) => i.field)).toContain("title");
  });

  it("non-part files yield null without issues", () => {
    const { part, issues } = parsePart("just markdown", "r.md");
    expect(part).toBeNull();
    expect(issues).toEqual([]);
  });
});

describe("computeBodyHash", () => {
  it("is stable across trailing whitespace/newlines", () => {
    expect(computeBodyHash("code\n")).toBe(computeBodyHash("  code  "));
  });
  it("differs on content change", () => {
    expect(computeBodyHash("a")).not.toBe(computeBodyHash("b"));
  });
});

describe("scanWorkspace + RelationGraph", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "parts-test-"));
    await writeFile(join(root, "one.md"), partDoc({ ...BASE, part: "p/one", deps: "[p/two]" }));
    await writeFile(
      join(root, "two.md"),
      partDoc({ ...BASE, part: "p/two", deps: "[p/one, p/missing]" }),
    );
    await mkdir(join(root, "node_modules"), { recursive: true });
    await writeFile(join(root, "node_modules", "ignored.md"), partDoc({ ...BASE, part: "x/ignored" }));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("indexes parts and skips ignored dirs", async () => {
    const idx = await scanWorkspace(root);
    expect(idx.byId.has("p/one")).toBe(true);
    expect(idx.byId.has("p/two")).toBe(true);
    expect(idx.byId.has("x/ignored")).toBe(false);
  });

  it("detects dangling references and cycles", async () => {
    const idx = await scanWorkspace(root);
    const g = new RelationGraph(idx);
    expect(g.danglingReferences().map((e) => e.to)).toContain("p/missing");
    const cycle = g.findCycle("deps");
    expect(cycle).not.toBeNull();
    expect(cycle).toContain("p/one");
    expect(cycle).toContain("p/two");
  });
});
