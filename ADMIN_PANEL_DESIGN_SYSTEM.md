# ADMIN PANEL DESIGN SYSTEM: Master Instructions for AI Models

> **Purpose:** This file is the single source of truth for redesigning and building the admin panel. Any AI model (Claude, GPT, Cursor, Copilot, etc.) that reads this file must follow it exactly. When a rule here conflicts with your default habits, this file wins.
>
> **Goal:** An admin panel that looks professional and premium, and lets an admin finish common tasks in the fewest clicks and seconds possible.

---

## 0. How the AI must use this file

1. **Read the whole file before writing code.** Do not skim.
2. **Never hardcode a color, spacing, radius, shadow or font size.** Always use the tokens in Section 2.
3. **Build the shared components in Section 4 once**, then reuse them on every page. Never rebuild a button, table or modal inside a page.
4. **Every screen must implement all states**: loading, empty, error, partial, success (Section 9).
5. **Before you finish any task, run the Definition of Done checklist** (Section 17) and fix every failure.
6. **If information is missing** (brand color, framework, modules), pick the defaults in this file, state your assumption in one line, and continue. Do not stall.
7. **Do not add features, pages or decoration that were not requested.** Consistency and speed matter more than novelty.
8. **Output complete files.** No `// ...rest of code` placeholders.

### Stack assumptions (override if the project differs)
- React (function components, hooks) + TypeScript if the project already uses it
- Styling via CSS variables (tokens below). Tailwind is allowed only if its theme is mapped to these tokens.
- Icons: Lucide (one icon set only)
- Font: Inter (fallback: system-ui)
- Backend-agnostic. Where Firebase or Firestore is used, follow the data rules in Section 12.

---

## 1. Design philosophy (the 8 laws)

1. **Clarity over cleverness.** An admin is working, not browsing. Every element earns its place.
2. **One primary action per screen.** If everything is highlighted, nothing is.
3. **Density with breathing room.** Show more data than a consumer app, but never crowd it. Use the spacing scale, not guesswork.
4. **Neutral canvas, restrained accent.** 90% neutral colors. The accent color appears only on the primary action, active navigation, links and focus.
5. **Predictability.** The same thing looks and behaves the same everywhere. Filters are always above tables. Save is always bottom-right or top-right, never both.
6. **Speed is a feature.** Fewer clicks, keyboard shortcuts, bulk actions, instant feedback, no full-page reloads.
7. **Safe by default.** Destructive actions are visually separated, confirmed, and (where possible) undoable.
8. **Accessible by default.** Keyboard, screen readers, contrast and reduced motion are requirements, not extras.

---

## 2. Design tokens (copy exactly)

### 2.1 Color tokens

```css
:root {
  /* Neutrals (light) */
  --bg:            #F6F7F9;  /* page canvas */
  --surface:       #FFFFFF;  /* cards, sidebar, topbar, modals */
  --surface-2:     #EEF0F4;  /* table header, hover, subtle fills */
  --surface-3:     #E3E7EE;  /* pressed, selected-neutral */
  --border:        #DFE3EA;  /* default 1px borders */
  --border-strong: #C5CCD8;  /* inputs on hover, dividers needing emphasis */
  --text:          #16202E;  /* primary text */
  --text-2:        #435066;  /* secondary text */
  --muted:         #5D6A7D;  /* labels, helper text, placeholders (min 4.5:1 on surface) */

  /* Accent (default blue; swap only these 4 to rebrand) */
  --accent:        #2F5BEA;
  --accent-hover:  #2449C4;
  --accent-soft:   #E6ECFD;  /* active nav bg, selected row, soft badge */
  --accent-text:   #FFFFFF;

  /* Status */
  --success: #12805C;  --success-soft: #E2F4EC;
  --warning: #A86400;  --warning-soft: #FBEFD9;
  --danger:  #C62F3E;  --danger-soft:  #FBE5E8;
  --info:    #0E7AA8;  --info-soft:    #DFF1F8;

  /* Overlay */
  --overlay: rgba(15, 20, 28, 0.5);
  --focus-ring: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);
}

[data-theme="dark"] {
  --bg: #0F141C;  --surface: #171E29;  --surface-2: #1F2835;  --surface-3: #283243;
  --border: #2B3647;  --border-strong: #3C4A60;
  --text: #E8EDF5;  --text-2: #B9C4D4;  --muted: #93A1B6;
  --accent: #6F93FF;  --accent-hover: #8AA7FF;  --accent-soft: #1D2A4D;  --accent-text: #0B1220;
  --success: #3ECF9B;  --success-soft: #12302A;
  --warning: #F0B04A;  --warning-soft: #36290F;
  --danger:  #FF7B88;  --danger-soft:  #3B1A20;
  --info:    #4CC3F0;  --info-soft:    #10303D;
  --overlay: rgba(0, 0, 0, 0.65);
}
```

**Color usage rules**
| Token | Use for | Never use for |
|---|---|---|
| `--accent` | Primary button, active nav item, links, focus ring, selected checkbox/switch | Backgrounds of large areas, decorative gradients, charts with many series |
| `--success` | Active, paid, published, saved, healthy | Primary buttons |
| `--warning` | Pending, expiring, needs review | Errors |
| `--danger` | Delete, failed, suspended, validation errors | Anything non-destructive |
| `--info` | Tips, neutral notices, new feature hints | Status of records |
| `--muted` | Labels, helper text, timestamps | Body text, button text |

**Hard color rules**
- Ratio target: ~60% `--bg/--surface`, ~30% borders and text, under 10% accent plus status colors.
- Status is **never color alone**. Always pair with a text label or icon.
- Text contrast must be at least 4.5:1 (3:1 for 18px+ or bold 14px+). UI component borders at least 3:1 where they carry meaning.
- No gradients on buttons, cards or headers. One exception: a subtle gradient in chart area fills.
- No pure black (`#000`) or pure white text on pure white backgrounds. Use the tokens.
- Support light and dark from day one. Respect `prefers-color-scheme` and allow manual override.

### 2.2 Spacing scale (4px base)

```css
:root {
  --s-1: 4px;   --s-2: 8px;   --s-3: 12px;  --s-4: 16px;
  --s-5: 24px;  --s-6: 32px;  --s-7: 48px;  --s-8: 64px;
}
```
Use **only** these values for padding, margin and gap. No `13px`, `18px`, `22px`.

| Context | Value |
|---|---|
| Inside buttons (horizontal) | `--s-4` (16px); compact: `--s-3` |
| Inside inputs | `--s-3` horizontal |
| Card padding | `--s-5` (24px); compact card `--s-4` |
| Gap between cards | `--s-4` (16px) |
| Gap between form fields | `--s-4` |
| Gap between page sections | `--s-5` to `--s-6` |
| Page content padding | `--s-5` desktop, `--s-4` mobile |
| Label to field | `--s-1` |

### 2.3 Radius, borders, shadows

```css
:root {
  --r-sm: 6px;    /* inputs, buttons, chips, menu items */
  --r-md: 10px;   /* cards, tables, dropdowns */
  --r-lg: 14px;   /* modals, drawers (inner edge), command palette */
  --r-full: 999px;/* badges, avatars, switches */

  --border-w: 1px;

  --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.06);               /* cards at rest: prefer border, use this sparingly */
  --shadow-md: 0 4px 12px rgba(16, 24, 40, 0.10);              /* dropdowns, popovers */
  --shadow-lg: 0 12px 32px rgba(16, 24, 40, 0.16);             /* modals, drawers, command palette */
}
```
Rules: cards use **1px border**, not shadows. Shadows are only for things that float above the page (menus, modals, toasts). Never stack a shadow and a thick border.

### 2.4 Typography

```css
:root {
  --font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace; /* IDs, code, logs only */

  --fs-xs: 12px;  --lh-xs: 16px;   /* helper text, badges, table meta */
  --fs-sm: 13px;  --lh-sm: 20px;   /* dense table cells, secondary labels */
  --fs-md: 14px;  --lh-md: 22px;   /* DEFAULT body, inputs, buttons, table cells */
  --fs-lg: 16px;  --lh-lg: 24px;   /* card titles, emphasized text */
  --fs-xl: 20px;  --lh-xl: 28px;   /* section titles */
  --fs-2xl: 24px; --lh-2xl: 32px;  /* page titles */
  --fs-3xl: 30px; --lh-3xl: 38px;  /* big stat numbers only */

  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600;
}
body { font-family: var(--font); font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text); font-variant-numeric: tabular-nums; }
```

| Element | Size / weight |
|---|---|
| Page title | 24px / 600 |
| Section / card title | 16–20px / 600 |
| Body, input text, table cell | 14px / 400 |
| Table header | 12–13px / 600, `--muted` |
| Helper, caption, timestamp | 12px / 400, `--muted` |
| Stat number | 30px / 600 |
| Button label | 14px / 500 |

Rules: sentence case everywhere (not Title Case, not ALL CAPS). One font family. Numbers in tables use `tabular-nums` and are right-aligned. Line length for prose maximum 65 characters. Never go below 12px.

### 2.5 Layout constants, z-index, motion, breakpoints

```css
:root {
  --sidebar-w: 248px;  --sidebar-w-collapsed: 68px;
  --topbar-h: 60px;
  --content-max: 1440px;   /* fluid below; center above */
  --form-max: 720px;
  --drawer-w: 480px;  --drawer-w-wide: 720px;
  --row-h: 48px;  --row-h-compact: 36px;  --row-h-comfortable: 56px;
  --control-h: 36px;  --control-h-sm: 30px;  --control-h-lg: 44px;

  --z-sticky: 10;  --z-sidebar: 20;  --z-dropdown: 40;
  --z-drawer: 60;  --z-modal: 70;    --z-toast: 90;  --z-tooltip: 100;

  --dur-fast: 120ms;  --dur-base: 180ms;  --dur-slow: 260ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

**Breakpoints:** `sm 640` / `md 768` / `lg 1024` / `xl 1280` / `2xl 1536`.

---

## 3. App shell and layout architecture

```
+------------------------------------------------------------+
| SIDEBAR  |  TOPBAR  (search . quick-create . bell . user)  |
| 248px    +-------------------------------------------------+
| logo     |  BREADCRUMBS                                    |
| nav      |  PAGE HEADER: Title ............ [Secondary][Primary]
| groups   |  (tabs)                                         |
|          |  FILTER BAR                                     |
|          |  CONTENT (cards / table / form)                 |
| footer   |  PAGINATION / STICKY SAVE BAR                   |
+------------------------------------------------------------+
```

### 3.1 Sidebar (left navigation)
- Width 248px, collapsible to 68px (icons only, tooltips on hover). Persist the state per user.
- Fixed, full height, `--surface` background, `1px --border` on the right. Own scroll area with a thin scrollbar.
- **Structure from top to bottom:** logo/workspace switcher (60px, aligned with topbar), nav groups, spacer, footer (help, collapse toggle, version).
- **Nav item:** height 40px, radius `--r-sm`, icon 18px + label 14px/500, gap 12px, horizontal padding 12px.
  - Default: text `--text-2`, icon `--muted`.
  - Hover: background `--surface-2`.
  - **Active:** background `--accent-soft`, text and icon `--accent`, weight 600, plus a 3px accent bar on the left edge.
  - Optional count badge on the right (neutral pill; danger pill only for things needing action).
- **Groups:** small group labels (12px, `--muted`, sentence case) such as "Manage", "Insights", "System". Maximum 4 groups, maximum 8 top-level items total.
- **Recommended order:** Dashboard, daily-work modules (Users, Content, Orders...), Insights/Reports, then Settings last. Risky or rare tools (Roles, Billing, Audit log, API keys) live under Settings.
- Sub-menus: expand inline, one level only. Never three levels deep.
- Mobile (under 768px): sidebar becomes an off-canvas drawer opened by a hamburger in the topbar, with an overlay.

### 3.2 Topbar
- Height 60px, `--surface`, `1px --border` bottom, sticky.
- Left: hamburger (mobile) + global search trigger (opens command palette; shows `Ctrl K` hint).
- Right, in order: **quick-create "+" menu**, help, notifications bell (dot or count), theme toggle, user avatar menu (profile, preferences, sign out).
- The topbar contains **no page-specific actions**. Those belong in the page header.

### 3.3 Page header
- Breadcrumbs (12–13px, `--muted`, current page not a link) above the title.
- Title 24px/600 on the left. Optional one-line description (14px, `--muted`).
- Right side: actions. **Maximum one primary button**, then secondary buttons, then an overflow "..." menu for the rest. Primary is the right-most item.
- Tabs (if any) sit directly under the header with a 1px bottom border.
- On scroll, the page header may stick under the topbar only for pages with long forms or tables.

### 3.4 Content area
- Background `--bg`; padding `--s-5`. Max width `--content-max`, centered on very wide screens.
- Use a 12-column grid with 16px gaps. Cards span 3, 4, 6, 8 or 12 columns.
- **Never place a card inside a card.** Use a divider or a subtle `--surface-2` block instead.
- The sidebar and topbar stay fixed. Only the content area scrolls.

---

## 4. Component specifications

For every component: sizes come from tokens; implement hover, focus-visible, active, disabled, loading (where relevant).

### 4.1 Buttons

| Variant | Style | Use |
|---|---|---|
| **Primary** | `--accent` bg, `--accent-text` text | The one main action on a screen (Save changes, Add user) |
| **Secondary** | `--surface` bg, `1px --border-strong`, `--text` | Cancel, Export, Back, alternative actions |
| **Ghost** | Transparent, `--text-2`, hover `--surface-2` | Toolbar actions, table row actions, tertiary |
| **Danger** | `--danger` bg, white text | Delete, suspend, revoke. Always behind a confirm |
| **Danger ghost** | Transparent, `--danger` text | Inline "Remove" links in lists |
| **Link** | `--accent` text, underline on hover | Navigation inside text |

- Height: default 36px, small 30px, large 44px. Padding 0 16px. Radius `--r-sm`. Font 14px/500.
- Icon + label gap 8px. Icon-only buttons are square (36x36) and **must** have `aria-label` and a tooltip.
- **Loading:** replace the label with a 16px spinner, keep the width fixed, disable clicks. Never let a user double-submit.
- **Disabled:** 45% opacity, `cursor: not-allowed`. If disabled for a reason, show it in a tooltip.
- Hover: darken by one step (`--accent-hover`). Active: scale 0.98 for 80ms. Focus-visible: `--focus-ring`.
- Button labels are **verb + object**: "Save changes", "Add user", "Delete course". Never "Submit", "OK", "Yes".
- Order in a button group: secondary/cancel on the left, primary on the right. In dialogs, same.

### 4.2 Form controls

**Text input / textarea**
- Height 36px (textarea min 88px), padding 0 12px, radius `--r-sm`, `1px --border-strong`, `--surface` bg, 14px text, placeholder `--muted`.
- Hover: border `--text-2` at 40%. Focus: border `--accent` + `--focus-ring`. Error: border `--danger` + red helper text with icon. Disabled: `--surface-2` bg.
- **Label above the field** (13px/500, `--text`), required marked by a red asterisk or the word "Required" in the helper, **optional** fields marked "(optional)". Helper text below (12px, `--muted`). Error text replaces helper text.
- Leading/trailing icons 16px, 12px inset. Clear (x) button on search inputs.
- Use the correct `type`, `inputmode` and `autocomplete` attributes.

**Select / combobox**
- Same size as input. Chevron on the right. Use a searchable combobox when options exceed 7. Multi-select shows chips (max 3 visible, then "+N").
- Dropdown panel: `--surface`, `--shadow-md`, radius `--r-md`, max height 280px with thin scroll, item height 36px, selected item has a check icon.

**Checkbox / radio / switch**
- 16px box (checkbox), 16px circle (radio), switch 36x20. Accent when on. Label to the right with an 8px gap; the whole label is clickable (minimum hit target 32px high).
- **Switch** applies immediately (settings that save on toggle) and shows a toast. **Checkbox** is part of a form that is submitted with Save.
- Indeterminate state for "select all" checkboxes.

**Date / time / file**
- Date range picker with presets (Today, Last 7 days, Last 30 days, This month, Custom). Always show the selected range as text.
- File upload: dashed drop zone with icon, "Drag a file or browse", accepted types and size limit, progress bar per file, remove button, image thumbnail preview.

**Form layout**
- Single column, max width `--form-max` (720px). Two columns only for short related pairs (First/Last name, Start/End date).
- Group fields into titled sections separated by a divider and `--s-6` spacing. Each section has a title and a one-line description on the left on wide screens (settings pattern).
- **Validation:** validate on blur and on submit, not on every keystroke. On submit failure, scroll to and focus the first error, and show a summary alert at the top if there are 3 or more errors.
- **Unsaved changes:** show a sticky save bar at the bottom ("You have unsaved changes" + Discard + Save changes). Warn before navigating away.
- Keyboard: Enter submits single-line forms, `Ctrl/Cmd + S` saves, Esc cancels/closes.

### 4.3 Filter bar, search and saved views
Always located **directly above the table or list**, in one row, wrapping on small screens.

Order: **Search input (280px)** -> **filter dropdowns** (Status, Role, Date, etc., max 4 visible; extra ones in a "More filters" popover) -> **Reset** (ghost, appears only when a filter is active) -> flex spacer -> **view options** (density toggle, column chooser, export).

- Search is debounced 300ms, matches across name/email/ID, highlights matches in the table, shows a clear (x).
- Selected filter dropdowns turn their label into "Status: Active" with an accent-soft background.
- **Active filter chips** appear under the bar: `Status: Active x`, `Role: Admin x`, with "Clear all". Result count shown ("128 results").
- **Saved views:** tab-like pills above the filter bar ("All", "Needs review", "Suspended", + "Save current view"). Saved views store filters, sort, columns and density. This is a huge efficiency win for repeat tasks.
- **Filters, sort, page and search live in the URL** (query string), so a view can be refreshed, bookmarked and shared.

### 4.4 Data table (the most important component)

**Anatomy:** toolbar (filters) -> optional bulk-action bar -> table -> pagination footer.

- Container: `--surface`, `1px --border`, radius `--r-md`, overflow handled (horizontal scroll inside the container, never the page).
- **Header row:** `--surface-2`, 12-13px/600, `--muted`, height 40px, **sticky** under the topbar. Sortable columns show an arrow on hover and the active sort.
- **Rows:** height 48px (compact 36, comfortable 56), `1px --border` bottom line, hover `--surface-2`, selected `--accent-soft`. Entire row clickable to open the detail drawer or page (except interactive cells).
- **Cell rules:** text left, numbers and currency right, dates in a consistent short format with the full value in a tooltip, truncation with ellipsis and a tooltip, never wrap names to a second line.
- **Column order:** checkbox -> primary identifier (avatar + name + subtitle) -> key attributes -> status badge -> dates -> row actions (always last, right-aligned).
- **Row actions:** a ghost icon "..." menu at the far right, plus at most **one** visible quick action on hover (Edit). Destructive items at the bottom of the menu, separated by a divider, in danger color.
- **Bulk actions:** selecting any row shows a bar above the table: "3 selected | Export | Change status | Delete | Clear". "Select all" offers "Select all 1,284 results".
- **Column chooser** (show/hide, reorder, reset) and **density toggle** are persisted per user.
- **Pagination footer:** "Showing 1-25 of 1,284", rows-per-page (25/50/100), prev/next and page numbers. Use cursor/"Load more" pagination for very large or real-time datasets.
- **Loading:** show 8 skeleton rows with the real column layout. Keep the previous data visible with a subtle top progress bar when refetching (no flash of emptiness).
- **Empty:** icon + "No users match these filters" + "Clear filters" button. For truly empty: "No users yet" + "Add user" button.
- **Mobile:** tables become horizontally scrollable with the first column sticky, or collapse to a card list for 4 or fewer key fields.
- Virtualize rendering when rows exceed ~200 on one page.

### 4.5 Cards
- `--surface`, `1px --border`, radius `--r-md`, padding `--s-5`, no shadow at rest.
- **Card header:** title (16px/600) left, optional action (ghost button or link) right, a 12px gap below. Optional description in `--muted`.
- Clickable cards get hover `--border-strong` and a pointer, plus focus ring, and are a single `<a>` or `<button>`.
- **Stat card:** label (13px, `--muted`) -> big number (30px/600) -> delta pill (+12% in success, -4% in danger, with arrow icon and "vs last 7 days") -> optional 40px sparkline. The whole card links to the filtered list behind the number.
- Dashboard stat row: 4 cards on desktop, 2 on tablet, 1-2 on mobile. Do not exceed 6 stat cards.

### 4.6 Badges, chips, tags
- Badge: height 22px, padding 0 8px, radius full, 12px/500, soft background + matching text + optional 6px dot.
- Mapping: Active/Paid/Published -> success. Pending/Draft/Review -> warning. Failed/Suspended/Overdue -> danger. Info/New -> info. Archived/Unknown -> neutral (`--surface-2`, `--text-2`).
- Maximum 5 distinct statuses per entity. Use the **same label and color** for the same status everywhere in the app.
- Chips (filters, tags) are 28px high, radius `--r-sm`, with an x button, removable by keyboard (Backspace).

### 4.7 Tabs
- Under the page header: underline style, 14px/500, active has a 2px accent underline and `--text` color, inactive `--muted`. Height 44px.
- Tabs switch **views of the same record or page**. They never replace sidebar navigation. Maximum 6; extras go in a "More" menu.
- Deep-linkable (tab in the URL).

### 4.8 Modals (dialogs)
- Use for **confirmations and short tasks (3 fields or fewer)**. Anything larger is a drawer or a page.
- Width: 400 (confirm), 520 (form), 720 (large). Radius `--r-lg`, `--shadow-lg`, overlay `--overlay`, appears with a 180ms fade + 8px rise.
- Structure: title (18px/600) + close x, body, footer with buttons right-aligned (Cancel left, primary right).
- Focus trap, focus moves to the first field or the safest action, Esc closes, click on the overlay closes only non-destructive, non-dirty modals. Return focus to the trigger on close.
- **Destructive confirm pattern:**
  - Title: "Delete 'Intro to Python'?"
  - Body: states consequences and scale: "This removes the course and 312 enrollments. This can't be undone."
  - For high-risk actions, require typing the item name to enable the Danger button.
  - Button text repeats the action: "Delete course" (never "Yes").

### 4.9 Drawers (side panels)
- Slide from the right, width 480px (wide 720px), full height, `--shadow-lg`, 260ms slide.
- Use for: row quick view, quick edit, create forms with up to ~8 fields, filters on mobile, activity logs.
- Header (title, close, optional prev/next record arrows), scrollable body, sticky footer with actions.
- Keeps the table visible behind (dimmed overlay). Opening a row updates the URL (`?id=123`) so it is shareable and back-button friendly.

### 4.10 Dropdown and context menus
- `--surface`, `1px --border`, `--shadow-md`, radius `--r-md`, padding 4px, min width 180px, item height 36px with 8px radius.
- Icon (16px) + label + optional keyboard hint on the right. Groups separated by dividers. Destructive item last in danger color.
- Full keyboard support: arrows, Enter, Esc, type-ahead.

### 4.11 Toasts, alerts, banners
- **Toast:** bottom-right, width 360px, stack up to 3, auto-dismiss in 4s (6s if it has an action; errors persist until dismissed). Left color bar/icon by type. Copy uses the same verb as the action: "User deleted" with an **Undo** action.
- **Inline alert:** within a card or form, soft background + 1px matching border + icon + title + text + optional action. Types: info, success, warning, danger.
- **Page banner:** full-width under the topbar for system-wide notices (maintenance, trial ending). Dismissible only when not critical.
- Prefer **Undo toast** over a confirmation modal for reversible actions (archive, remove from list).

### 4.12 Tooltips and popovers
- Tooltip: dark background, 12px text, max 240px, 300ms delay, triggers on hover and focus, never contains interactive content or critical info.
- Popover: for richer content (filter panels, user preview), click-triggered, closes on Esc and outside click.

### 4.13 Avatars
- Sizes 24 / 32 / 40 / 64, circle, image with fallback initials on a deterministic soft color. Status dot (8px) bottom-right when relevant. Stacked avatar group overlaps by 8px with a "+N" counter.

### 4.14 Charts
- One accent color for single-series; for multi-series use a fixed 6-color palette: accent, `#12805C`, `#A86400`, `#0E7AA8`, `#8B5CF6`, `#64748B` (adjust brightness in dark mode). Never more than 6 series.
- Line = trends over time. Bar = comparisons. Donut = share with 5 or fewer parts. No 3D, no pie with many slices.
- Light gridlines (`--border`), muted axis labels (12px), tooltips on hover with exact values, legend top-left, a date-range control in the card header, and an accessible data table fallback or `aria-label` summary.
- Empty chart state: "No data for this period".

### 4.15 Scrollbars

```css
* { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: var(--r-full); border: 2px solid transparent; background-clip: content-box; }
*::-webkit-scrollbar-thumb:hover { background: var(--muted); background-clip: content-box; }
```
Rules: scroll the **content area**, sidebar and table body, not the whole page chrome. Use `overscroll-behavior: contain` in drawers, menus and modals. Never hide scrollbars on scrollable data areas. Use `scrollbar-gutter: stable` to prevent layout shift.

### 4.16 Command palette (power feature)
- Open with `Ctrl/Cmd + K`. Centered modal, 640px wide, search input on top, results grouped (Pages, Records, Actions, Recent).
- Fuzzy search across navigation, records (users, courses, orders) and actions ("Create user", "Toggle dark mode"). Arrow keys + Enter, shows shortcut hints. This single feature makes the panel feel 10x faster.

### 4.17 Breadcrumbs, pagination, progress, skeletons, empty states
- Breadcrumbs: `Users / Asha Patil`, 13px, separator `/` in `--muted`, collapse the middle on mobile.
- Progress: linear 6px bar for uploads and long jobs, with percentage and a Cancel action. Use a top-of-page 2px accent bar for route transitions.
- **Skeletons** mimic the final layout (same height and width), shimmer 1.2s, disabled under reduced motion.
- **Empty state:** 48px muted icon + title (16px/600) + one-sentence explanation + one primary action. Never a blank area.

---

## 5. Page templates (build these patterns, nothing improvised)

### 5.1 Dashboard
1. Page header: "Dashboard" + date-range picker (default Last 7 days) + "Export".
2. Row of 4 stat cards (the numbers an admin checks every day).
3. Two-column area: main chart (8 cols) + "Needs attention" list (4 cols): pending approvals, failed payments, flagged items, each with a direct action button.
4. Second row: recent activity feed (6 cols) + top items table (6 cols).
- The dashboard answers: "What happened? What needs me now?" Every number is clickable.
- Load above-the-fold cards first; lazy-load charts below.

### 5.2 List page (Users, Courses, Orders...)
Header (title + count + Primary "Add X") -> saved views -> filter bar -> table -> pagination. Row click opens the detail drawer. Bulk actions on selection. Export respects current filters.

### 5.3 Detail page / drawer
- Header: avatar/icon, name, status badge, key meta (ID, created date), actions (Edit primary, "..." overflow).
- Left (8 cols): tabbed sections (Overview, Activity, Billing...). Right (4 cols): summary card, quick actions, related records.
- Activity timeline: newest first, icon + sentence + relative time with absolute time in a tooltip, actor named.

### 5.4 Create / edit page
Breadcrumbs -> title -> sectioned form (max 720px) -> sticky bottom bar [Cancel] [Save draft] [Save changes]. Autosave drafts for long forms. After save: toast + redirect to the detail or list, preserving previous filters.

### 5.5 Settings
Left sub-navigation (General, Team, Roles, Billing, Integrations, Notifications, Security, Audit log) + right content in sectioned cards (title/description left, controls right). Each card saves independently or the page uses a sticky save bar. Danger zone at the very bottom in a red-bordered card.

### 5.6 Analytics / reports
Date range + compare toggle + segment filters at the top, KPI row, then charts, then a detailed table. All filters in the URL. Export CSV/PDF. Scheduled report option.

### 5.7 Login / auth
Centered 400px card on `--bg`, logo, title, fields, one primary button, secondary links (Forgot password). Show/hide password, clear errors ("Incorrect email or password"), 2FA step as a separate screen, loading state on submit. No sidebar.

---

## 6. Efficiency playbook (how it becomes 10x faster to use)

**Clicks and navigation**
1. Command palette (`Ctrl/Cmd+K`) for jump-to-anything and actions.
2. Quick-create "+" menu in the topbar from any page.
3. Detail drawer on row click: view and edit without leaving the list.
4. Dashboard "Needs attention" with inline approve/reject.
5. Prev/next arrows inside drawers to step through records.
6. Remember last used filters, sort, density and columns per page and per user.

**Bulk and repetitive work**
7. Multi-select with bulk actions on every list: status change, assign, tag, export, delete.
8. **Inline editing** for simple fields (click a cell, Enter saves, Esc cancels).
9. Saved views for recurring queries.
10. CSV import with a preview, column mapping and error report; CSV/Excel export that respects filters.
11. Duplicate/clone action for creating similar records.

**Speed and feedback**
12. **Optimistic UI:** update the interface instantly, roll back with an error toast if the request fails.
13. Undo toasts instead of confirm dialogs for reversible actions.
14. Autosave drafts; never lose typed data.
15. Skeletons instead of spinners; keep stale data visible while refetching.
16. Debounce search (300ms), cancel stale requests, cache lists and prefetch on row hover.
17. Paginate everything, virtualize long lists, lazy-load routes and charts.

**Keyboard shortcuts** (show in a `?` help dialog and in menu hints)

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Command palette |
| `/` | Focus search |
| `G` then `D/U/C/O` | Go to Dashboard/Users/Courses/Orders |
| `N` | New item on the current list |
| `J` / `K` | Move down/up in table |
| `Enter` | Open selected row |
| `X` | Select row |
| `E` | Edit |
| `Ctrl/Cmd + S` | Save |
| `Esc` | Close modal/drawer/menu |
| `?` | Show shortcuts |

---

## 7. UX writing rules

- Plain language, active voice, sentence case. Name things the way admins think ("Suspend user", not "Toggle account state").
- **Same verb all the way through:** button "Publish" -> toast "Published" -> log "Asha published Intro to Python".
- Buttons: verb + object. Never "Submit", "OK", "Click here".
- **Errors:** what happened + how to fix. No blame, no apology, no codes alone. "Couldn't save changes. Check your connection and try again."
- **Empty states:** invite action. "No courses yet. Create your first course."
- Confirmations state the consequence and scale. Numbers use thousands separators; dates use one format app-wide (e.g. `18 Oct 2026`), relative time for under 7 days with exact time on hover.
- Currency with symbol and 2 decimals, right-aligned. Never abbreviate in tables without a tooltip.

---

## 8. Roles, permissions and safety UX
- Hide navigation items a role cannot access; **disable** (with a tooltip reason) actions that exist but are not allowed for that user.
- Destructive and sensitive actions (delete, role change, refund, export of personal data) are written to an **audit log** with who, what, when and from where. Surface the audit log in Settings and as an Activity tab on records.
- Prefer **soft delete / archive** with a restore window over permanent delete.
- Show the current role and environment (Production vs Staging) in the topbar; production gets a neutral label, staging a warning-colored one.
- Session timeout warning 2 minutes before expiry with a "Stay signed in" button.
- Never display secrets in full (API keys masked, copy button, reveal once on creation).

---

## 9. State matrix (every screen and component must implement all)

| State | Requirement |
|---|---|
| **Loading (first)** | Skeleton that matches the final layout |
| **Refreshing** | Keep old data visible + thin top progress bar |
| **Empty (no data)** | Icon, explanation, primary action |
| **Empty (no results)** | "No results for these filters", Clear filters button |
| **Error (recoverable)** | Inline alert with reason + **Retry** button |
| **Error (permission)** | "You don't have access", who to ask, back link |
| **Error (404)** | Friendly page with link to Dashboard |
| **Offline** | Banner "You're offline. Changes will sync when you reconnect" |
| **Partial** | If one card fails, only that card shows an error; the rest of the page works |
| **Success** | Toast with the action's name; update the UI immediately |
| **Disabled** | Visible, 45% opacity, tooltip with reason |
| **Dirty form** | Sticky save bar + leave warning |

---

## 10. Accessibility (non-negotiable)
- Semantic HTML first: `<nav>`, `<main>`, `<header>`, `<button>`, `<table>` with `<th scope>`. Do not make clickable `<div>`s.
- Every interactive element is keyboard reachable with a visible `--focus-ring`; logical tab order; skip-to-content link.
- Icon-only controls have `aria-label`. Form inputs have associated `<label>`. Errors use `aria-describedby` and `aria-invalid`. Toasts use `role="status"` (errors `role="alert"`).
- Modals/drawers: `role="dialog"`, `aria-modal`, focus trap, focus return.
- Minimum hit area 32x32px (44x44 on touch). Color is never the only signal. Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Tables: sortable headers announce sort direction (`aria-sort`); selected-count announced on bulk selection.

---

## 11. Responsive behavior

| Width | Behavior |
|---|---|
| >= 1280 | Full sidebar, 12-col grid, drawers 480px |
| 1024-1279 | Sidebar collapsed to icons by default, 8-col layouts stack at 4 cols |
| 768-1023 | Sidebar becomes off-canvas, stat cards 2 per row, tables scroll horizontally |
| < 768 | Single column, topbar with hamburger, tables as scroll or card list, drawers become full-screen sheets, sticky bottom action bar, filters in a bottom sheet |

Touch targets grow to 44px. Never require hover to access an action on touch devices (show the "..." menu persistently).

---

## 12. Performance and data rules
- Budgets: first meaningful render under 1.5s on a mid-range laptop, interaction response under 100ms, route changes under 300ms, bundle per route under 200KB gzipped.
- Code-split by route; lazy-load charts, rich-text editors and the command palette contents.
- **Never load entire collections.** Always paginate with a limit (25/50/100) and cursor or `startAfter` pagination.
- Use server-side filtering, sorting and search; do not filter 10,000 rows in the browser.
- Cache with a data layer (React Query/SWR): stale-while-revalidate, dedupe requests, invalidate on mutation, retry with backoff.
- **Firebase/Firestore specifics (if used):** create composite indexes for every filter+sort combination; use `onSnapshot` real-time listeners only where live data matters (dashboard counters, notifications) and always unsubscribe on unmount; store denormalized counters for dashboard numbers (do not count documents on the client); batch writes for bulk actions (max 500 per batch); enforce permissions with security rules, never only with hidden buttons.
- Debounce inputs, throttle scroll/resize handlers, memoize heavy rows, use stable keys, avoid layout shift (reserve space for images and async content).
- Images: lazy-load, correct dimensions, WebP/AVIF, avatars as small thumbnails.

---

## 13. Recommended code architecture

```
src/
  styles/
    tokens.css            <- Section 2 tokens
    base.css              <- reset, typography, scrollbars, focus
  components/
    ui/                   <- Button, Input, Select, Checkbox, Switch, Badge, Tabs, Tooltip,
                             Modal, Drawer, Dropdown, Toast, Alert, Skeleton, EmptyState,
                             Avatar, Card, StatCard, Pagination, Breadcrumbs, Spinner
    data/                 <- DataTable, FilterBar, SavedViews, BulkActionBar, ColumnChooser
    layout/               <- AppShell, Sidebar, Topbar, PageHeader, PageContent, StickySaveBar
    feedback/             <- CommandPalette, ShortcutsDialog, ConfirmDialog
  features/               <- users/, courses/, orders/ (pages composed ONLY from components above)
  hooks/                  <- useUrlState, useDebounce, useHotkeys, useTheme, usePermissions
  lib/                    <- api client, formatters (date, currency, number), permissions
```
Rules: feature pages contain no raw styling decisions, only composition of shared components. One component, one file, with typed props and documented variants. Add a `/design` route (or Storybook) that renders every component in every state.

---

## 14. Anti-patterns (never do these)
1. Hardcoded hex values, random pixel values, inline styles for spacing/color.
2. More than one primary button per screen, or primary-colored destructive buttons.
3. Rainbow dashboards: many colors, gradients or heavy shadows.
4. Cards inside cards; borders and shadows together; different radii on neighbors.
5. Tables without sticky headers, pagination, empty/loading/error states, or with wrapped names.
6. Filters hidden behind icons without showing active filter state.
7. Modals for long forms; nested modals; modals that open modals.
8. "Are you sure?" with Yes/No. Spinners that block the whole page.
9. Title Case or ALL CAPS labels everywhere; mixed icon sets; emoji as UI icons.
10. Hover-only critical actions; color-only status; placeholder text used as the label.
11. Scrolling the entire page including the sidebar and topbar.
12. Full-collection loads, client-side filtering of big data, uncancelled requests, memory-leaking listeners.
13. Decorative animation. Motion must explain a change (open, close, confirm).
14. Inventing new patterns when a defined one exists in this file.

---

## 15. Step-by-step rebuild order (for the AI)

1. **Tokens and base styles** (Section 2, scrollbars, focus, dark mode).
2. **App shell**: Sidebar, Topbar, PageHeader, content container, responsive behavior.
3. **Core UI**: Button, Input, Select, Checkbox, Switch, Badge, Card, Tabs, Tooltip, Skeleton, EmptyState.
4. **Overlays and feedback**: Modal, Drawer, Dropdown, Toast, ConfirmDialog, Alert.
5. **Data layer UI**: DataTable + FilterBar + Pagination + BulkActionBar + SavedViews, wired to URL state.
6. **Dashboard** (template 5.1).
7. **One full list -> drawer -> edit flow** (e.g. Users) as the reference implementation. Verify it against the Definition of Done.
8. **Replicate** the pattern to every other module.
9. **Power features:** command palette, shortcuts, inline edit, import/export, undo.
10. **Polish pass:** states matrix, accessibility audit, performance audit, copy review.

When given a single page to redesign, always say which template (Section 5) you are applying, then build it using only the shared components.

---

## 16. Reusable prompts for the user to give an AI

**Redesign a page**
> Read ADMIN_PANEL_DESIGN_SYSTEM.md fully. Redesign the [Users] page using template 5.2. Use only the tokens and shared components defined in the file. Implement all states in Section 9. Output complete files. When done, list which Definition of Done items you verified.

**Audit an existing screen**
> Read ADMIN_PANEL_DESIGN_SYSTEM.md. Audit this code against Sections 2, 4, 9, 10 and 14. Return a table of violations (location, rule broken, fix), then give the corrected code.

**Build a new component**
> Read ADMIN_PANEL_DESIGN_SYSTEM.md. Build the [DataTable] component per Section 4.4 with sorting, selection, bulk actions, sticky header, skeleton/empty/error states, and keyboard support. Include a usage example.

**Add efficiency features**
> Read ADMIN_PANEL_DESIGN_SYSTEM.md Section 6. Add the command palette, keyboard shortcuts, saved views and inline editing to the [Courses] module without breaking existing behavior.

---

## 17. Definition of Done (the AI must verify every line)

**Visual**
- [ ] Only tokens used; no hardcoded colors, spacing, radii or font sizes
- [ ] One accent color used only for primary action, active nav, links, focus
- [ ] One primary button per screen; destructive actions use Danger + confirm
- [ ] Cards use 1px borders; shadows only on floating layers
- [ ] Looks correct in light **and** dark mode

**Structure**
- [ ] Uses the app shell; sidebar and topbar fixed, only content scrolls
- [ ] Page header has breadcrumbs, title, actions in the correct order
- [ ] Filters sit directly above tables and are reflected in the URL
- [ ] Follows one of the page templates in Section 5

**Behavior**
- [ ] Loading, refreshing, empty, no-results, error, offline, success states all present
- [ ] Forms validate on blur/submit, focus the first error, warn on unsaved changes
- [ ] Optimistic updates with rollback; undo toast for reversible actions
- [ ] Bulk actions, search debounce, pagination and sorting work server-side
- [ ] Keyboard shortcuts and command palette work

**Quality**
- [ ] Fully keyboard-operable with visible focus; labels, aria attributes and roles present
- [ ] Contrast at least 4.5:1; status never by color alone; reduced motion respected
- [ ] Works at 360px, 768px, 1280px and 1920px widths
- [ ] No console errors/warnings; no layout shift; listeners cleaned up
- [ ] Copy follows Section 7 (verb+object buttons, helpful errors, consistent terms)
- [ ] Code is split into shared components with typed props; no duplicated UI

> **Final instruction to the AI:** When in doubt, choose the option that is more consistent, more accessible and faster for the admin. Do not ask for permission to follow this file; follow it.
