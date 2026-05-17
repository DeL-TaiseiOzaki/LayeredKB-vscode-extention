// コア層: パーツの実体モデルと Markdown からの構築（仕様 §3）．ドメイン非依存．

import {
  RELATION_FIELDS,
  type PartFrontmatterCommon,
  type PartId,
  type PartRelations,
  type PartShape,
} from "./index.js";
import { parseFrontmatter } from "./frontmatter.js";
import { computeBodyHash } from "./hash.js";

export interface Part {
  meta: PartFrontmatterCommon;
  relations: PartRelations;
  shape: PartShape;
  body: string;
  // 現在の本文から計算したハッシュ（meta.code_hash と比較して code_drift を検出）．
  bodyHash: string;
  // パーツの本文行数（size_violation 判定用）．
  lineCount: number;
  filePath: string;
}

export interface PartParseIssue {
  filePath: string;
  field?: string;
  message: string;
}

export interface PartParseResult {
  part: Part | null;
  issues: PartParseIssue[];
}

const REQUIRED_STRING_FIELDS: readonly (keyof PartFrontmatterCommon)[] = [
  "part",
  "type",
  "title",
  "oneline",
  "summary",
  "created_at",
  "updated_at",
  "summary_updated",
  "code_hash",
];

function asStringArray(value: unknown): PartId[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

function extractRelations(fm: Record<string, unknown>): PartRelations {
  const relations: PartRelations = {};
  for (const field of RELATION_FIELDS) {
    const arr = asStringArray(fm[field]);
    if (arr && arr.length > 0) relations[field] = arr;
  }
  return relations;
}

function extractShape(fm: Record<string, unknown>): PartShape {
  const shape: PartShape = {};
  const raw = fm["shape"];
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : fm;
  if (typeof src["target_lines"] === "number") shape.target_lines = src["target_lines"];
  if (typeof src["max_lines"] === "number") shape.max_lines = src["max_lines"];
  const sk = asStringArray(src["scope_keywords"]);
  if (sk) shape.scope_keywords = sk;
  const dep = asStringArray(src["allowed_external_deps"]);
  if (dep) shape.allowed_external_deps = dep;
  return shape;
}

// Markdown 文字列を Part に変換する．構造的な不備は issues として返す（例外にしない）．
// フロントマターが無いファイルは part:null（パーツではない）として扱う．
export function parsePart(source: string, filePath: string): PartParseResult {
  const issues: PartParseIssue[] = [];
  const { frontmatter, body } = parseFrontmatter(source);
  if (frontmatter === null) {
    return { part: null, issues };
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const v = frontmatter[field];
    if (typeof v !== "string" || v.trim() === "") {
      issues.push({
        filePath,
        field,
        message: `必須フィールド '${field}' が無い、または文字列ではありません`,
      });
    }
  }

  const tags = asStringArray(frontmatter["tags"]);
  const meta: PartFrontmatterCommon = {
    part: String(frontmatter["part"] ?? ""),
    type: String(frontmatter["type"] ?? ""),
    title: String(frontmatter["title"] ?? ""),
    oneline: String(frontmatter["oneline"] ?? ""),
    summary: String(frontmatter["summary"] ?? ""),
    created_at: String(frontmatter["created_at"] ?? ""),
    updated_at: String(frontmatter["updated_at"] ?? ""),
    summary_updated: String(frontmatter["summary_updated"] ?? ""),
    code_hash: String(frontmatter["code_hash"] ?? ""),
    ...(tags ? { tags } : {}),
    ...(typeof frontmatter["version"] === "string"
      ? { version: frontmatter["version"] }
      : {}),
  };

  const trimmedBody = body.replace(/^\s*\n/, "");
  const part: Part = {
    meta,
    relations: extractRelations(frontmatter),
    shape: extractShape(frontmatter),
    body,
    bodyHash: computeBodyHash(body),
    lineCount: trimmedBody === "" ? 0 : trimmedBody.trimEnd().split("\n").length,
    filePath,
  };
  return { part, issues };
}
