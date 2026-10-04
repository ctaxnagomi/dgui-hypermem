"""Locate the paper's data and source files regardless of layout.

The artifact ships in more than one arrangement: in the git repository the
scripts live in `paper/eval/` with `figures/` and `paper.tex` a level up, while
the Hugging Face dataset repo uploads the same files flattened to the root.
Rather than hardcode either arrangement -- and rather than depend on the working
directory -- resolve against a short candidate list and take the first hit.
"""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent


def find(*candidates):
    """First existing path among candidates, or a clear failure listing them all."""
    for c in candidates:
        if c.exists():
            return c
    tried = "\n  ".join(str(c) for c in candidates)
    raise SystemExit("could not find any of:\n  " + tried)


def find_results():
    return find(HERE / "figures" / "eval-results.json",
                HERE / "eval-results.json",
                HERE.parent / "figures" / "eval-results.json")


def find_paper():
    return find(HERE / "paper.tex", HERE.parent / "paper.tex")


def find_results_tex():
    return find(HERE / "results.tex", HERE.parent / "results.tex")


def results_dir():
    """Directory the evaluation writes its JSON into.

    Chosen from where the data already lives, so a rerun overwrites the shipped
    results instead of creating a second copy beside them. Falls back to the
    conventional `figures/` when no results file is present.
    """
    for c in (HERE / "figures", HERE.parent / "figures", HERE):
        if c.is_dir():
            return c
    return HERE / "figures"