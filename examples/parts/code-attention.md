---
part: code/scaled-dot-attention
type: code
title: Scaled Dot-Product Attention
oneline: softmax(QK^T/sqrt(d))V を計算する
summary: claim/attention-scales を実装する素朴な attention。二次コストをコード上でも確認できる。
created_at: 2026-05-17
updated_at: 2026-05-17
summary_updated: 2026-05-17
code_hash: d2757df48958
implements: [claim/attention-scales]
decided_in: [decision/use-fp32-softmax]
shape: { max_lines: 40 }
---
def attention(q, k, v):
    scores = (q @ k.transpose(-2, -1)) / (q.size(-1) ** 0.5)
    weights = softmax(scores, dim=-1)
    return weights @ v

---SPLIT---

def softmax(x, dim):
    x = x - x.max(dim=dim, keepdim=True).values
    e = x.exp()
    return e / e.sum(dim=dim, keepdim=True)
