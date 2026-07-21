# Component Catalog

All components live in `src/components/ui/`. Every component uses `forwardRef` and accepts standard HTML attributes via spread.

---

## Button

**File**: `button.tsx`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"primary" \| "secondary" \| "ghost" \| "danger"` | `"primary"` | Visual style |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Height and padding |
| `loading` | `boolean` | `false` | Shows spinner, sets `aria-busy` |
| `icon` | `ReactNode` | -- | Leading icon element |

```tsx
<Button variant="primary" size="md" loading={saving} icon={<Save size={16} />}>
  Save Changes
</Button>
```

---

## Input

**File**: `input.tsx` -- also exports `Textarea` and `Select`.

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Rendered as `<label>`, auto-generates `id` |
| `error` | `string` | Validation error, sets `aria-invalid` |
| `helperText` | `string` | Hint text below input |
| `icon` | `ReactNode` | Leading icon inside the field |

```tsx
<Input label="Email" type="email" error={errors.email} icon={<Mail size={16} />} />
<Textarea label="Notes" helperText="Optional" />
<Select label="Region" options={[{value: "us", label: "United States"}]} placeholder="Choose..." />
```

---

## Card

**File**: `card.tsx` -- compound component with 6 exports.

| Export | Prop | Description |
|--------|------|-------------|
| `Card` | `hoverable?: boolean` | Enables hover shadow/border lift |
| `CardHeader` | -- | Top section, flex column layout |
| `CardTitle` | -- | Heading, renders `<h3>` |
| `CardDescription` | -- | Subtitle text, muted color |
| `CardContent` | -- | Main body area |
| `CardFooter` | -- | Bottom section, flex row layout |

```tsx
<Card hoverable>
  <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
  <CardContent>$42,500</CardContent>
</Card>
```

---

## Modal

**File**: `modal.tsx` -- exports `Modal` and `ModalFooter`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | -- | Controls visibility |
| `onClose` | `() => void` | -- | Close callback |
| `size` | `"sm" \| "md" \| "lg" \| "xl" \| "full"` | `"md"` | Dialog width |
| `title` | `string` | -- | Header title |
| `description` | `string` | -- | Header subtitle |
| `closeOnOverlay` | `boolean` | `true` | Click outside to close |
| `closeOnEscape` | `boolean` | `true` | Escape key to close |

```tsx
<Modal open={showModal} onClose={() => setShowModal(false)} title="Confirm Delete" size="sm">
  <p>This action cannot be undone.</p>
  <ModalFooter><Button variant="danger">Delete</Button></ModalFooter>
</Modal>
```

---

## Badge

**File**: `badge.tsx`

| Prop | Type | Description |
|------|------|-------------|
| `variant` | `"success" \| "warning" \| "danger" \| "info" \| "neutral"` | Semantic color |
| `dot` | `boolean` | Shows colored status dot before text |

```tsx
<Badge variant="success" dot>Active</Badge>
```

---

## Tabs

**File**: `tabs.tsx` -- exports `TabGroup` and `TabPanel`.

| Prop (TabGroup) | Type | Description |
|-----------------|------|-------------|
| `tabs` | `{id, label, icon?, disabled?}[]` | Tab definitions |
| `activeTab` | `string` | Currently active tab id |
| `onTabChange` | `(id: string) => void` | Tab switch callback |
| `variant` | `"underline" \| "pills"` | Visual style |

```tsx
<TabGroup tabs={[{id: "overview", label: "Overview"}, {id: "details", label: "Details"}]}
  activeTab={tab} onTabChange={setTab} variant="underline" />
<TabPanel tabId="overview" activeTab={tab}>Overview content</TabPanel>
```

---

## StatCard

**File**: `stat-card.tsx`

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Metric name |
| `value` | `string \| number` | Display value |
| `icon` | `ReactNode` | Icon in primary-light circle |
| `trend` | `{value: number, direction: "up" \| "down"}` | Trend arrow + percentage |
| `description` | `string` | Footer text |

```tsx
<StatCard label="Total Leads" value="1,234" icon={<Users size={20} />}
  trend={{value: 12, direction: "up"}} description="vs last month" />
```

---

## ProgressRing

**File**: `progress-ring.tsx`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | -- | 0-100 percentage |
| `size` | `number` | `80` | Diameter in px |
| `strokeWidth` | `number` | `6` | Ring thickness |
| `showValue` | `boolean` | -- | Show percentage label |
| `color` | `string` | `var(--primary)` | Ring color |
| `label` | `string` | -- | Accessible label |

```tsx
<ProgressRing value={75} showValue color="var(--success)" label="Completion" />
```

---

## Skeleton

**File**: `skeleton.tsx` -- 4 exports for loading placeholders.

| Export | Props | Description |
|--------|-------|-------------|
| `Skeleton` | standard div props | Base shimmer rectangle |
| `SkeletonText` | `lines?: number`, `lastLineWidth?: string` | Multi-line text placeholder |
| `SkeletonAvatar` | `size?: "sm" \| "md" \| "lg"` | Circular avatar placeholder |
| `SkeletonCard` | -- | Composite card placeholder |

```tsx
<SkeletonCard />
<SkeletonText lines={3} lastLineWidth="60%" />
```

---

## Toast

**File**: `toast.tsx` -- exports `ToastProvider` and `useToast` hook.

Wrap your app in `<ToastProvider>`, then call the hook:

```tsx
const { toast, dismiss } = useToast();
toast({ type: "success", title: "Saved", description: "Changes applied." });
```

Types: `"success"`, `"error"`, `"warning"`, `"info"`. Default duration: 5000ms.

---

## Avatar

**File**: `avatar.tsx`

| Prop | Type | Description |
|------|------|-------------|
| `src` | `string` | Image URL (falls back to initials) |
| `alt` | `string` | Alt text |
| `name` | `string` | Used to generate initials fallback |
| `size` | `"sm" \| "md" \| "lg" \| "xl"` | 32px, 40px, 48px, 64px |
| `status` | `"online" \| "offline" \| "busy" \| "away"` | Status indicator dot |

```tsx
<Avatar name="Jane Doe" size="lg" status="online" />
```
