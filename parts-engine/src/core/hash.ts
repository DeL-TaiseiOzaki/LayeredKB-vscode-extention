// コア層: パーツ本文のハッシュ計算（仕様 §3.1 code_hash / §5.1 code_drift 検出用）．

import { createHash } from "node:crypto";

// 本文の前後空白を正規化したうえで SHA-256 先頭12桁を返す．
// 末尾改行や軽微な空白差ではドリフト誤検出しないようにする．
export function computeBodyHash(body: string): string {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 12);
}
