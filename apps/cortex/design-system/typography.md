# Typography

Two font families. DM Sans for all UI text. JetBrains Mono for code and data.

## Fonts

| Variable | Family | Use |
|----------|--------|-----|
| `--font-sans` | DM Sans | Body text, headings, labels, buttons |
| `--font-mono` | JetBrains Mono | Code blocks, IDs, technical values, data tables |

Runtime also uses `--font-geist-sans` and `--font-geist-mono` as fallback aliases.

## Type Scale

| Token | Size | Rem | Use |
|-------|------|-----|-----|
| `--text-xs` | 12px | 0.75rem | Captions, helper text, timestamps |
| `--text-sm` | 14px | 0.875rem | Labels, secondary text, table cells |
| `--text-base` | 16px | 1rem | Body text, input values, buttons |
| `--text-lg` | 18px | 1.125rem | Card titles, section subheadings |
| `--text-xl` | 20px | 1.25rem | Page subheadings |
| `--text-2xl` | 24px | 1.5rem | Page titles |
| `--text-3xl` | 30px | 1.875rem | Hero subheadings |
| `--text-4xl` | 36px | 2.25rem | Hero headings, large stats |
| `--text-5xl` | 48px | 3rem | Dashboard KPI values |

## Font Weights

| Weight | Value | Use |
|--------|-------|-----|
| Normal | 400 | Body text, descriptions |
| Medium | 500 | Labels, nav items, table headers |
| Semibold | 600 | Card titles, section headings, buttons |
| Bold | 700 | Page titles, hero headings, emphasis |

## Line Heights

| Token | Value | Use |
|-------|-------|-----|
| `--leading-tight` | 1.25 | Headings, single-line labels |
| `--leading-normal` | 1.5 | Body text, descriptions |
| `--leading-relaxed` | 1.75 | Long-form content, help text |

## Letter Spacing

| Token | Value | Use |
|-------|-------|-----|
| `--tracking-tight` | -0.025em | Large headings (2xl+) |
| `--tracking-normal` | 0 | Body text, default |
| `--tracking-wide` | 0.025em | All-caps labels, overlines |

## Usage Guidelines

1. **Page title**: `text-2xl`, semibold, `--foreground`, tight tracking.
2. **Card title**: `text-lg`, semibold, `--foreground`.
3. **Body text**: `text-base`, normal weight, `--foreground`, normal leading.
4. **Supporting text**: `text-sm`, normal weight, `--foreground-secondary`.
5. **Captions/timestamps**: `text-xs`, normal weight, `--foreground-tertiary`.
6. **Code/IDs**: `text-sm`, `--font-mono`, `--foreground-secondary`.
7. **Dashboard KPI values**: `text-4xl` or `text-5xl`, bold, `--foreground`.
8. **Button text**: `text-sm` (sm), `text-base` (md), medium weight.
9. **Form labels**: `text-sm`, medium weight, `--foreground`. Uses `.form-label` class.
10. **Error text**: `text-sm`, `--danger-foreground`. Uses `.form-error` class.

## Anti-patterns

- Do not use weights below 400 (thin/light). DM Sans is optimized for 400-700.
- Do not set font sizes outside the scale. If 14px is too small and 16px too large, use 14px.
- Do not use JetBrains Mono for UI labels or headings. It is strictly for code and data.
