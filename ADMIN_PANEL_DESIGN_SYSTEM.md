# BuddyForStudy Admin Experience Design System
## Master product-design, UX, interaction, and implementation standard

**Document type:** Product design system and implementation contract  
**Scope:** BuddyForStudy administration experience and all shared admin UI patterns  
**Audience:** Product designers, UX researchers, frontend engineers, QA engineers, and AI coding agents  
**Status:** Canonical design specification  
**Primary outcome:** An admin workspace that is trustworthy, fast, understandable, accessible, resilient, and consistent at scale.

---

## 0. Executive directive

This document defines how the BuddyForStudy admin experience must be **reasoned about, structured, designed, implemented, tested, and improved**. It is not a mood board, a list of CSS preferences, or permission to add decorative UI. It is a product-quality contract.

The admin panel should feel like a well-engineered professional tool: calm at rest, information-rich when needed, responsive to intent, transparent about system state, and safe when actions have consequences.

Every screen must optimize for five outcomes, in this order:

1. **Correctness:** admins can understand the data and consequences of actions.
2. **Task completion:** frequent work takes the fewest reasonable steps.
3. **Safety:** mistakes are prevented where possible and recoverable where appropriate.
4. **Comprehension:** hierarchy and language make the next action obvious.
5. **Polish:** alignment, motion, typography, and feedback make the product feel deliberate.

Visual novelty never outranks task clarity, accessibility, security, or data integrity.

### 0.1 What “excellent” means

A screen is not excellent because it has gradients, rounded cards, animated counters, or fashionable colors. It is excellent when:

- The admin can tell where they are, what they are looking at, and what they can do.
- The most important information appears before secondary details.
- The primary action is unmistakable, and destructive actions are hard to trigger accidentally.
- The interface explains empty, loading, stale, partial, failed, and successful states.
- Related workflows behave consistently across Users, Courses, Announcements, Billing, Reports, and Settings.
- Data-heavy work remains usable with real-world volumes, slow networks, permission restrictions, and narrow screens.
- The implementation uses shared primitives and semantic tokens rather than one-off styling.
- Quality can be checked against explicit acceptance criteria rather than subjective claims.

### 0.2 Source-of-truth hierarchy

When instructions conflict, use this order:

1. Product requirements and verified business rules.
2. Security, privacy, legal, and data-integrity constraints.
3. Existing application architecture and established repository conventions.
4. This design system.
5. Local page-specific decisions, documented when necessary.
6. Personal preference or visual trends.

Never invent product behavior, data, permission rules, API contracts, or destructive consequences. If a requirement is unknown, inspect the codebase and existing specifications first. If still unknown, document the assumption and isolate it so it can be changed safely.

---

# 1. The design reasoning protocol

AI agents and human designers must complete this reasoning process before building or redesigning a page. Do not begin by selecting cards, colors, or animations.

## 1.1 Understand the job

For every screen, write a short internal brief answering:

- **Actor:** Which role is using this screen?
- **Job:** What are they trying to complete?
- **Trigger:** What brings them here?
- **Frequency:** Is this a daily, weekly, rare, or emergency task?
- **Volume:** How many records or fields may be involved?
- **Risk:** What is the cost of a wrong action?
- **Decision:** What information must be visible before acting?
- **Outcome:** What confirms that the task is complete?
- **Recovery:** What happens if the action fails or is performed by mistake?

If these questions cannot be answered from project evidence, do not invent a domain rule. Use a conservative interaction pattern and flag the unknown.

## 1.2 Rank information by decision value

Classify content into four levels:

| Level | Meaning | Typical treatment |
|---|---|---|
| P0 — Critical | Required to make a safe or correct decision | First viewport, strong hierarchy, always visible when relevant |
| P1 — Primary | Needed for the main task | Main content region |
| P2 — Supporting | Useful context, history, related data | Secondary column, tabs, drawer, expandable section |
| P3 — Rare | Audit detail, advanced configuration, low-frequency actions | Overflow menu, advanced filter, dedicated settings area |

Do not give every field equal visual weight. Do not hide P0 information behind a tooltip, hover, or secondary tab.

## 1.3 Choose a UI pattern from the task

Choose the component that best fits the task, not the component that looks most impressive.

| User need | Preferred pattern | Avoid when |
|---|---|---|
| Scan, compare, sort, filter many records | Data table | Records are highly visual or have very few attributes |
| Browse a small set of visual entities | Card/list grid | Admin must compare exact values across many records |
| Inspect a record without losing list context | Detail drawer | The task needs a long workflow, deep linking to a standalone page, or substantial space |
| Edit a short set of fields | Inline edit or drawer | Changes have complex dependencies or require extensive explanation |
| Complete a long or multi-section task | Dedicated page | The task is genuinely brief and context-dependent |
| Confirm a consequential action | Confirmation dialog | The action is reversible and a clear undo mechanism is safer and faster |
| Show three or fewer short fields | Modal | The task needs a large form, comparison, or multi-step process |
| Configure a complex filter | Filter popover/panel | The filters are essential and should remain visible |
| Show change over time | Line/area chart with exact values | The data has no meaningful time dimension |
| Compare categories | Bar chart or table | Exact values and ranking matter more than a visual overview |
| Explain a system-wide issue | Page banner | The issue affects only one card or one record |
| Report a local validation/API error | Inline field error or local alert | The failure affects the whole application |
| Perform a global jump or action | Command palette | The action is not searchable or keyboard-friendly |

Document deviations when a different pattern is necessary.

## 1.4 Optimize the full workflow

Evaluate the entire task, not just the current screen:

1. Entry point and orientation.
2. Search or discovery.
3. Inspection and decision.
4. Action.
5. Confirmation or review, if required.
6. Feedback and resulting state.
7. Recovery or next logical task.

Remove unnecessary navigation and repeated data entry. Preserve enough context to prevent errors. Fewer clicks are valuable only when the result remains understandable and safe.

## 1.5 Design for confidence

Before an admin commits an important action, the UI should answer:

- What record am I acting on?
- What will change?
- Who or what will be affected?
- Is this reversible?
- Does this require additional authorization?
- What happens next?

Use progressive disclosure to keep the default screen calm, but do not conceal consequential information.

---

# 2. Product principles and quality standards

## 2.1 The ten laws

1. **Clarity over cleverness.** The admin is working, not browsing a marketing site.
2. **One dominant action.** A page can have several actions, but only one should dominate the visual hierarchy.
3. **Density with rhythm.** Display useful information efficiently without creating visual noise.
4. **Neutral foundation.** Accent and status colors communicate meaning; they are not decoration.
5. **Predictable behavior.** Shared patterns work the same way across modules.
6. **Speed without surprise.** Optimize frequent workflows while preserving orientation and feedback.
7. **Safe by default.** Consequential actions require proportional safeguards.
8. **Honest state.** Never imply an operation succeeded before the system confirms it, except for clearly reversible optimistic updates with rollback.
9. **Accessible by construction.** Keyboard, screen-reader, contrast, zoom, touch, and reduced-motion support are baseline requirements.
10. **Evidence over taste.** Validate significant design choices through user tasks, telemetry, support patterns, or usability testing.

## 2.2 Avoid “dashboard decoration”

Do not add the following unless they improve a real task:

- Decorative gradients, glow, glassmorphism, floating shapes, or oversized empty hero sections.
- KPI cards with no decision value or no reliable source data.
- Charts that duplicate a table without helping users see a pattern.
- Animated counters that delay access to the actual value.
- Excessive badges, colored borders, icons, or different colors for equivalent statuses.
- Nested cards, repeated page titles, or multiple layers of boxed content.
- Hover-only controls for important actions.
- Fake activity, invented statistics, placeholder success messages, or hardcoded production data.
- Multiple primary buttons with equal emphasis.
- Unnecessary confirmation dialogs for reversible actions.

Polish comes from precision, hierarchy, rhythm, response, and consistency—not decoration volume.

## 2.3 Experience goals and measurable checks

For each high-value workflow, define one or more metrics:

- Task completion rate.
- Median time to completion.
- Error rate and accidental destructive-action rate.
- Number of navigation steps or repeated inputs.
- Recovery rate after failure.
- Search-to-result success.
- Accessibility defects.
- Perceived confidence in user testing.

Set numeric targets only when a baseline or product requirement supports them. Do not invent metrics and present them as measured results.

---

# 3. Design tokens and visual foundations

**Rule:** component CSS must consume semantic tokens. Do not hardcode colors, spacing, radii, shadows, font sizes, or motion durations in page-specific styles. Add a token centrally when the current scale cannot support a justified need.

## 3.1 Color tokens

The light and dark palettes below preserve the original system's base values. Keep status meanings consistent across the application.

```css
:root {
  color-scheme: light;

  /* Canvas and surfaces */
  --bg: #F6F7F9;
  --surface: #FFFFFF;
  --surface-2: #EEF0F4;
  --surface-3: #E3E7EE;

  /* Borders and text */
  --border: #DFE3EA;
  --border-strong: #C5CCD8;
  --text: #16202E;
  --text-2: #435066;
  --muted: #5D6A7D;

  /* Brand accent */
  --accent: #2F5BEA;
  --accent-hover: #2449C4;
  --accent-soft: #E6ECFD;
  --accent-text: #FFFFFF;

  /* Semantic status */
  --success: #12805C;
  --success-soft: #E2F4EC;
  --warning: #A86400;
  --warning-soft: #FBEFD9;
  --danger: #C62F3E;
  --danger-soft: #FBE5E8;
  --info: #0E7AA8;
  --info-soft: #DFF1F8;

  /* Overlays and focus */
  --overlay: rgba(15, 20, 28, 0.5);
  --focus-ring: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);
}

[data-theme="dark"] {
  color-scheme: dark;

  --bg: #0F141C;
  --surface: #171E29;
  --surface-2: #1F2835;
  --surface-3: #283243;
  --border: #2B3647;
  --border-strong: #3C4A60;
  --text: #E8EDF5;
  --text-2: #B9C4D4;
  --muted: #93A1B6;

  --accent: #6F93FF;
  --accent-hover: #8AA7FF;
  --accent-soft: #1D2A4D;
  --accent-text: #0B1220;

  --success: #3ECF9B;
  --success-soft: #12302A;
  --warning: #F0B04A;
  --warning-soft: #36290F;
  --danger: #FF7B88;
  --danger-soft: #3B1A20;
  --info: #4CC3F0;
  --info-soft: #10303D;

  --overlay: rgba(0, 0, 0, 0.65);
}
```

### Semantic color rules

| Token | Use | Do not use for |
|---|---|---|
| `--accent` | Main action, selected navigation, focus, links | Large decorative surfaces |
| `--success` | Completed, healthy, paid, published states | Generic emphasis |
| `--warning` | Pending, expiring, needs review | Ordinary neutral information |
| `--danger` | Failed, suspended, destructive actions, validation | Decoration or routine actions |
| `--info` | Informational notices and non-urgent guidance | Success or warning states |
| `--muted` | Secondary labels, timestamps, helper text | Essential body copy or disabled-only contrast |
| `--border` | Standard separation | High-contrast focus indication |

Rules:

- Color must never be the only status signal. Pair it with a label and, when helpful, an icon.
- Target WCAG 2.2 AA contrast: 4.5:1 for normal text, 3:1 for large text and meaningful non-text UI indicators.
- Validate actual token combinations in both themes. Do not assume a palette is accessible merely because it looks balanced.
- Avoid gradients on buttons, cards, navigation, and headers. A restrained chart-area fill is acceptable if it adds meaning.
- Do not use pure black or low-contrast gray text on the canvas.
- Support a manual theme choice and a sensible initial preference. Persist the user's explicit selection.
- Theme changes must not alter semantic meaning or hide focus indicators.

## 3.2 Spacing scale

Use a 4px base scale:

```css
:root {
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;
  --s-7: 48px;
  --s-8: 64px;
}
```

Usage guidance:

- Icon-to-label gap: `--s-2`.
- Compact control horizontal padding: `--s-3`.
- Default control horizontal padding: `--s-3` to `--s-4`.
- Compact card padding: `--s-4`.
- Standard card padding: `--s-5`.
- Related fields: `--s-4` vertical rhythm.
- Between content sections: `--s-5` or `--s-6`.
- Page padding: `--s-5` desktop, `--s-4` tablet, `--s-3` narrow mobile.
- Use the smallest spacing that preserves grouping and readability; do not force all pages to use identical whitespace.

Do not introduce arbitrary values such as 13px or 22px when a token works. If a genuinely new density requirement appears, add a token centrally and explain why.

## 3.3 Radius, borders, and elevation

```css
:root {
  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 14px;
  --r-full: 999px;

  --border-w: 1px;

  --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.06);
  --shadow-md: 0 4px 12px rgba(16, 24, 40, 0.10);
  --shadow-lg: 0 12px 32px rgba(16, 24, 40, 0.16);
}
```

- Inputs, buttons, chips, and menu items use `--r-sm`.
- Cards, tables, and dropdowns use `--r-md`.
- Dialogs and drawers use `--r-lg`.
- Pills and badges use `--r-full`.
- Cards use a 1px border and normally no shadow.
- Shadows communicate elevation for menus, popovers, dialogs, drawers, and toasts.
- Do not combine a heavy border with a strong shadow.
- Keep radii consistent within a component family.

## 3.4 Typography

```css
:root {
  --font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;

  --fs-xs: 12px;  --lh-xs: 16px;
  --fs-sm: 13px;  --lh-sm: 20px;
  --fs-md: 14px;  --lh-md: 22px;
  --fs-lg: 16px;  --lh-lg: 24px;
  --fs-xl: 20px;  --lh-xl: 28px;
  --fs-2xl: 24px; --lh-2xl: 32px;
  --fs-3xl: 30px; --lh-3xl: 38px;

  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
}
```

| Element | Specification |
|---|---|
| Page title | 24px / 32px, semibold |
| Section heading | 20px / 28px, semibold |
| Card heading | 16px / 24px, semibold |
| Body, form, table cell | 14px / 22px |
| Table heading | 12–13px, semibold |
| Helper, timestamp, badge | 12px / 16px |
| KPI value | 30px / 38px, semibold |
| Technical IDs, code, logs | Monospace token |

Rules:

- Use sentence case, not Title Case or ALL CAPS.
- Keep one primary font family. Use monospace only for technical identifiers and code.
- Use tabular numerals for aligned values; right-align numeric and currency columns.
- Do not use less than 12px for meaningful interface text.
- Keep explanatory prose readable; use a comfortable measure, generally around 60–80 characters per line.
- Hierarchy must come from size, weight, spacing, and placement—not from coloring every heading.

## 3.5 Layout, density, and responsive constants

```css
:root {
  --sidebar-w: 248px;
  --sidebar-w-collapsed: 68px;
  --topbar-h: 60px;
  --content-max: 1440px;
  --form-max: 720px;
  --drawer-w: 480px;
  --drawer-w-wide: 720px;

  --row-h: 48px;
  --row-h-compact: 36px;
  --row-h-comfortable: 56px;

  --control-h: 36px;
  --control-h-sm: 30px;
  --control-h-lg: 44px;

  --z-sticky: 10;
  --z-sidebar: 20;
  --z-dropdown: 40;
  --z-drawer: 60;
  --z-modal: 70;
  --z-toast: 90;
  --z-tooltip: 100;

  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-slow: 260ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Responsive breakpoints: 640px, 768px, 1024px, 1280px, 1536px.

Use breakpoints to adapt the task, not merely to shrink desktop components. On narrow screens, simplify secondary metadata, use a filter sheet, and convert dense tables to a deliberately designed list where needed. Do not scale a 12-column desktop layout down until it becomes unusable.

---

# 4. Information architecture and application shell

## 4.1 Shell anatomy

The shell consists of:

1. Skip-to-content link.
2. Persistent sidebar navigation.
3. Topbar with global search and account-level utilities.
4. Main content region.
5. Contextual overlays: menus, drawers, dialogs, and toasts.

The shell should be stable between route changes. Only the main content should normally scroll. Avoid duplicate page titles or repeated global controls inside individual pages.

## 4.2 Sidebar rules

- Expanded width: 248px. Collapsed width: 68px.
- Fixed full-height surface with a subtle right border and its own scroll area.
- Top area contains logo/workspace identity aligned to the topbar.
- Navigation is grouped by task, with no more than four primary groups and ideally no more than eight top-level items visible without expansion.
- Place frequent operational modules first, insights after daily-work modules, and settings/system tools last.
- Show only destinations the current role is authorized to access.
- Use a single active state: accent-soft background, accent icon/text, semibold label, and a 3px leading indicator.
- Collapsed items require accessible names and tooltips. Tooltips cannot be the only way a screen reader learns the label.
- Keep submenu nesting to one level.
- Persist collapse preference per user when storage and account behavior support it.
- On screens below 768px, use an off-canvas drawer with a visible close control and appropriate focus management.

## 4.3 Topbar rules

Height: 60px. The topbar contains global, not page-specific, actions.

Recommended order:

- Mobile menu trigger.
- Global search / command palette trigger, including `Ctrl K` or `⌘ K` hint.
- Flexible spacer.
- Quick-create menu, if the product has valid create actions.
- Help.
- Notifications.
- Theme control.
- Account menu.

Do not place page-specific Save, Publish, or Export actions in the global topbar. Show environment context such as Production or Staging when relevant. A staging warning must not rely on color alone.

## 4.4 Page header

The header establishes orientation and action hierarchy.

- Breadcrumbs first; current location is plain text, not a link.
- Page title and optional one-line description.
- Optional record count or status summary only when it aids understanding.
- Actions aligned opposite the title on wide screens; stacked below it on small screens.
- Maximum one primary action. Secondary actions follow; low-frequency actions go in an overflow menu.
- Tabs belong directly below the header and switch views within the same destination.
- Do not show a tab bar with one tab.
- Sticky headers are allowed for long forms or data-heavy pages only when they improve orientation and do not consume excessive viewport space.

## 4.5 Content layout

- Use a 12-column grid for desktop layouts when multiple content regions genuinely help.
- Standard page padding is 24px desktop, 16px tablet, 12px mobile.
- Content max width is 1440px; use fluid space below it.
- Avoid card-inside-card nesting. Use headings, dividers, or a subtle surface block to group content.
- Align page titles, filter bars, tables, and primary content to the same content edge.
- Avoid excessive blank space above dense operational content.
- Do not use a two-column layout when the second column is only decorative.
- Keep the most important content in the first viewport without forcing critical context below a large hero or oversized KPI row.

---

# 5. Component system and interaction contracts

All shared components must be implemented once, documented, and reused. Component APIs should be typed, predictable, and composable. Do not duplicate a local button, table, badge, or modal implementation inside a page.

Every interactive component must define: purpose, variants, sizes, states, keyboard behavior, accessible naming, responsive behavior, and failure behavior.

## 5.1 Buttons

### Variants

| Variant | Treatment | Use |
|---|---|---|
| Primary | Accent fill and high-contrast text | One dominant action |
| Secondary | Surface fill, border, standard text | Alternative or supporting action |
| Ghost | Transparent, hover surface | Toolbar and low-emphasis actions |
| Danger | Danger fill and contrasting text | Confirmed destructive action |
| Danger ghost | Transparent danger text | Destructive menu item or inline action |
| Link | Accent text, underline on hover | Inline navigation |

### Contract

- Default height 36px, compact 30px, touch-friendly 44px.
- Label uses a verb + object: “Save changes”, “Add user”, “Publish course”.
- Never use vague labels such as “Submit”, “OK”, or “Yes” when the action can be named.
- Button groups place Cancel/secondary on the left and primary on the right.
- Icon-plus-label gap: 8px.
- Icon-only buttons must have an accessible name and a tooltip where helpful.
- Loading state retains button width, prevents repeat submission, and announces progress accessibly.
- Disabled actions explain why they are unavailable when that reason is not obvious.
- Use a visible focus ring. Do not remove browser focus without replacing it.
- Do not use a danger-filled button for routine non-destructive actions.
- Never use color alone to distinguish variants.

## 5.2 Form controls

### Text input and textarea

- Default height 36px; textareas start at a useful minimum height and grow where appropriate.
- Label above the control; helper text below.
- Use real `label` associations, appropriate input types, `autocomplete`, and `inputmode`.
- Required status must be programmatically and visually clear. Do not rely on a red asterisk alone.
- Focus changes border and shows the focus ring.
- Errors identify the field and explain how to correct it. Connect error text with `aria-describedby` and set `aria-invalid`.
- Preserve entered data after server errors.
- Validate on blur and submit where suitable; avoid aggressive errors on every keystroke.
- Clear controls must be keyboard-accessible and have a clear accessible name.

### Select, combobox, and multi-select

- Use a native select when the option set is small and search is unnecessary.
- Use a searchable combobox when there are more than seven plausible options or when users need to find entities by name.
- Multi-select selections must remain readable; show up to three chips, then a `+N` summary if needed.
- Dropdowns need keyboard navigation, selected-state indication, empty results, loading, and error handling.
- Do not use a custom select purely for appearance if a native control is more usable.

### Checkbox, radio, and switch

- Checkbox: independent choices or a form submission value.
- Radio: one choice from a small, mutually exclusive set.
- Switch: an immediate on/off setting whose effect is clear.
- Do not use a switch for a setting that requires a multi-field Save workflow unless its semantics are clearly explained.
- A “select all” checkbox must support an indeterminate state.
- The label is clickable; target size should be at least 32px and preferably 44px on touch devices.

### Date, time, and range

- Provide understandable date formats and explicit timezone context where timezones affect the result.
- Range presets may include Today, Last 7 days, Last 30 days, This month, and Custom.
- Always display the selected range as text.
- Do not silently change a user's chosen range when filters or routes change.

### File upload

- Show accepted file types, size limit, and whether multiple files are supported.
- Support drag-and-drop and a conventional browse action.
- Display file name, size, progress, failure reason, and remove/retry controls.
- For images, show a preview only when useful and safe.
- Do not imply an upload is complete until the server confirms it.

## 5.3 Form layout and save behavior

- Use a single column with a maximum width of 720px for most forms.
- Use two columns only for short, logically related fields such as First name / Last name or Start / End date.
- Group long forms into titled sections with short explanations.
- Put related fields together; do not mirror database tables mechanically in the UI.
- Show a validation summary at the top when several fields fail.
- On submit failure, focus and scroll to the first invalid field where possible.
- For dirty forms, show an unsaved-changes indicator and warn before leaving.
- Use one consistent save location per workflow. Do not place Save in both the page header and footer.
- For long forms, a sticky bottom bar may contain “Discard” and “Save changes”.
- Support `Ctrl/Cmd + S` only when it does not conflict with browser behavior and is announced in shortcut help.
- Autosave is appropriate only when the data model and conflict handling support it. Show “Saving…”, “Saved”, or a clear failure state.

## 5.4 Search, filters, and saved views

Filter bars belong directly above the data they control.

Default order:

1. Search.
2. Most-used filters (up to four visible).
3. More filters.
4. Reset/clear action when filters are active.
5. Flexible spacer.
6. View controls such as density, column chooser, and export.

Rules:

- Debounce free-text search around 300ms unless the product has a stronger reason.
- Cancel or ignore stale requests so old results cannot overwrite newer searches.
- Search across documented fields such as name, email, and ID; do not imply fields are searchable if they are not.
- Display active filter chips and a “Clear all” action.
- Show result count and loading state.
- Keep search, filters, sorting, page, and page size in the URL when the view should be shareable and restorable.
- A reset action must clearly distinguish resetting filters from resetting the whole page.
- Saved views store only supported preferences, such as filters, sorting, visible columns, and density.
- Server-side saved views must enforce ownership and permissions. Do not assume a saved view is private or shared without a defined product rule.
- When filters produce no results, preserve the filter state and explain how to recover.

## 5.5 Data table — the primary operational component

### Anatomy

Page header → saved views (if supported) → filter bar → active filters / result count → bulk-action bar (when selected) → table → pagination.

### Table contract

- Surface container, 1px border, medium radius.
- Table header uses a subtle surface fill and a clear distinction from body rows.
- Header height around 40px; default row height 48px.
- Compact rows are 36px only when the content remains readable and hit targets remain sufficient.
- Rows have a subtle bottom divider; hover and selection states must be distinct.
- Sortable headers expose direction and current sort accessibly.
- Column order generally follows: selection → primary identifier → key attributes → status → dates → row actions.
- Text is left-aligned; currency and numeric values are right-aligned.
- Dates use a consistent app-wide format and may expose exact timestamps on focus/hover.
- Long content may truncate, but full values must remain available by an accessible route, not hover alone.
- Do not wrap names unpredictably across multiple lines.
- Row click may open a detail drawer or route, but nested buttons, links, and checkboxes must not trigger the row action.
- Row actions use a visible overflow menu. A single frequent safe action may appear separately when it saves meaningful time.
- Destructive actions appear at the bottom of menus, separated from routine actions.
- Selection state is explicit and retained only according to a clear pagination/filter rule.
- “Select all on this page” and “Select all matching results” must be separate actions.
- Bulk operations show selected count, applicable actions, progress, per-record failures where necessary, and a clear final summary.
- Column chooser supports show/hide and reset; reordering is optional and should not be added without value.
- Persist density and columns per user only when the application supports reliable preference storage.
- Pagination states the range and total, page size, and navigation controls.
- For extremely large or live datasets, choose cursor pagination or “Load more” when appropriate to the backend.
- Virtualize only when measured rendering cost justifies it; virtualization must not break keyboard navigation or accessibility.

### Loading and empty behavior

- Initial load: skeleton rows that mirror the actual columns.
- Refresh: preserve old data and show a subtle progress indicator when safe; never present stale data as fresh without a cue.
- Truly empty: “No users yet” plus the appropriate creation action, if permitted.
- Filtered empty: “No users match these filters” plus “Clear filters”.
- Error: retain relevant context and provide Retry when retrying is safe.
- Partial failure: show an error only in the affected panel or data region when the rest of the page remains useful.

## 5.6 Cards and metric summaries

Cards are for related information, not a default container for everything.

- Use a surface, 1px border, medium radius, and standard padding.
- Card heading is left-aligned; optional action is right-aligned.
- Clickable cards must be a single semantic link or button, with keyboard focus.
- A metric card should contain a label, value, meaningful comparison if available, and a link to the relevant filtered data.
- Do not show a percentage delta without a defined comparison period and denominator.
- Do not invent sparkline data.
- Use no more than six KPI cards on a dashboard; four is a good default.
- Each metric must answer a real admin question. Remove metrics that do not change a decision.
- Never place a card inside another card without a clear structural reason.

## 5.7 Status badges and chips

- Badge height around 22px, horizontal padding 8px, pill radius, 12px text.
- Use the same label and semantic color for the same status everywhere.
- Always pair color with text; icons are optional, not a replacement for labels.
- Keep status vocabularies small and domain-defined. Do not create a new color for each backend enum.
- Typical mapping: Active/Paid/Published → success; Pending/Draft/Needs review → warning; Failed/Suspended/Overdue → danger; New/Informational → info; Archived/Unknown → neutral.
- Confirm the actual status semantics from the project. This example is not permission to remap a business status incorrectly.
- Filter chips are removable by mouse and keyboard and announce their label.

## 5.8 Tabs

- Use tabs only for related views within one destination or record.
- Active tab uses text emphasis and an underline; inactive tabs remain readable.
- Tabs are deep-linkable when users should be able to bookmark or share a specific view.
- Keep the number to six or fewer where possible; move secondary tabs to a More menu only when necessary.
- Do not use tabs as a substitute for primary navigation.
- Implement correct tab roles, keyboard behavior, selected state, and focus management if using custom tabs.

## 5.9 Dialogs and confirmations

Use a dialog for a short task or decision, not a large workflow.

Suggested widths: 400px for confirmation, 520px for a short form, up to 720px for a genuinely complex review.

Structure:

1. Clear title.
2. Concise explanation and consequence.
3. Relevant record identity and scope.
4. Optional impact summary.
5. Footer with Cancel on the left and the named action on the right.

Rules:

- Trap focus, set appropriate dialog semantics, support Escape when safe, and return focus to the trigger.
- Clicking the overlay may close a non-destructive dialog only when no unsaved data would be lost.
- Destructive confirmation names the target and describes the consequence.
- For high-impact irreversible actions, require a typed name or an additional authorization step when justified by risk.
- Button text repeats the actual action, e.g. “Delete course”, not “Yes”.
- Do not ask for confirmation twice unless a separate policy or security boundary requires it.
- Do not use a modal for a simple reversible action if a clear undo mechanism is safer and faster.

## 5.10 Drawers

Use a drawer when admins need to inspect or make a small edit without losing list context.

- Standard width 480px; wide width up to 720px where necessary.
- Full height, right aligned, elevated above the page.
- Header contains record identity, status, close control, and optional previous/next navigation.
- Body scrolls independently.
- Sticky footer contains the primary action only when the workflow needs one.
- Keep the underlying table context visible where appropriate.
- Update the URL with a stable record identifier if direct linking and browser Back behavior are part of the product architecture.
- Do not place a long, multi-step workflow in a narrow drawer.
- On mobile, use a full-screen sheet/page rather than a cramped desktop drawer.

## 5.11 Menus, tooltips, and popovers

- Menus use a surface, border, restrained shadow, medium radius, and comfortable item hit areas.
- Support arrows, Enter, Escape, and type-ahead where relevant.
- Separate destructive actions from routine actions.
- Tooltips are for brief supplementary labels, never critical instructions or the only access to information.
- Tooltips open on hover and keyboard focus and have a short delay.
- Popovers are click-triggered when they contain interactive content and close on Escape and outside click.
- Ensure menus and popovers remain inside the viewport and do not obscure the active control unnecessarily.

## 5.12 Toasts, alerts, and banners

- Toasts confirm completed actions, not merely attempted actions.
- Place transient feedback consistently, typically bottom-right on desktop and a safe full-width region on mobile.
- Stack no more than three to avoid covering the work area.
- Success messages should name the action: “User suspended”, “Course published”.
- Errors must persist long enough to understand and should not disappear before the user can act.
- Undo is appropriate only when the server and data model genuinely support reversal.
- Inline alerts belong near the affected content.
- Page banners are for system-wide or page-wide conditions, such as maintenance or connectivity.
- Use `role="status"` for routine status announcements and `role="alert"` for urgent errors where appropriate.
- Do not announce every background refresh to screen readers.

## 5.13 Avatars, charts, progress, and skeletons

### Avatars

- Use consistent 24, 32, 40, and 64px sizes.
- Fall back to deterministic initials when an image is absent.
- Status dots appear only when presence/status is relevant.
- Do not rely on avatar color to convey identity or status.

### Charts

- Line charts show trends over time; bars compare categories; donuts are reserved for a small number of parts.
- Avoid 3D charts, decorative charts, and pie charts with many slices.
- Use a restrained, consistent series palette with accessible contrast.
- Show exact values in tooltips and provide a text summary or accessible data table.
- Include date range and relevant filters near the chart.
- Label axes, units, and comparison periods.
- A chart with no data says “No data for this period” and explains how to change the range when appropriate.
- Never fabricate values to make a chart look complete.

### Progress and skeletons

- Use progress bars for uploads and long-running tasks when progress is known.
- If progress is unknown, use an indeterminate state rather than a fake percentage.
- Skeletons should match the final layout and not shimmer under reduced-motion preferences.
- Use a spinner for a short, localized action; prefer skeletons for a page or table's first load.
- Avoid full-page loading overlays when the user can safely keep working with existing content.

### Scroll behavior

- Keep independent scroll regions limited to areas that genuinely need them.
- Use thin but visible scrollbars for data areas.
- Use `overscroll-behavior: contain` in drawers, menus, and dialogs.
- Reserve scrollbar space where needed to prevent layout shifts.
- Do not hide scrollbars on important data regions.

## 5.14 Command palette

A command palette is a high-value power feature when it is backed by real navigation and actions.

- Open with Ctrl/Cmd + K.
- Search pages, permitted records, actions, and recent destinations.
- Group results by type and show shortcut hints where helpful.
- Support arrows, Enter, Escape, and type-ahead.
- Respect permissions: do not expose unauthorized records or actions.
- Search results must use real application data; never display fake commands as if implemented.
- Keep the search field focused on open and return focus to the trigger on close.
- If global search is not implemented, do not display a non-functional command-palette affordance.

---

# 6. Page archetypes and information hierarchy

Use these archetypes as starting patterns, not rigid layouts. A page may depart from the template when its task and data justify it.

## 6.1 Dashboard: orient, prioritize, act

The dashboard must answer two questions quickly: **What changed? What needs my attention?**

Recommended hierarchy:

1. Page title and time range.
2. Three to five meaningful KPIs, if reliable data exists.
3. Needs-attention queue with direct, permission-aware actions.
4. One or two charts that reveal a meaningful trend.
5. Recent activity or high-value records.
6. Links to deeper reports.

Rules:

- Do not use KPI cards as decoration.
- Every metric needs a label, time period, and definition available to the admin.
- Prioritize exceptions and pending work over vanity metrics.
- Make important numbers navigable to the corresponding filtered records.
- Load the most actionable information first; lazy-load lower-priority visualizations.
- Partial chart failure must not break the whole dashboard.
- Do not render empty chart frames when no data exists.

## 6.2 List pages: find, compare, act

Applies to Users, Courses, Announcements, Transactions, Refunds, Reports, and other record collections.

Hierarchy:

1. Page header with count and one primary action.
2. Saved views when implemented.
3. Search and filters.
4. Active filter chips and result count.
5. Bulk action bar when selection exists.
6. Table or deliberate list.
7. Pagination and page-size control.

Rules:

- Choose columns based on admin decisions, not every available database field.
- Put the most identifying and decision-relevant columns first.
- Use a detail drawer for quick inspection only when the workflow benefits from list context.
- Export respects the current filters and permission scope.
- Show the result of bulk operations, including records that failed.
- Preserve filter, sort, and pagination state when returning from a record detail view.

## 6.3 Record detail

A detail view should make identity, current status, key facts, available actions, and recent changes immediately clear.

- Header: record identity, status, key metadata, primary action, overflow menu.
- Main region: overview and the task-relevant fields.
- Secondary region: related records, key metrics, or quick actions when useful.
- Tabs: only when sections are genuinely distinct and deep-linking helps.
- Activity timeline: newest first, with actor, action, relative time, and exact time accessible.
- Sensitive fields must be masked or permission-gated.
- Destructive or high-risk actions must state their impact and be audited where required.

## 6.4 Create and edit workflows

- Use a dedicated page for long, complex, or multi-step forms.
- Use a drawer for quick edits with limited fields.
- Use a modal only for short, focused tasks.
- Separate editable fields from read-only metadata.
- Explain generated fields, derived values, and irreversible effects.
- Preserve drafts and entered data after validation or network errors.
- After successful save, show confirmation and return the user to a useful context without unexpectedly resetting list filters.
- Prevent duplicate submission and handle concurrent edits deliberately.

## 6.5 Settings

- Use a left sub-navigation and a main content column on wide screens.
- Group settings by user goal, not by internal code or database table.
- Each section has a title, concise explanation, and related controls.
- Make the save model obvious: immediate save per setting or one explicit Save action.
- Show unsaved state and conflict/error handling.
- Put dangerous system-wide settings in a clearly separated danger zone at the bottom.
- Do not combine unrelated settings merely to fill a card.

## 6.6 Analytics and reports

- Start with a date range, comparison period, and relevant segmentation controls.
- Present KPIs before visualizations, followed by a detailed table where exact values matter.
- Keep filters in the URL when the report should be shareable.
- Explain units, definitions, time zones, and comparison periods.
- CSV/PDF export must match the visible filters and permissions.
- Scheduled reports should expose recipient, cadence, timezone, and next-run behavior before saving.
- Clearly distinguish unavailable data from a genuine zero.

## 6.7 Authentication and access

- Keep authentication screens focused, with no admin sidebar.
- Use clear error messages without revealing whether sensitive account details exist when that would create a security risk.
- Show/hide password controls with accessible labels.
- Provide loading, retry, expired-session, and 2FA states where the product supports them.
- Permission errors should explain the next valid step without leaking protected information.
- Never store or display secrets in full after initial creation unless the product's security model explicitly requires it.

---

# 7. Admin workflow efficiency

Efficiency must be intentional and measured. Do not implement every shortcut simply because it appears in this list.

## 7.1 High-value capabilities

Prioritize when supported by the product:

1. Global command palette.
2. Quick-create actions for frequent entity types.
3. Searchable lists and saved filters.
4. Row detail drawers that preserve list context.
5. Bulk operations with a clear selected count.
6. Keyboard navigation for dense data work.
7. Inline editing for simple, low-risk fields.
8. CSV import with preview, field mapping, validation, and a downloadable error report.
9. Export that respects active filters and permissions.
10. Duplicate/clone flows for repeated setup.
11. Undo for reversible changes.
12. Autosaved drafts for long content.
13. Cache and prefetch behavior that does not show misleading stale state.
14. Cancelable long-running operations with clear progress.

Each capability must have a real end-to-end implementation. Do not expose buttons or shortcuts that do nothing.

## 7.2 Optimistic updates

Use optimistic UI only when:

- The operation is reversible or rollback can be performed safely.
- The likely result is predictable.
- A failure can be clearly surfaced.
- The user can understand whether the data is pending, confirmed, or reverted.

On failure, restore the correct state and explain the outcome. Never optimistically report a refund, payment, permission change, or other sensitive server-side effect as final before confirmation.

## 7.3 Keyboard shortcuts

Suggested defaults, only where implemented and conflict-free:

| Shortcut | Action |
|---|---|
| Ctrl/Cmd + K | Open command palette |
| Ctrl/Cmd + S | Save current form |
| Esc | Close topmost safe overlay |
| Enter | Open selected row or activate focused control |
| J / K | Move through table rows, if implemented accessibly |
| X | Select focused row, if clearly discoverable |
| E | Edit selected record, if safe and supported |
| ? | Open shortcut help |
| G then D | Go to dashboard, if a discoverable shortcut system exists |

- Show shortcuts in help and relevant menu items.
- Do not hijack browser or assistive-technology shortcuts.
- Shortcuts must respect focus context. Typing in a text field must not trigger global navigation.
- Do not advertise shortcuts that are not implemented.

---

# 8. UX writing and content design

The interface language is part of the interaction model. Text must make actions and system states understandable.

## 8.1 Voice and terminology

- Use plain language, active voice, and sentence case.
- Name actions the way admins describe the task: “Suspend user”, not “Toggle account state”.
- Use one canonical term for the same entity and action across the product.
- Prefer concise wording, but never remove context needed for a safe decision.
- Use technical terminology when the audience needs it; explain unusual terms at the point of use.
- Avoid vague labels such as “Manage”, “Process”, or “Done” when a more precise label is possible.

## 8.2 Action and feedback consistency

The button, confirmation, toast, and audit event should use a consistent verb:

- Button: “Publish course”
- Confirmation: “Publish this course?”
- Success: “Course published”
- Activity: “Asha published Intro to Python”

Use the actual record name and action when safe. Do not expose private data in a toast or notification.

## 8.3 Error messages

A good error explains:

1. What failed.
2. What the user can do next.
3. Whether their data is preserved.
4. Whether retrying is safe.

Example: “Couldn't save changes. Your edits are still here. Check your connection and try again.”

Do not show raw stack traces, internal service names, database errors, or codes without a human-readable explanation. Log technical details securely for developers.

## 8.4 Empty and no-result states

- True empty state: explain that no records exist yet and offer the relevant create action if authorized.
- Filtered empty state: state that no records match the current criteria and offer to clear filters.
- Search empty state: echo the search term when appropriate and suggest a recovery action.
- Permission-limited state: do not mislead the user into thinking data does not exist if access is restricted.
- Do not fill an empty state with invented examples or decorative illustrations that distract from the next step.

## 8.5 Numbers, dates, and money

- Use one consistent date format across the product, e.g. `18 Oct 2026`.
- Use relative time for recent activity only when the exact timestamp remains accessible.
- Include timezone where it affects scheduling or reporting.
- Use thousands separators for large numbers.
- Currency values use the correct currency symbol and precision for the domain; right-align in tables.
- Do not abbreviate financial values in a way that hides exact amounts. If abbreviating a KPI, make the exact amount available.
- Distinguish zero, unknown, unavailable, and not applicable.

---

# 9. System states and resilient behavior

Every page and major component must define its relevant states. Do not implement a page as if the API always succeeds and returns data immediately.

| State | Required behavior |
|---|---|
| Initial loading | Skeleton or localized progress that matches the final content |
| Refreshing | Preserve existing content where safe and show a refresh cue |
| Empty | Explain why there is no content and offer the next valid action |
| No results | Preserve filters and provide a clear reset/recovery path |
| Recoverable error | Explain the failure and provide Retry when safe |
| Permission denied | Explain access limitation and provide a valid next step |
| Not found | Friendly message and route back to a valid destination |
| Offline | Clear connectivity status and safe handling of pending edits |
| Partial failure | Isolate the failed region so unaffected content remains useful |
| Success | Confirm the completed action and update affected UI |
| Disabled | Explain why an action is unavailable when that reason is not obvious |
| Dirty form | Show unsaved state and protect against accidental data loss |
| Stale data | Indicate freshness when the distinction affects a decision |
| Conflict | Explain that data changed elsewhere and provide a safe resolution |
| Rate-limited | Explain when retry is possible if that information is available |
| Long-running job | Show queued/running/completed/failed states and cancellation where supported |

## 9.1 State implementation rules

- Empty is not the same as loading.
- A failed request is not a zero result.
- A hidden or unauthorized record is not necessarily a nonexistent record.
- A retry button must retry the relevant operation and prevent duplicate side effects.
- Preserve user-entered form data whenever possible.
- When a batch action partially succeeds, report both successful and failed records.
- Avoid blank screens, silent failures, and infinite spinners.
- Use a timeout or cancellation strategy appropriate to the operation.
- Do not show a success toast until success is confirmed, except for clearly labeled optimistic actions with reliable rollback.

---

# 10. Accessibility and inclusive interaction

Accessibility is an engineering requirement, not a final visual pass.

## 10.1 Baseline requirements

Target WCAG 2.2 AA.

- Use semantic HTML: `nav`, `main`, `header`, `button`, `form`, and real table elements with proper headers.
- Provide a skip-to-content link.
- All functionality must be keyboard accessible with a visible focus indicator.
- Use logical focus order and do not trap focus outside active dialogs.
- Associate every form input with a label.
- Connect validation and helper text programmatically.
- Icon-only buttons require accessible names.
- Status messages must be announced appropriately without overwhelming screen-reader users.
- Respect reduced motion.
- Support zoom and reflow without losing functionality.
- Touch targets should be at least 44×44px where practical; do not fall below the applicable WCAG minimum target requirements.
- Do not communicate meaning by color alone.
- Avoid focus being hidden behind sticky headers or footers.
- Charts need a text explanation or accessible data alternative.

## 10.2 Dialog and drawer accessibility

- Use appropriate dialog semantics and modal state.
- Move focus into the overlay on open.
- Keep keyboard focus inside a modal while it is open.
- Escape closes only when safe and consistent with the action.
- Return focus to the triggering control on close.
- Give each overlay a meaningful accessible name.
- Do not place critical instructions only in hover tooltips.

## 10.3 Motion

Motion should explain state change, not entertain.

- Fast feedback: approximately 120ms.
- Standard transitions: approximately 180ms.
- Larger drawer transitions: up to 260ms.
- Use the shared easing token.
- Animate opacity, transform, or other properties that avoid unnecessary layout work.
- Avoid parallax, bouncing, repeated decorative motion, and animation that delays action.
- Respect `prefers-reduced-motion`.
- Never use animation as the only indication of a state change.

---

# 11. Permissions, privacy, and safety UX

The frontend must reflect backend authorization, but it is never the security boundary. Server-side permission checks remain mandatory.

- Hide navigation items the role cannot access when that is the product's intended model.
- For actions that should remain discoverable but unavailable, show a disabled state with an explanation.
- Do not render sensitive data merely because the route is reachable.
- Destructive and sensitive operations should be audited where required: actor, action, target, timestamp, and relevant context.
- Prefer archive/soft delete with a defined restore policy over permanent deletion when the data model supports it.
- Show environment context where production/staging confusion could cause harm.
- Mask secrets by default. Reveal only when the security model permits it.
- Personal-data exports, refunds, role changes, account suspension, and permission changes require especially clear scope and authorization.
- Confirm the impact and number of affected records for bulk actions.
- Do not expose private user information in browser URLs, logs, toasts, or analytics events.
- Handle session expiry with a clear warning and a safe way to continue when supported.
- Never treat a client-side role flag as proof of authorization.
- Ensure permission-denied states do not reveal protected resource details.

---

# 12. Data visualization and analytical integrity

Charts must answer a question. Every visualization should have a declared purpose.

Before choosing a chart, ask:

- What comparison or trend should the admin notice?
- Is the time period explicit?
- Are values counts, rates, money, durations, or percentages?
- Is the denominator defined for rates?
- Can the same task be completed more accurately with a table?
- What happens when data is missing, delayed, or filtered to zero?

Rules:

- Label axes and units.
- Show exact values and comparison periods.
- Use consistent scales when comparing charts.
- Avoid truncated axes that exaggerate differences unless the transformation is clearly explained and appropriate.
- Use stable color meanings across reports.
- Do not imply causation from correlation.
- Distinguish “no data”, “not loaded”, “not available”, and zero.
- Provide an accessible text summary and/or table.
- Ensure exports use the same date range, filters, and permission scope as the on-screen report.
- Never invent, interpolate, or hardcode data to make a production visualization appear populated.

---

# 13. Responsive behavior

Responsive design is not merely reducing widths. Preserve the task's essential capabilities at every viewport.

## Desktop (1280px and above)

- Full sidebar, multi-column layout where useful, dense tables, advanced filters.
- Keep primary action and key metadata visible.
- Use available width without stretching readable form content excessively.

## Tablet (768px–1279px)

- Allow collapsible navigation.
- Reduce nonessential table columns before reducing text size.
- Keep high-value filters visible and move secondary filters into a popover.
- Convert multi-column detail layouts into a prioritized stack when needed.

## Mobile (below 768px)

- Off-canvas navigation.
- One-column forms and content.
- Full-screen drawers/sheets for complex detail views.
- Tables may horizontally scroll inside their own container with a clear first identifier column, or become record cards when only a few fields matter.
- Keep primary actions accessible without covering content.
- Use touch-sized controls and prevent hover-only interaction.
- Filter controls become a filter sheet or expandable section.
- Do not hide important status, identity, or consequences simply to fit the screen.

Every major page must be checked at representative widths and with browser zoom. Responsive behavior must be documented when it differs from the default pattern.

---

# 14. Performance and perceived responsiveness

The UI should acknowledge user input immediately and keep context stable.

- Avoid full-page reloads for routine operations.
- Load above-the-fold, task-critical information first.
- Lazy-load lower-priority charts and heavy panels.
- Paginate server-side datasets; virtualize only when justified.
- Debounce search and cancel stale requests.
- Use caching and prefetching only when cache invalidation and freshness semantics are clear.
- Avoid layout shifts by reserving space for images, skeletons, and dynamic content.
- Prevent duplicate submissions.
- Show progress for long operations and allow cancellation when safe.
- Preserve stale content during refresh only when it will not mislead users about high-risk or rapidly changing state.
- Keep transitions short and avoid delaying task completion.
- Measure actual performance rather than assuming a skeleton makes a slow page acceptable.

---

# 15. Implementation architecture and code quality

This document guides UI behavior; it does not override the repository's established framework, routing, state management, API client, or styling conventions.

## 15.1 Shared component architecture

Build reusable components in a shared admin component layer, for example:

- `AdminShell`
- `AdminSidebar`
- `AdminTopbar`
- `PageHeader`
- `Breadcrumbs`
- `Button`
- `TextField`, `Select`, `Checkbox`, `RadioGroup`, `Switch`
- `FilterBar`
- `FilterChip`
- `SavedViews`
- `DataTable`
- `Pagination`
- `StatusBadge`
- `MoneyCell`
- `DateCell`
- `PiiCell`
- `EmptyState`
- `ErrorState`
- `SkeletonTable`
- `InlineAlert`
- `Toast`
- `ConfirmDialog`
- `DetailDrawer`
- `CommandPalette`
- `UnsavedChangesBar`

Names are illustrative. Reuse existing project components when they already meet the contract. Do not create a duplicate design system because a component name differs.

## 15.2 Component API principles

- Prefer explicit typed variants over many unrelated boolean props.
- Use semantic names: `variant="danger"` is clearer than `red`.
- Keep presentation components independent from API calls where possible.
- Keep business rules and authorization decisions outside purely visual primitives.
- Provide slots or composition for content variation without cloning the component.
- Define empty/loading/error behavior for data-bearing components.
- Avoid passing arbitrary style values into every page when a token or variant should exist.
- Make accessible behavior the default rather than a caller opt-in.
- Do not add a shared component before identifying at least one real use case; do not duplicate an existing shared pattern.

## 15.3 Source-of-truth rules for data

- Use real API-backed values in production UI.
- Do not fabricate counts, records, dates, prices, status values, or chart points.
- Distinguish UI formatting from business logic.
- Keep money, dates, percentages, and identifiers consistently formatted.
- Avoid unsafe optimistic updates for financial, permission, or irreversible operations.
- Make API errors actionable without exposing internal details.
- Treat user-provided content and remote text as untrusted; render it safely.
- Do not log tokens, secrets, or unnecessary personal data.
- Respect backend pagination, filtering, sorting, and authorization contracts.

## 15.4 Routing and URL state

- Use stable, shareable URLs for important views and filters.
- Preserve search, sort, filters, page size, and current page where appropriate.
- Use URL state for record drawers only if supported by the router architecture.
- Browser Back should behave predictably.
- Avoid duplicate sources of truth between URL parameters and component state.
- Validate URL parameters before using them.
- Ensure unauthorized routes fail safely.

## 15.5 No fake functionality

Do not deliver:

- Buttons without handlers.
- Filters that only change appearance.
- Export actions that ignore filters.
- Saved views stored only in local component state when the requirement is server-side persistence.
- Fake loading percentages.
- Mock data presented as production data.
- Toasts that announce unconfirmed success.
- Dead keyboard shortcuts.
- Placeholder links or actions described as complete.
- Empty catch blocks or swallowed API errors.

If backend support is missing, implement the UI contract only when requested, clearly mark the integration gap, and do not claim end-to-end completion.

---

# 16. Page-level design specification template

Before implementation, capture the following for each significant page. Keep it concise enough to be useful.

```md
## Page: [Name]

### Job to be done
- Primary actor:
- Main task:
- Task frequency:
- Expected data volume:
- Risk level:

### Information hierarchy
- P0 — Critical:
- P1 — Primary:
- P2 — Supporting:
- P3 — Rare:

### Layout
- Page header:
- Primary action:
- Search and filters:
- Main content pattern:
- Secondary content:
- Responsive adaptation:

### Interaction contract
- Entry and navigation:
- Main success path:
- Cancel/back behavior:
- Confirmation requirements:
- Keyboard behavior:
- URL state:
- Undo/recovery:

### States
- Initial loading:
- Refreshing:
- Empty:
- No results:
- Error:
- Permission denied:
- Partial failure:
- Success:
- Dirty/conflict state:

### Data and permissions
- API/data source:
- Required fields:
- Sorting/filtering/pagination:
- Sensitive data:
- Required permissions:
- Audit requirements:

### Acceptance criteria
- [ ] Main task is clear without explanation.
- [ ] Primary action is unambiguous.
- [ ] All meaningful states are designed.
- [ ] Keyboard and screen-reader behavior is specified.
- [ ] Responsive behavior is specified.
- [ ] No invented data or fake interactions.
- [ ] Tests cover success, failure, and permissions.
```

---

# 17. Quality assurance and definition of done

A page is not complete because it renders or because the happy path works.

## 17.1 Visual QA

- [ ] Uses semantic tokens for color, spacing, radius, typography, and elevation.
- [ ] Follows the established page hierarchy and shared component patterns.
- [ ] Has consistent alignment across title, filters, content, and actions.
- [ ] Uses status colors consistently and never as the sole signal.
- [ ] Avoids unnecessary decoration, nested cards, and duplicated headings.
- [ ] Looks intentional in light and dark themes.
- [ ] Handles narrow viewports and zoom without losing critical controls.
- [ ] Has no clipped content, unintended horizontal page overflow, or unstable layout shifts.

## 17.2 Interaction QA

- [ ] Every visible control performs its stated action.
- [ ] Primary, secondary, destructive, disabled, hover, focus, active, and loading states work.
- [ ] Forms preserve data after recoverable errors.
- [ ] Search and filters work together and reset predictably.
- [ ] Sorting and pagination match the displayed data.
- [ ] Bulk actions report success and failure correctly.
- [ ] Dialogs and drawers manage focus and close behavior correctly.
- [ ] Undo is offered only for genuinely reversible operations.
- [ ] No duplicate submission or stale-response race condition is apparent.
- [ ] Browser Back and URL state behave predictably where supported.

## 17.3 State QA

- [ ] Initial loading.
- [ ] Refreshing.
- [ ] True empty.
- [ ] No search/filter results.
- [ ] Recoverable server error.
- [ ] Permission denied.
- [ ] Partial failure.
- [ ] Success.
- [ ] Offline or network interruption where relevant.
- [ ] Dirty form and concurrent edit where relevant.
- [ ] Long-running job state where relevant.

## 17.4 Accessibility QA

- [ ] Keyboard-only completion is possible.
- [ ] Focus is visible and not obscured.
- [ ] Labels and accessible names are present.
- [ ] Errors are associated with fields.
- [ ] Dialog focus is trapped and restored correctly.
- [ ] Color contrast meets WCAG 2.2 AA.
- [ ] Status is not communicated by color alone.
- [ ] Reduced motion is respected.
- [ ] Table, chart, and dynamic status content has an accessible alternative.

## 17.5 Engineering QA

- [ ] Uses existing repository conventions and shared components.
- [ ] Type checks and linting pass where configured.
- [ ] Relevant unit, integration, and end-to-end tests pass.
- [ ] API contracts and permissions are verified.
- [ ] No secrets or sensitive data are exposed.
- [ ] No fake data or dead controls are introduced.
- [ ] Performance is acceptable with realistic data volume.
- [ ] No unrelated files or workflows are changed without reason.
- [ ] Final summary states what changed, what was tested, and what remains incomplete.

Do not claim a check passed unless it was actually run or verified.

---

# 18. AI agent operating instructions

Any AI agent implementing this system must follow this sequence.

## Phase A — Inspect

1. Read this entire document.
2. Read the relevant product requirements and existing page specifications.
3. Inspect the current component library, routing, styles, state management, API patterns, and tests.
4. Identify which shared components already exist.
5. Verify the data model, permissions, and API behavior before designing interactions.
6. Record material unknowns rather than inventing answers.

## Phase B — Plan

1. Define the task and primary user.
2. Rank information P0–P3.
3. Select the appropriate page archetype and UI patterns.
4. Define all meaningful states and recovery paths.
5. Identify shared components to reuse or extend.
6. Define acceptance criteria before implementation.

## Phase C — Implement

1. Use existing tokens and components.
2. Build or improve shared primitives before duplicating page-specific controls.
3. Keep business logic, API behavior, and visual presentation appropriately separated.
4. Implement keyboard, accessibility, responsive, and error behavior as part of the feature.
5. Use real data and real actions; do not simulate completion.
6. Avoid unrelated refactors and unnecessary dependencies.
7. Deliver complete, runnable files. Do not use `// ...rest of code` placeholders.

## Phase D — Verify

1. Run the relevant tests, type checks, and lint commands available in the repository.
2. Test the happy path, failure path, permission path, and empty state.
3. Inspect the interface at desktop, tablet, and mobile widths.
4. Check light and dark themes.
5. Verify keyboard navigation and focus behavior.
6. Review against the definition of done.
7. Fix issues found before reporting completion.

## Phase E — Report honestly

The implementation report must include:

- What changed.
- Which shared components were created or reused.
- Which pages and states were covered.
- Tests and checks actually run, with outcomes.
- Known limitations and missing backend support.
- Any assumptions made.

Never state “production-ready” merely because the UI renders. Production readiness requires verified behavior, security, accessibility, error handling, and tests appropriate to the change.

---

# 19. Design review rubric

Score each dimension from 1 to 5. A high total cannot compensate for a critical failure in security, accessibility, or data integrity.

| Dimension | 1 — Poor | 3 — Acceptable | 5 — Excellent |
|---|---|---|---|
| Task clarity | Purpose/action unclear | Main task is understandable | Task and next action are immediately obvious |
| Information hierarchy | Everything competes | Important content is prioritized | Decision-critical information is prominent without noise |
| Workflow efficiency | Repeated navigation and input | Reasonable task path | Frequent tasks are streamlined without sacrificing safety |
| Data comprehension | Values lack context | Labels and states are mostly clear | Comparisons, freshness, units, and consequences are explicit |
| Safety | Risky actions are ambiguous | Basic safeguards exist | Proportional safeguards, scope, audit, and recovery are clear |
| Consistency | Page-specific patterns | Mostly shared components | Predictable behavior across all modules |
| Accessibility | Keyboard or semantics fail | Main flows are accessible | Robust keyboard, screen reader, contrast, zoom, and motion support |
| Responsive design | Critical content breaks | Main tasks work | Task-appropriate adaptation across widths |
| Resilience | Empty/error states absent | Common failures handled | Loading, stale, partial, conflict, offline, and recovery states are deliberate |
| Visual craft | Inconsistent spacing and emphasis | Clean and usable | Precise alignment, rhythm, typography, and restrained polish |
| Performance | Blocking or unstable | Acceptable in normal cases | Responsive under realistic data and network conditions |
| Engineering quality | Duplicated or fake UI | Reusable and tested | Typed, composable, accessible, verified, and maintainable |

Reviewers should provide evidence for low scores and identify the smallest changes that would improve the user's task outcome. Do not treat the score as a substitute for testing.

---

# 20. Final non-negotiable rules

1. The design system is a decision framework, not a mandate to make every page look identical.
2. Preserve verified business rules and existing architecture.
3. Reuse shared components; extend them centrally when the pattern is broadly useful.
4. Use semantic tokens; avoid one-off visual values.
5. Choose UI patterns based on task, data volume, risk, and context.
6. Design all meaningful states, not just the happy path.
7. Do not fabricate data, success, capabilities, permissions, or API behavior.
8. Never make security depend on frontend visibility.
9. Treat accessibility and responsive behavior as baseline functionality.
10. Prefer useful, quiet polish over decorative complexity.
11. Validate with tests and realistic interactions, not screenshots alone.
12. Report what is verified and be explicit about what remains unknown.

**The standard:** every admin screen should make the right task easier, the wrong action harder, the current state clearer, and recovery from failure more reliable.
