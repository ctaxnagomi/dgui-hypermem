"""Check HF_README.md's summary table against results.tex.

The README quotes the headline numbers for readers who never open the PDF, so it
needs the same guarantee the paper itself has: it must not print a number the
data does not support.

Two directions, because either alone is vacuous:

  A. No drift.      Every mean+/-sd pair the README prints must appear verbatim
                    in the generated tables.
  B. No omission.   All 40 cells of the overall table (8 systems x 5 metrics)
                    must appear in the README.

Checking only A with a regex that matches nothing would report success; hence
the floor on how many cells the extraction actually found.
"""
import io
import re
import sys

rd = io.open("HF_README.md", encoding="utf-8").read()
rs = io.open("results.tex", encoding="utf-8").read()

# results.tex writes a cell as  0.004\,$\pm$\,0.006  -- literal LaTeX, not a
# glyph -- and the README writes it as  0.004 ± 0.006.
CELL_RE = r"([0-9]\.[0-9]{3})\\,\$\\pm\$\\,([0-9]\.[0-9]{3})"
tex_cells = re.findall(CELL_RE, rs)
rd_cells = re.findall(r"([0-9]\.[0-9]{3})\s*\u00b1\s*([0-9]\.[0-9]{3})", rd)


def pair(m):
    return "%s +/- %s" % (m[0], m[1])


tex_set = set(pair(c) for c in tex_cells)
rd_set = set(pair(c) for c in rd_cells)

drift = sorted(rd_set - tex_set)

# The overall table is the first tabular in results.tex; the per-class table is
# the second. The data rows of a table sit between its first \midrule (which
# closes the header) and its first \bottomrule.
overall_block = rs.split("\\midrule", 1)[-1].split("\\bottomrule", 1)[0]
overall_cells = re.findall(CELL_RE, overall_block)
omitted = sorted(pair(c) for c in overall_cells if pair(c) not in rd_set)

print("cells found in results.tex     :", len(tex_cells))
print("cells found in HF_README.md    :", len(rd_cells))
print("cells in the overall table     :", len(overall_cells))
print()
print("A. README numbers absent from the data :", len(drift))
for d in drift:
    print("     DRIFT:", d)
print("B. overall-table cells omitted from README:", len(omitted))
for o in omitted:
    print("     OMITTED:", o)

fail = False
if len(tex_cells) < 60:
    print("\nrefusing to pass: only %d cells extracted from results.tex, so the"
          " check is vacuous." % len(tex_cells))
    fail = True
if len(overall_cells) != 40:
    print("\nrefusing to pass: expected 40 cells in the overall table, found %d."
          % len(overall_cells))
    fail = True

print("\n%s" % ("FAILED" if (fail or drift or omitted) else "README agrees with the data"))
sys.exit(1 if (fail or drift or omitted) else 0)