// コア層: パーツ関係グラフ（有向）．巡回検出・近傍取得・dangling 参照抽出（仕様 §3.2, §5.1）．

import { RELATION_FIELDS, type PartId, type PartRelations } from "./index.js";
import type { PartIndex } from "./scanner.js";

export interface RelationEdge {
  from: PartId;
  to: PartId;
  relation: keyof PartRelations;
}

export class RelationGraph {
  private readonly edges: RelationEdge[] = [];

  constructor(private readonly index: PartIndex) {
    for (const part of index.parts) {
      const from = part.meta.part;
      if (!from) continue;
      for (const relation of RELATION_FIELDS) {
        for (const to of part.relations[relation] ?? []) {
          this.edges.push({ from, to, relation });
        }
      }
    }
  }

  allEdges(): readonly RelationEdge[] {
    return this.edges;
  }

  // どのパーツにも解決できない参照（dangling）を返す．
  danglingReferences(): RelationEdge[] {
    return this.edges.filter((e) => !this.index.byId.has(e.to));
  }

  // 指定リレーション種だけの隣接リストを構築する．
  private adjacency(relation: keyof PartRelations): Map<PartId, PartId[]> {
    const adj = new Map<PartId, PartId[]>();
    for (const e of this.edges) {
      if (e.relation !== relation) continue;
      let list = adj.get(e.from);
      if (!list) {
        list = [];
        adj.set(e.from, list);
      }
      list.push(e.to);
    }
    return adj;
  }

  // 指定リレーション種で巡回を検出し、最初に見つかった閉路（ノード列）を返す．
  // 既存パーツ間のエッジのみ対象（dangling は別途検出）．
  findCycle(relation: keyof PartRelations = "deps"): PartId[] | null {
    const adj = this.adjacency(relation);
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<PartId, number>();
    const stack: PartId[] = [];

    const visit = (node: PartId): PartId[] | null => {
      color.set(node, GRAY);
      stack.push(node);
      for (const next of adj.get(node) ?? []) {
        if (!this.index.byId.has(next)) continue;
        const c = color.get(next) ?? WHITE;
        if (c === GRAY) {
          const start = stack.indexOf(next);
          return [...stack.slice(start), next];
        }
        if (c === WHITE) {
          const found = visit(next);
          if (found) return found;
        }
      }
      stack.pop();
      color.set(node, BLACK);
      return null;
    };

    for (const id of this.index.byId.keys()) {
      if ((color.get(id) ?? WHITE) === WHITE) {
        const cycle = visit(id);
        if (cycle) return cycle;
      }
    }
    return null;
  }

  outgoing(id: PartId): RelationEdge[] {
    return this.edges.filter((e) => e.from === id);
  }

  incoming(id: PartId): RelationEdge[] {
    return this.edges.filter((e) => e.to === id);
  }
}
