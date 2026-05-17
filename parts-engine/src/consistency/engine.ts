// 整合性エンジン: パーツ索引と関係グラフから不整合を判定する（仕様 §5, §6）．
// 解決方向（fix_reality / fix_definition）はシステムが決めず、検出のみ行う．

import { RelationGraph } from "../core/graph.js";
import type { PartIndex } from "../core/scanner.js";
import type { Part } from "../core/part.js";
import type { CoreTypeName } from "../types/index.js";
import type { GateTier, Inconsistency, InconsistencyKind } from "./index.js";

function inc(
  kind: InconsistencyKind,
  tier: GateTier,
  part: string,
  message: string,
): Inconsistency {
  return { kind, tier, part, message };
}

// 仕様 §4.3 関係の型ペア・ルール（v0.1 既定値）．
// target が索引に在り、かつ型が判明している場合のみ判定する（過検出を避ける）．
const RELATION_TARGET_TYPE: Partial<Record<string, CoreTypeName>> = {
  implements: "paper_claim",
  cites: "reference",
  decided_in: "decision",
};

export interface CheckOptions {
  // shape 未指定時に size 判定を行わない（既定）。型既定値は型層実装後に有効化．
  defaultMaxLines?: number;
}

export function checkConsistency(
  index: PartIndex,
  options: CheckOptions = {},
): Inconsistency[] {
  const graph = new RelationGraph(index);
  const out: Inconsistency[] = [];

  for (const part of index.parts) {
    out.push(...checkPart(part, index, options));
  }

  for (const e of graph.danglingReferences()) {
    out.push(
      inc(
        "dangling_reference",
        "tier1_absolute_block",
        e.from,
        `関係 '${e.relation}' の参照先 '${e.to}' が存在しません`,
      ),
    );
  }

  const cycle = graph.findCycle("deps");
  if (cycle) {
    out.push(
      inc(
        "cyclic_dependency",
        "tier1_absolute_block",
        cycle[0] ?? "",
        `deps に循環依存: ${cycle.join(" -> ")}`,
      ),
    );
  }

  return out;
}

function checkPart(
  part: Part,
  index: PartIndex,
  options: CheckOptions,
): Inconsistency[] {
  const out: Inconsistency[] = [];
  const id = part.meta.part;

  if (part.meta.code_hash && part.meta.code_hash !== part.bodyHash) {
    out.push(
      inc(
        "code_drift",
        "tier3_review_required",
        id,
        `code_hash(${part.meta.code_hash}) と本文ハッシュ(${part.bodyHash}) が不一致`,
      ),
    );
  }

  if (
    part.meta.summary_updated &&
    part.meta.updated_at &&
    part.meta.summary_updated < part.meta.updated_at
  ) {
    out.push(
      inc(
        "summary_drift",
        "tier3_review_required",
        id,
        `summary_updated(${part.meta.summary_updated}) が updated_at(${part.meta.updated_at}) より古い`,
      ),
    );
  }

  const max = part.shape.max_lines ?? options.defaultMaxLines;
  if (typeof max === "number" && part.lineCount > max) {
    out.push(
      inc(
        "size_violation",
        "tier2_decision_block",
        id,
        `本文 ${part.lineCount} 行が上限 ${max} 行を超過`,
      ),
    );
  }

  for (const [relation, expected] of Object.entries(RELATION_TARGET_TYPE)) {
    for (const targetId of part.relations[relation as keyof Part["relations"]] ?? []) {
      const target = index.byId.get(targetId);
      if (target && target.meta.type && target.meta.type !== expected) {
        out.push(
          inc(
            "relation_type_violation",
            "tier2_decision_block",
            id,
            `関係 '${relation}' の対象 '${targetId}' は type='${expected}' を期待（実際: '${target.meta.type}'）`,
          ),
        );
      }
    }
  }

  return out;
}
