"""Runs the simulated benchmark: retrieval systems, metrics, multi-seed stats."""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import statistics
import time
from collections import defaultdict

import numpy as np

from evalsim import make_corpus, make_queries

RRF_K = 60                 # src/store.ts
SUPERSEDE_THRESHOLD = 0.8  # src/store.ts
SAL_FLOOR = 2.0            # src/store.ts: (salience ?? 2) / 4
SAL_SPAN = 4.0
SYSTEMS = ["recency", "bm25", "dense", "dense+ce", "rrf", "rrf+ce", "rrf-w", "rrf-w+ce"]

# Reciprocal rank fusion is score-blind: a channel contributes 1/(K+rank) no matter
# how weak its scores are. Equal weights therefore let a weak lexical channel
# dilute a strong dense one. LEX_W is the down-weighted variant that tests whether
# that is what actually costs accuracy here.
LEX_W = 0.3


def clamp01(x):
    return 0.0 if x < 0 else (1.0 if x > 1 else x)


def _sigmoid(x):
    if x < -30:
        return 0.0
    if x > 30:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


# ---------------------------------------------------------------- stemmer
try:
    from nltk.stem.porter import PorterStemmer as _PS
    _stemmer = _PS()

    def stem(w):
        return _stemmer.stem(w)
except Exception:                                     # pragma: no cover
    _SUF = ("ational", "tional", "ization", "iveness", "fulness", "ousness",
            "ing", "edly", "ies", "ied", "ed", "es", "s", "ly")

    def stem(w):
        for s in _SUF:
            if w.endswith(s) and len(w) - len(s) >= 3:
                return w[: -len(s)]
        return w


TOKRE = re.compile(r"[a-z0-9]+")


def tokenize(text):
    """Lowercase alphanumeric tokens, Porter-stemmed -- FTS5 porter unicode61."""
    return [stem(t) for t in TOKRE.findall(text.lower()) if len(t) > 1]


def _counts(tokens):
    c = {}
    for t in tokens:
        c[t] = c.get(t, 0) + 1
    return c


# ---------------------------------------------------------------- BM25
class BM25:
    """Okapi BM25, matching the FTS5 bm25() the deployed index ranks on."""

    def __init__(self, docs, k1=1.2, b=0.75):
        self.k1, self.b = k1, b
        self.docs = [tokenize(d) for d in docs]
        self.N = len(self.docs)
        self.avgdl = sum(len(d) for d in self.docs) / max(1, self.N)
        self.post = defaultdict(list)
        self.len = [len(d) for d in self.docs]
        for i, d in enumerate(self.docs):
            for term, tf in _counts(d).items():
                self.post[term].append((i, tf))
        self.idf = {t: math.log(1 + (self.N - len(p) + 0.5) / (len(p) + 0.5))
                    for t, p in self.post.items()}

    def query(self, text, limit):
        scores = defaultdict(float)
        for t in tokenize(text):
            p = self.post.get(t)
            if not p:
                continue
            idf = self.idf[t]
            for i, tf in p:
                denom = tf + self.k1 * (1 - self.b + self.b * self.len[i] / self.avgdl)
                scores[i] += idf * tf * (self.k1 + 1) / denom
        # SQLite's bm25() is negative and ordered ascending; the store keeps the
        # resulting rank position, which is all RRF consumes.
        return sorted(scores.items(), key=lambda kv: -kv[1])[:limit]


# ---------------------------------------------------------------- metrics
def mrr(ranked, gold, k=10):
    g = set(gold)
    for i, mid in enumerate(ranked[:k]):
        if mid in g:
            return 1.0 / (i + 1)
    return 0.0


def recall_at(ranked, gold, k):
    g = set(gold)
    return len(g & set(ranked[:k])) / max(1, len(g))


def ndcg(ranked, gold, k=10):
    g = set(gold)
    dcg = sum(1.0 / math.log2(i + 2) for i, m in enumerate(ranked[:k]) if m in g)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(min(len(g), k)))
    return dcg / idcg if idcg else 0.0


# ---------------------------------------------------------------- retrieval
def fuse(vec_ranks, kw_ranks, shortlist_n, w_vec=1.0, w_kw=1.0):
    """Reciprocal rank fusion with RRF_K = 60, as in src/store.ts.

    The weights are not in the deployed code (both channels are weighted 1.0);
    they exist here to separate "fusion hurts" from "fusion over-weights the
    weaker channel".
    """
    fused = defaultdict(float)
    for ranks, w in ((vec_ranks, w_vec), (kw_ranks, w_kw)):
        if w == 0.0:
            continue
        for rank, idx in enumerate(ranks):
            fused[idx] += w / (RRF_K + rank)
    ordered = sorted(fused.items(), key=lambda kv: -kv[1])[:shortlist_n]
    maxf = max(fused.values(), default=1.0) or 1.0
    return [i for i, _ in ordered], {i: v / maxf for i, v in fused.items()}


def final_score(fused_norm, sal, noul):
    """src/store.ts lines 384-387, transcribed exactly."""
    S = clamp01((sal if sal is not None else SAL_FLOOR) / SAL_SPAN)
    if noul is None:
        return 0.85 * fused_norm + 0.15 * S
    return 0.50 * fused_norm + 0.40 * noul + 0.10 * S


def run_seed(seed, args, enc, ce):
    rng = random.Random(seed)
    mems, contradictions, evolving = make_corpus(args.n_mem, rng)
    queries = make_queries(mems, evolving, args.n_q, rng)
    active = [m for m in mems if m["status"] == "active"]

    mids = [m["id"] for m in mems]
    sal = [m["salience"] for m in mems]
    act_idx = [i for i, m in enumerate(mems) if m["status"] == "active"]
    act_idx = np.array(act_idx)
    sal_a = [sal[i] for i in act_idx.tolist()]
    sess_a = [mems[i]["session"] for i in act_idx.tolist()]
    active_texts = [m["text"] for m in active]
    mid_of = [mids[i] for i in act_idx.tolist()]

    M = enc.encode([m["text"] for m in mems], batch_size=64,
                   normalize_embeddings=True, show_progress_bar=False).astype(np.float32)
    Q = enc.encode([q["text"] for q in queries], batch_size=64,
                   normalize_embeddings=True, show_progress_bar=False).astype(np.float32)
    Ma = M[act_idx]

    bm = BM25(active_texts)
    per = {s: defaultdict(list) for s in SYSTEMS}
    ce_calls = 0
    ce_lat = []

    for qi, q in enumerate(queries):
        gold = set(q["gold"])
        cls = q["cls"]
        shortlist_n = max(args.topk * 2, args.cand)
        cand_limit = max(shortlist_n * 3, 40)

        rec = sorted(range(len(active)), key=lambda i: (sess_a[i], i), reverse=True)
        kw_ranks = [i for i, _ in bm.query(q["text"], cand_limit)]
        vec_ranks = [int(j) for j in np.argsort(-(Ma @ Q[qi]))[:cand_limit]]

        short, fnorm = fuse(vec_ranks, kw_ranks, shortlist_n)             # as deployed
        short_w, fnorm_w = fuse(vec_ranks, kw_ranks, shortlist_n, 1.0, LEX_W)
        short_d, fnorm_d = fuse(vec_ranks, [], shortlist_n, 1.0, 0.0)    # dense only

        # JEV's `noul` is a bounded [0,1] judgement and the deployed blend
        # assumes that contract (0.40 * noul). A cross-encoder emits unbounded
        # relevance logits, so squash with a logistic into the same slot.
        # Score the union of the three shortlists once and slice it back, so
        # isolating rerank does not triple the model calls.
        need = list(dict.fromkeys(short + short_w + short_d))
        t1 = time.time()
        ce_logits = ce.predict([(q["text"], active_texts[i]) for i in need])
        ce_calls += len(need)
        ce_lat.append(time.time() - t1)
        ce_all = dict(zip(need, [_sigmoid(float(s)) for s in ce_logits]))
        ce_noul = {i: ce_all[i] for i in short}
        ce_noul_w = {i: ce_all[i] for i in short_w}
        ce_noul_d = {i: ce_all[i] for i in short_d}

        def finish(order_idx, fused_norm, noul_by_idx=None):
            scored = [(final_score(fused_norm.get(i, 0.0), sal_a[i],
                                   None if noul_by_idx is None else noul_by_idx.get(i, 0.0)), i)
                      for i in order_idx]
            scored.sort(key=lambda kv: -kv[0])
            return [mid_of[i] for _, i in scored[:args.topk]]

        results = {
            "recency": [mid_of[i] for i in rec[:args.topk]],
            "bm25": [mid_of[i] for i in kw_ranks[:args.topk]],
            "dense": [mid_of[i] for i in vec_ranks[:args.topk]],
            "dense+ce": finish(short_d, fnorm_d, ce_noul_d),
            "rrf": finish(short, fnorm),
            "rrf+ce": finish(short, fnorm, ce_noul),
            "rrf-w": finish(short_w, fnorm_w),
            "rrf-w+ce": finish(short_w, fnorm_w, ce_noul_w),
        }

        stale = set(q["stale"])
        for s in SYSTEMS:
            r = results[s]
            per[s][cls].append(dict(
                r5=recall_at(r, gold, 5), r10=recall_at(r, gold, 10),
                mrr=mrr(r, gold, 10), ndcg=ndcg(r, gold, 10),
                hit=1.0 if r and r[0] in gold else 0.0,
                stale=1.0 if (stale and r and r[0] in stale) else 0.0,
            ))

    classes = sorted(per["rrf"].keys())

    def agg(rows, k):
        return round(sum(x[k] for x in rows) / max(1, len(rows)), 4)

    rep = {"seed": seed, "n_memories": len(mems), "n_active": len(active),
           "n_queries": len(queries), "classes": classes,
           "counts": {c: len(per["rrf"][c]) for c in classes},
           "ce_calls": ce_calls,
           "ce_ms_per_query": round(1000 * sum(ce_lat) / max(1, len(ce_lat)), 1),
           "systems": {}}
    for s in SYSTEMS:
        allr = [r for c in classes for r in per[s][c]]
        rep["systems"][s] = {
            "overall": {k: agg(allr, k) for k in ("r5", "r10", "mrr", "ndcg", "hit", "stale")},
            "by_class": {c: {k: agg(per[s][c], k) for k in ("r5", "r10", "mrr", "ndcg")}
                         for c in classes},
        }
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="D:/dgui-cli/whitepaper/figures")
    ap.add_argument("--n-mem", type=int, default=900)
    ap.add_argument("--n-q", type=int, default=150)
    ap.add_argument("--seeds", default="11,12,13")
    ap.add_argument("--cand", type=int, default=20)
    ap.add_argument("--topk", type=int, default=10)
    args = ap.parse_args()
    seeds = [int(s) for s in args.seeds.split(",") if s.strip()]

    from sentence_transformers import SentenceTransformer, CrossEncoder
    t0 = time.time()
    print("loading BAAI/bge-base-en-v1.5 (768d, production embedding model) ...")
    enc = SentenceTransformer("BAAI/bge-base-en-v1.5")
    print("loading cross-encoder/ms-marco-MiniLM-L-6-v2 (stand-in for the JEV rerank) ...")
    ce = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=256)
    print("models ready in %.1fs\n" % (time.time() - t0))

    reps = []
    for sd in seeds:
        t1 = time.time()
        r = run_seed(sd, args, enc, ce)
        reps.append(r)
        o = r["systems"]["rrf+ce"]["overall"]
        print("seed %-3d  %d memories (%d active)  %d queries  %s  "
              "RRF+CE nDCG %.3f  R@10 %.3f  [%.0fs]"
              % (sd, r["n_memories"], r["n_active"], r["n_queries"],
                 r["counts"], o["ndcg"], o["r10"], time.time() - t1))

    classes = reps[0]["classes"]

    def ms(path):
        """mean and population sd across seeds for a nested metric path"""
        vals = []
        for r in reps:
            cur = r["systems"]
            for k in path[:-1]:
                cur = cur[k]
            vals.append(cur[path[-1]])
        return round(statistics.mean(vals), 4), round(statistics.pstdev(vals), 4)

    print("\n%-9s %15s %15s %15s %15s %15s" % ("system", "R@5", "R@10", "MRR@10", "nDCG@10", "P@1"))
    print("-" * 84)
    table = {}
    for s in SYSTEMS:
        cells = []
        row = {}
        for key in ("r5", "r10", "mrr", "ndcg", "hit"):
            m, sd = ms([s, "overall", key])
            row[key] = [m, sd]
            cells.append("%6.3f±%.3f" % (m, sd))
        table[s] = row
        print("%-9s %15s %15s %15s %15s %15s" % (s, *cells))

    print("\nper-class nDCG@10 (mean over %d seeds)" % len(seeds))
    print("%-9s" % "system" + "".join("%18s" % c for c in classes))
    percls = {}
    for s in SYSTEMS:
        cells = []
        for c in classes:
            m, sd = ms([s, "by_class", c, "ndcg"])
            percls.setdefault(s, {})[c] = [m, sd]
            cells.append("%8.3f±%.3f" % (m, sd))
        print("%-9s" % s + "".join("%18s" % c for c in cells))

    out = {"config": {"n_mem": args.n_mem, "n_q": args.n_q, "seeds": seeds,
                      "rrf_k": RRF_K, "supersede_threshold": SUPERSEDE_THRESHOLD,
                       "lexical_weight": LEX_W,
                       "rrf_weights_deployed": {"dense": 1.0, "lexical": 1.0},
                      "embedding_model": "BAAI/bge-base-en-v1.5",
                      "rerank_model": "cross-encoder/ms-marco-MiniLM-L-6-v2",
                      "topk": args.topk, "shortlist": args.cand,
                      "classes": classes, "counts": reps[0]["counts"],
                      "ce_calls_total": sum(r["ce_calls"] for r in reps),
                      "ce_ms_per_query": reps[0]["ce_ms_per_query"]},
           "overall": table, "per_class": percls, "per_seed": reps}
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, "eval-results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print("\nwrote %s" % path)


if __name__ == "__main__":
    main()