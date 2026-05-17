---
part: code/broken-example
type: code
title: 整合性違反のデモ用パーツ
oneline: わざと違反を含むサンプル
summary: parts check / Problems 表示の動作確認用。dangling 参照と summary_drift を含む。
created_at: 2026-05-01
updated_at: 2026-05-17
summary_updated: 2026-05-01
code_hash: deadbeef
deps: [code/does-not-exist]
cites: [code/scaled-dot-attention]
shape: { max_lines: 2 }
---
この行と
この行で
3 行ありshape.max_lines=2 を超過する（size_violation）。
deps の code/does-not-exist は dangling_reference。
cites は reference を期待するが code を指す（relation_type_violation）。
summary_updated < updated_at なので summary_drift。
code_hash も本文と不一致で code_drift。
