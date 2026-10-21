# Print CSS recipe - the parts that actually survive Chrome `page.pdf()`

Verified on Chrome 155 (`page.pdf({preferCSSPageSize: true, printBackground: true})`),
A4 portrait, 3-page pack with a cover.

## Page box

```css
@page {
  size: A4 portrait;               /* or A4 landscape */
  margin: 20mm 16mm 18mm 16mm;     /* content area: 178 x 259 mm */
}
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; margin: 0; }
img { max-width: 100%; }
```

## Sheet with its own header and footer

Do not use `position: fixed`. Chrome repeats fixed elements but offsets them relative to the
page box in a way that lands the header at the bottom of page 1.

```html
<div class='sheet hf'>
  <div class='sh-head'>
    <span class='l'>KOLEJ VOKASIONAL MIRI</span>
    <span>PINTU MASUK BARU - PAGAR BERDAUN TUNGGAL</span>
    <span class='r'>INVOIS RINGKAS (BM) | REV 00 | 21-Okt-2026</span>
  </div>

  ... content ...

  <div class='grow'></div>          <!-- pushes the plan to the bottom -->
  <div class='plan-block'> ... </div>
  <div class='sh-foot'>
    <span>Kolej Vokasional Miri | Miri, Sarawak | MYR</span>
    <span>Keluli biasa, gred Q235B (S275JR setara)</span>
    <span class='r'>Muka surat 2 / 3 | Dokumen anggaran</span>
  </div>
</div>
```

```css
.sheet { page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
.sheet.hf { display: flex; flex-direction: column; min-height: 258mm; }
.sheet.hf.final { page-break-after: auto; }

.sh-head {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 4mm; font-size: 7.8pt; border-bottom: 1.2pt solid #333;
  padding-bottom: 1.2mm; margin-bottom: 3mm;
}
.sh-head .l { font-weight: bold; letter-spacing: 0.2pt; }
.sh-head .r { color: #444; white-space: nowrap; }

.sh-foot {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 4mm; font-size: 7.2pt; color: #444; border-top: 0.8pt solid #999;
  padding-top: 1.2mm; margin-top: 3mm;
}
.sh-foot .r { white-space: nowrap; }

.grow { flex: 1 1 auto; }
```

`min-height` must equal `297mm - top margin - bottom margin` (258 mm here), otherwise the
footer floats mid-page or the sheet spills and creates a blank page.

## Cover with a single title

```css
.sheet.coverpage {
  display: flex; align-items: center; justify-content: center;
  min-height: 258mm; text-align: center;
  font-size: 32pt; font-weight: bold; letter-spacing: 1.5pt; line-height: 1.4;
}
```

```html
<div class='sheet coverpage'>PELAN LAKARAN PINTU<br>SERTA RUJUKAN</div>
```

No header and footer on the cover; the cover sheet is `.sheet`, so it still breaks the page.

## Invoice table that does not shred its columns

```css
table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 8.6pt; }
th, td { border: 1px solid #333; padding: 2.5px 4px; text-align: left; }
td:nth-child(n+5) { text-align: right; }
p, li, figcaption { overflow-wrap: anywhere; }   /* NOT td / th */

.invt th, .invt td { padding: 2px 3px; }
.invt th:nth-child(1), .invt td:nth-child(1) { width: 8mm; }
.invt th:nth-child(3), .invt td:nth-child(3) { width: 12mm; white-space: nowrap; }
.invt th:nth-child(4), .invt td:nth-child(4) { width: 14mm; white-space: nowrap; }
.invt th:nth-child(5), .invt td:nth-child(5) { width: 25mm; }
.invt th:nth-child(6), .invt td:nth-child(6) { width: 28mm; }
```

Without the widths, portrait A4 squeezes "Qty" to "Qt y", "hole" to "hol e", and
"1,035.31" to "1,035.3 / 1".

## Image gallery

```css
.gal { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; align-items: start; }
.gal figure { margin: 0; text-align: center; }
.gal img { width: 100%; height: 58mm; object-fit: contain; border: 1px solid #999; }
.gal figcaption { font-size: 7.4pt; color: #444; margin-top: 1mm; }
```

## Plan pinned to the bottom of the page

Content, then `<div class='grow'></div>`, then the plan block, then the footer. The grow
spacer eats the free space so the drawing and footer sit on the bottom edge.

## Verification loop

```python
import pymupdf
doc = pymupdf.open(pdf)
assert doc.page_count == expected_pages
text = "\n".join(p.get_text() for p in doc)
assert "\u2014" not in text            # no em-dashes
for i, page in enumerate(doc):
    page.get_pixmap(dpi=110).save(f"check_p{i+1}.png")
```

Read the rendered PNGs. Text extraction alone will not show a clipped caption or a header
printed upside-down in the margin.
