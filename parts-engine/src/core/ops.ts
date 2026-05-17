// コア層: パーツの分割・結合の純粋変換（仕様 §13）。ファイル IO は持たない（UI/CLI 層の責務）。

import { stringify as stringifyYaml } from "yaml";
import { RELATION_FIELDS, type PartId } from "./index.js";
import type { Part } from "./part.js";
import { computeBodyHash } from "./hash.js";

export const SPLIT_MARKER = "---SPLIT---";

function buildFrontmatter(
  meta: Record<string, unknown>,
  relations: Record<string, PartId[]>,
  shape: Record<string, unknown>,
): Record<string, unknown> {
  const fm: Record<string, unknown> = { ...meta };
  for (const f of RELATION_FIELDS) {
    const v = relations[f];
    if (v && v.length > 0) fm[f] = v;
  }
  if (Object.keys(shape).length > 0) fm["shape"] = shape;
  return fm;
}

// パーツを Markdown 文字列へ直列化する。code_hash は本文から再計算する。
export function serializePart(
  meta: Part["meta"],
  relations: Part["relations"],
  shape: Part["shape"],
  body: string,
): string {
  const normBody = body.replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "") + "\n";
  const fm = buildFrontmatter(
    { ...meta, code_hash: computeBodyHash(normBody) },
    relations as Record<string, PartId[]>,
    shape as Record<string, unknown>,
  );
  return `---\n${stringifyYaml(fm).trimEnd()}\n---\n${normBody}`;
}

export interface SplitResult {
  original: string; // 更新後の元パーツ（前半 + 新パーツへの deps）
  extracted: string; // 新規パーツ（後半）
}

// SPLIT_MARKER を境に本文を 2 分割する。元パーツは前半を保持し新パーツへ deps を張る。
export function splitPart(
  part: Part,
  opts: { newId: PartId; newTitle: string; today: string },
): SplitResult {
  const idx = part.body.indexOf(SPLIT_MARKER);
  if (idx === -1) {
    throw new Error(`本文に分割マーカー '${SPLIT_MARKER}' がありません`);
  }
  const head = part.body.slice(0, idx);
  const tail = part.body.slice(idx + SPLIT_MARKER.length);

  const extractedMeta: Part["meta"] = {
    ...part.meta,
    part: opts.newId,
    title: opts.newTitle,
    created_at: opts.today,
    updated_at: opts.today,
    summary_updated: opts.today,
  };
  const extracted = serializePart(extractedMeta, {}, part.shape, tail);

  const originalRelations: Part["relations"] = {
    ...part.relations,
    deps: [...(part.relations.deps ?? []), opts.newId],
  };
  const originalMeta: Part["meta"] = {
    ...part.meta,
    updated_at: opts.today,
    summary_updated: opts.today,
  };
  const original = serializePart(originalMeta, originalRelations, part.shape, head);
  return { original, extracted };
}

// 複数パーツを 1 つへ結合する（加算的: 元パーツは削除せず supersedes で連結）。
export function mergeParts(
  parts: Part[],
  opts: { newId: PartId; newTitle: string; today: string },
): string {
  if (parts.length < 2) {
    throw new Error("結合には 2 つ以上のパーツが必要です");
  }
  const sourceIds = new Set(parts.map((p) => p.meta.part));
  const merged: Record<string, Set<PartId>> = {};
  for (const f of RELATION_FIELDS) merged[f] = new Set();
  for (const p of parts) {
    for (const f of RELATION_FIELDS) {
      for (const t of p.relations[f] ?? []) {
        if (!sourceIds.has(t)) merged[f]!.add(t);
      }
    }
  }
  const relations: Record<string, PartId[]> = {};
  for (const f of RELATION_FIELDS) {
    if (merged[f]!.size > 0) relations[f] = [...merged[f]!];
  }
  relations["supersedes"] = parts.map((p) => p.meta.part);

  const body = parts
    .map((p) => `## ${p.meta.title} (${p.meta.part})\n\n${p.body.trim()}`)
    .join("\n\n");

  const first = parts[0]!;
  const meta: Part["meta"] = {
    ...first.meta,
    part: opts.newId,
    title: opts.newTitle,
    oneline: `${parts.length} 個のパーツを結合`,
    created_at: opts.today,
    updated_at: opts.today,
    summary_updated: opts.today,
  };
  return serializePart(meta, relations as Part["relations"], {}, body);
}
