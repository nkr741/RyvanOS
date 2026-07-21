# Color System

All colors are defined as CSS custom properties in `src/app/globals.css`. Never use raw hex values -- always reference tokens.

## Core Tokens

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--background` | `#ffffff` | `#09090b` | Page background |
| `--background-secondary` | `#fafafa` | `#18181b` | Sidebar, section backgrounds |
| `--foreground` | `#18181b` | `#fafafa` | Primary text |
| `--foreground-secondary` | `#71717a` | `#a1a1aa` | Secondary text, labels |
| `--foreground-tertiary` | `#a1a1aa` | `#71717a` | Placeholder text, disabled |

## Brand Colors

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--primary` | `#2563eb` | `#3b82f6` | Primary actions, links, focus rings |
| `--primary-hover` | `#1d4ed8` | `#60a5fa` | Hover state for primary |
| `--primary-light` | `#dbeafe` | `rgba(59,130,246,0.15)` | Primary backgrounds, badges |
| `--accent` | `#7c3aed` | `#8b5cf6` | Secondary brand, gradients |
| `--accent-hover` | `#6d28d9` | `#a78bfa` | Hover state for accent |
| `--accent-light` | `#ede9fe` | `rgba(139,92,246,0.15)` | Accent backgrounds |

## Semantic Colors

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--success` | `#10b981` | `#10b981` | Positive outcomes, confirmed |
| `--success-foreground` | `#065f46` | `#6ee7b7` | Text on success backgrounds |
| `--warning` | `#f59e0b` | `#f59e0b` | Caution, pending states |
| `--warning-foreground` | `#78350f` | `#fcd34d` | Text on warning backgrounds |
| `--danger` / `--destructive` | `#ef4444` | `#ef4444` / `#f87171` | Errors, destructive actions |
| `--danger-foreground` | `#991b1b` | `#fca5a5` | Text on danger backgrounds |
| `--info` | `#3b82f6` | `#3b82f6` | Informational callouts |
| `--info-foreground` | `#1e40af` | `#93c5fd` | Text on info backgrounds |

## Surface & Border

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--card` | `#ffffff` | `#18181b` | Card backgrounds |
| `--card-hover` | `#fafafa` | `#27272a` | Card hover state |
| `--muted` | `#f4f4f5` | `#27272a` | Muted backgrounds, disabled |
| `--border` | `#e4e4e7` | `#27272a` | Default borders |
| `--border-hover` | `#d4d4d8` | `#3f3f46` | Hover borders |
| `--input` | `#d4d4d8` | `#3f3f46` | Input borders |
| `--ring` | `#2563eb` | `#3b82f6` | Focus rings |

## Usage Guidelines

1. **Text on backgrounds**: Use `--foreground` on `--background`. Use `--foreground-secondary` for supporting text.
2. **Interactive elements**: Use `--primary` for clickable actions. Switch to `--primary-hover` on hover.
3. **Status indicators**: Match Badge variant to semantic color -- success for positive, danger for errors, warning for caution.
4. **Destructive actions**: Use `--danger` for delete buttons, error messages. Never use red for non-error states.
5. **Dark mode**: All tokens auto-switch. Never hardcode hex values or use `dark:` Tailwind modifiers for colors that have tokens.
6. **Gradients**: Use `--gradient-primary` (blue-to-violet) for hero sections and emphasis. Use `--gradient-text` for gradient text effects.
