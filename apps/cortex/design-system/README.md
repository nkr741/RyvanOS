# rynOne Design System

The design system powering Cortex Growth. Premium enterprise UI built on an 8pt grid, targeting Stripe/Linear/Vercel tier quality.

Component implementations live in `src/components/ui/`. This directory documents the design decisions and usage guidelines.

## Foundation

| Token | Reference |
|-------|-----------|
| **Colors** | [`colors.md`](./colors.md) -- Semantic color tokens, light/dark mode, CSS variables |
| **Spacing** | [`spacing.md`](./spacing.md) -- 8px grid, `--space-1` through `--space-24` |
| **Typography** | [`typography.md`](./typography.md) -- DM Sans body, JetBrains Mono code |
| **Shadows** | `--shadow-xs` through `--shadow-xl`, plus `--shadow-card` / `--shadow-card-hover` |
| **Border Radius** | `--radius-sm` (6px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-xl` (16px), `--radius-full` (9999px) |

## Components

All components live in `src/components/ui/`. See [`components.md`](./components.md) for the full catalog.

- **Button** -- Primary, secondary, ghost, danger variants. 3 sizes. Loading state.
- **Input / Textarea / Select** -- Form primitives with labels, validation, helper text.
- **Card** -- Compound component: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter.
- **Modal** -- Dialog overlay with animated entry, escape/overlay close, scroll locking.
- **Badge** -- Semantic status pill: success, warning, danger, info, neutral. Optional dot.
- **Tabs** -- Underline or pill variants. Full keyboard navigation. Animated indicator.
- **StatCard** -- Dashboard KPI card with trend indicator and icon.
- **ProgressRing** -- Circular SVG progress with animated stroke.
- **Skeleton** -- Loading placeholders: base, text, avatar, card composites.
- **Toast** -- Context-based notification system. Auto-dismiss, 4 semantic types.
- **Avatar** -- Image with initials fallback, status dot, 4 sizes.

## Patterns

- **Skeletons** -- Use `Skeleton`, `SkeletonText`, `SkeletonAvatar`, `SkeletonCard` while data loads.
- **Empty States** -- Centered illustration + message + action button. Use muted foreground.
- **Error States** -- Danger-colored alert with retry action. Use `--danger` tokens.
- **Loading States** -- Skeleton for layout, `ProgressRing` for progress, Button `loading` prop for actions.

## Theming

- **Dark Mode** -- Automatic via `prefers-color-scheme`, manual via `data-theme="dark"` on `:root`.
- **Light Mode** -- Default. Manual override via `data-theme="light"`.
- **CSS Variables** -- All tokens defined in `globals.css`. Tailwind v4 bridge maps them to `--color-*`.

## Motion

| Token | Duration | Use |
|-------|----------|-----|
| `--transition-fast` | 120ms | Hover states, toggles |
| `--transition-base` | 180ms | Most interactions |
| `--transition-slow` | 300ms | Layout shifts, modals |
| `--transition-spring` | 300ms cubic-bezier(0.34,1.56,0.64,1) | Bouncy emphasis |

Animations: `.animate-slide-up`, `.animate-fade-in`, `.toast-enter`, `.toast-exit`, `.modal-overlay-enter`, `.modal-content-enter`.

## Icons

Use **Lucide React** exclusively. No other icon libraries. Import from `lucide-react`.
