---
part: claim/attention-scales
type: paper_claim
title: 注意機構は系列長に対して二次にスケールする
oneline: self-attention の計算量は O(n^2 d)
summary: Transformer の self-attention は系列長 n に対し O(n^2) の計算・メモリを要する。長系列では支配的コストになる。
created_at: 2026-05-17
updated_at: 2026-05-17
summary_updated: 2026-05-17
code_hash: 1dd33f93f852
cites: [ref/vaswani2017]
---
注意行列 QK^T は n×n であり、系列長 n に対して計算量・メモリともに二次。
これが長文脈モデルにおける主要なボトルネックである。
