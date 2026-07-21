# ADR-006: Why Tailwind CSS v4

## Status

Accepted

## Date

2026-07-14

## Context

Cortex Growth needs a styling system that supports a design token-based approach, dark mode (via class and data-attribute), and zero runtime overhead. The BDE team benefits from utility-first CSS that keeps styles co-located with markup, reducing context switching. Tailwind v4 introduces CSS-native configuration via CSS variables, eliminating the JavaScript config file.

## Decision

Use Tailwind CSS v4 with CSS variables for the design system.

## Alternatives Considered

### Alternative 1: styled-components

- **Pros:** CSS-in-JS, component-scoped, dynamic styling
- **Cons:** Runtime CSS generation adds bundle size and paint cost, SSR hydration issues
- **Why rejected:** Runtime overhead conflicts with performance goals; SSR hydration mismatches cause visual flicker

### Alternative 2: CSS Modules

- **Pros:** Scoped styles, no runtime, standard CSS
- **Cons:** Verbose class name mapping, no design system primitives, separate file per component
- **Why rejected:** Too verbose for rapid iteration; no built-in spacing/color/typography scale

### Alternative 3: Vanilla CSS

- **Pros:** No dependencies, full control, no build step
- **Cons:** No design system enforcement, easy to drift from conventions, global namespace collisions
- **Why rejected:** Without utility classes or tokens, the team would reinvent a design system from scratch

## Consequences

### Positive

- Zero runtime CSS -- styles are compiled at build time
- CSS variables enable theming and dark mode without JavaScript
- Utility classes enforce design consistency across the team
- v4's CSS-native config removes the `tailwind.config.js` complexity

### Negative

- Long utility class strings can reduce markup readability (mitigated by component extraction)
- Team members unfamiliar with Tailwind face a learning curve on class names

### Risks

- Tailwind v4 is relatively new; some plugins may not yet support v4 syntax; mitigate by checking plugin compatibility before adoption

## Compliance

| Standard | Impact |
|----------|--------|
| Frontend standards | Defines styling approach and design token strategy |

## References

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)

---

*Template: Ryvan Engineering System (RES) -- Cortex Growth / rynOne*
