"""Cross-check the prose claims in paper.tex against figures/eval-results.json.

Run from the whitepaper directory. Any FAIL means the paper states a number the
data does not support.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent

R = json.load(open(ROOT / "figures" / "eval-results.json", encoding="utf-8"))
O, P = R["overall"], R["per_class"]
CLS = R["config"]["classes"]


def n(sysname, metric):
    return O[sysname][metric][0]


def sd(sysname, metric):
    return O[sysname][metric][1]


def pc(sysname, cls):
    return P[sysname][cls][0]


checks = []


def check(desc, got, want, tol=0.0006):
    ok = abs(got - want) <= tol
    checks.append((ok, desc, got, want))


check("abstract: deployed rrf nDCG", n("rrf", "ndcg"), 0.378)
check("abstract: dense nDCG", n("dense", "ndcg"), 0.418)
check("abstract: rrf-w nDCG", n("rrf-w", "ndcg"), 0.422)
check("abstract: deployed rrf-w R@10", n("rrf-w", "r10"), 0.624)
check("abstract: dense R@10", n("dense", "r10"), 0.598)
check("abstract: deployed pipeline nDCG", n("rrf+ce", "ndcg"), 0.375)

check("sec 2.1: bm25 paraphrase nDCG", pc("bm25", "semantic"), 0.164)
check("sec 2.1: dense paraphrase nDCG", pc("dense", "semantic"), 0.713)

check("results: recency nDCG", n("recency", "ndcg"), 0.004)
check("results: rrf paraphrase nDCG", pc("rrf", "semantic"), 0.538)
check("results: rrf-w nDCG", n("rrf-w", "ndcg"), 0.422)
check("results: rrf-w R@5", n("rrf-w", "r5"), 0.489)
check("results: rrf-w R@10", n("rrf-w", "r10"), 0.624)
check("results: dense R@5", n("dense", "r5"), 0.473)

check("results: dense+ce R@10", n("dense+ce", "r10"), 0.620)
check("results: dense+ce nDCG", n("dense+ce", "ndcg"), 0.422)
check("results: dense P@1", n("dense", "hit"), 0.282)
check("results: dense+ce P@1", n("dense+ce", "hit"), 0.276)
check("results: rrf-w+ce R@10", n("rrf-w+ce", "r10"), 0.629)
check("results: rrf-w+ce nDCG", n("rrf-w+ce", "ndcg"), 0.415)
check("results: pinpoint dense", pc("dense", "pinpoint"), 0.159)
check("results: pinpoint dense+ce", pc("dense+ce", "pinpoint"), 0.212)
check("results: pinpoint rrf-w", pc("rrf-w", "pinpoint"), 0.205)
check("results: pinpoint rrf-w+ce", pc("rrf-w+ce", "pinpoint"), 0.223)
check("results: temporal bm25", pc("bm25", "temporal"), 0.480)

# temporal spread claim: every real configuration within 0.476..0.486
# (the recency control is a floor, not a ranking configuration, so it is out)
tvals = {s: pc(s, "temporal") for s in P if s != "recency"}
spread_ok = (min(tvals.values()) >= 0.4755) and (max(tvals.values()) <= 0.4865)
checks.append((spread_ok, "results: temporal within 0.476-0.486 (no recency)",
               "%.3f-%.3f" % (min(tvals.values()), max(tvals.values())), "0.476-0.486"))

# "gap is more than three times the larger between-seed standard deviation"
gap = n("dense", "ndcg") - n("rrf", "ndcg")
ratio = gap / max(sd("dense", "ndcg"), sd("rrf", "ndcg"))
checks.append((3.0 <= ratio <= 3.5, "results: fusion gap ~3x max sd",
               "%.2fx" % ratio, "3.0-3.5x"))

# "reproduces on all three seeds"
per = {s["seed"]: s["systems"] for s in R["per_seed"]}
repro = all(per[s]["rrf"]["overall"]["ndcg"] < per[s]["dense"]["overall"]["ndcg"]
            for s in per)
checks.append((repro, "results: rrf < dense on every seed",
               ", ".join("%d:%.3f<%.3f" % (s, per[s]["rrf"]["overall"]["ndcg"],
                                          per[s]["dense"]["overall"]["ndcg"])
                         for s in sorted(per)), "all true"))

# cost: CE latency range and rows scored per query
lat = [s["ce_ms_per_query"] for s in R["per_seed"]]
rows = [s["ce_calls"] / s["n_queries"] for s in R["per_seed"]]
checks.append((555 <= min(lat) and max(lat) <= 855, "cost: CE 0.56-0.85 s/query",
               "%.0f-%.0f ms" % (min(lat), max(lat)), "560-850 ms"))
checks.append((26 <= min(rows) and max(rows) <= 28, "cost: ~27 rows scored/query",
               "%.1f-%.1f" % (min(rows), max(rows)), "26-28"))

# harness description
mem = [s["n_memories"] for s in R["per_seed"]]
checks.append((860 <= min(mem) and max(mem) <= 880, "harness: ~870 rows",
               "%d-%d" % (min(mem), max(mem)), "860-880"))
counts = R["config"]["counts"]
checks.append((counts == {"lexical": 37, "pinpoint": 39, "semantic": 37,
                          "temporal": 37}, "harness: 37/39/37/37 mix", counts,
               "37/39/37/37"))
checks.append((R["config"]["n_q"] == 150, "harness: 150 queries",
               R["config"]["n_q"], 150))
checks.append((len(R["config"]["seeds"]) == 3, "harness: 3 seeds",
               len(R["config"]["seeds"]), 3))
checks.append((R["config"]["lexical_weight"] == 0.3, "harness: lexical weight 0.3",
               R["config"]["lexical_weight"], 0.3))

fails = [c for c in checks if not c[0]]
for ok, desc, got, want in checks:
    print("  %s %-42s got=%-28s want=%s" % ("PASS" if ok else "FAIL", desc, got, want))
print("\n%d/%d claims verified, %d FAILED" % (len(checks) - len(fails), len(checks),
                                             len(fails)))

# any number in the eval section of the tex that is not in this list?
tex = open(ROOT / "paper.tex", encoding="utf-8").read()
body = tex.split("\\subsection{Results}")[-1].split("\\section{Comparison}")[0]
nums = set(re.findall(r"0\.\d{2,3}", body))
verified = set()
for _, _, got, _ in checks:
    verified |= set(re.findall(r"0\.\d{2,3}", str(got)))
unexplained = sorted(nums - verified)
print("\ndecimals in the Results section not covered by a check:", unexplained or "none")