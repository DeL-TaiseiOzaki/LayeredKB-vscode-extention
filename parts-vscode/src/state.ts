import { scanWorkspace, type PartIndex } from "parts-engine";

// 走査結果を 1 箇所に集約し、ツリー/診断/ホバー/コマンドで共有する。
export class PartsState {
  index: PartIndex | null = null;
  constructor(readonly root: string) {}

  async refresh(): Promise<PartIndex> {
    this.index = await scanWorkspace(this.root);
    return this.index;
  }
}
