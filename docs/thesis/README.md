# Smart Mirror — LaTeX Thesis

Full thesis documentation in LaTeX, matching the standard FYP report structure.

## File structure

| File | Content |
|------|---------|
| `main.tex` | Master document (compile this) |
| `00_titlepage.tex` | Title page |
| `01_abstract.tex` | Abstract |
| `02_certificate.tex` | Supervisor certificate |
| `03_declaration.tex` | Student declaration |
| `04_plagiarism.tex` | Plagiarism certificate |
| `ch1_introduction.tex` | Chapter 1 — Introduction |
| `ch2_background.tex` | Chapter 2 — Background & literature survey |
| `ch3_srs.tex` | Chapter 3 — Software Requirements Specification |
| `ch4_system_modeling.tex` | Chapter 4 — System modeling & implementation |
| `ch5_testing.tex` | Chapter 5 — Testing & validation |
| `ch6_conclusion.tex` | Chapter 6 — Conclusion & future work |
| `appendix.tex` | Appendices (env vars, setup, source files) |
| `references.tex` | Bibliography |

## Before submission

Edit the custom commands at the top of `main.tex`:

- `\studentname` — Your full name
- `\rollnumber` — Your roll number
- `\college` — College / university name
- `\department` — Department name
- `\supervisor` — Guide / supervisor name
- `\submissiondate` — Submission month and year

## Compile

Requires a LaTeX distribution (TeX Live, MiKTeX, or Overleaf).

```bash
cd docs/thesis
pdflatex main.tex
pdflatex main.tex   # run twice for TOC and references
```

Or upload the entire `docs/thesis/` folder to [Overleaf](https://www.overleaf.com) and set `main.tex` as the main document.

## Screenshots

Capture kiosk screenshots (gender → browse → camera → result) and place them in `docs/thesis/figures/`. Reference them in chapters with `\includegraphics`.
