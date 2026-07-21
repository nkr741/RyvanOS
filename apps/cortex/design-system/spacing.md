# Spacing System

All spacing follows an 8px base grid. Defined as CSS variables in `globals.css`.

## Scale

| Token | Value | Tailwind | Common Use |
|-------|-------|----------|------------|
| `--space-1` | 4px | `p-1` | Icon padding, tight gaps between inline elements |
| `--space-2` | 8px | `p-2` | Input padding-y, gap between related items |
| `--space-3` | 12px | `p-3` | Small card padding, button padding-x (sm) |
| `--space-4` | 16px | `p-4` | Default card padding, section gaps |
| `--space-5` | 20px | `p-5` | Medium card padding |
| `--space-6` | 24px | `p-6` | Large card padding, form field gaps |
| `--space-8` | 32px | `p-8` | Section padding, major gaps |
| `--space-10` | 40px | `p-10` | Page-level padding |
| `--space-12` | 48px | `p-12` | Large section separation |
| `--space-14` | 56px | `p-14` | Hero section padding |
| `--space-16` | 64px | `p-16` | Maximum content padding |
| `--space-20` | 80px | `p-20` | Page top/bottom spacing |
| `--space-24` | 96px | `p-24` | Full section separation |

The 4px value (`--space-1`) is the only exception to the 8px grid. Use it only for tight optical adjustments.

## Guidelines

### When to use each size

- **4px**: Icon-to-text gap, badge padding, fine optical adjustments.
- **8px**: Default gap between related elements (label-to-input, icon-to-label).
- **16px**: Standard content padding inside cards and containers.
- **24px**: Gap between form fields, spacing between card sections.
- **32px**: Gap between major content blocks within a page section.
- **48-64px**: Vertical spacing between full page sections.

### Margin vs Padding

- **Padding**: Internal space within a component. Cards, buttons, inputs all use padding.
- **Margin**: External space between sibling components. Use `gap` in flex/grid layouts instead of margin when possible.
- **Prefer `gap`**: In flex and grid containers, use `gap` over individual margins. It avoids collapsing issues and keeps spacing consistent.

### Layout Rules

1. Use `gap` on flex/grid parents instead of margin on children.
2. Cards use `--space-4` (16px) or `--space-6` (24px) internal padding.
3. Page sections use `--space-8` (32px) or `--space-12` (48px) vertical gaps.
4. Form fields stack with `--space-6` (24px) gap.
5. Button groups use `--space-2` (8px) or `--space-3` (12px) gap.
6. Dashboard grid uses `--space-4` (16px) or `--space-6` (24px) gap.

### Anti-patterns

- Do not use arbitrary pixel values (e.g., `margin: 13px`). Snap to the grid.
- Do not mix margin and gap on the same axis -- pick one strategy per container.
- Do not use `--space-1` (4px) as general spacing. It exists for optical corrections only.
