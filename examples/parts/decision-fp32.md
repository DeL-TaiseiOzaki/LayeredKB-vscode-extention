---
part: decision/use-fp32-softmax
type: decision
title: softmax は fp32 で計算する
oneline: 数値安定性のため softmax を fp32 に昇格
summary: fp16 では長系列で softmax がオーバーフロー/精度劣化するため、softmax 計算のみ fp32 に昇格する決定。
created_at: 2026-05-17
updated_at: 2026-05-17
summary_updated: 2026-05-17
code_hash: 2a9bd89a59c8
decides: [code/scaled-dot-attention]
---
背景: fp16 推論で長系列時に NaN が発生。
決定: softmax の入力を fp32 にキャストして計算し、出力を元 dtype に戻す。
