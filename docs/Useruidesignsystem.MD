# USER-SIDE UI/UX DESIGN SYSTEM: Master Instructions for AI Models (BuddyForStudy)

> **Purpose:** This file is the single source of truth for redesigning and building the **learner-facing side** of BuddyForStudy (Home, Explore, My learning, Saved, Course page, Roadmap, Player, Profile, Auth). Any AI model (Claude, GPT, Cursor, Copilot, etc.) that reads this file must follow it exactly. When a rule here conflicts with your default habits, this file wins.
>
> **Companion file:** `ADMIN_PANEL_DESIGN_SYSTEM.md` covers the admin panel. Where both apply, the admin file governs `/admin/*` and this file governs everything else. Shared ideas (tokens, states, accessibility) are repeated here so this file works on its own.
>
> **Goal:** A learner opens the app and, within 3 seconds and 1 click, is back in their lesson. Discovering a new course feels effortless, progress feels rewarding, and nothing on screen is repeated, confusing or unnecessary.

---

## 0. How the AI must use this file

1. **Read the whole file before writing code.** Do not skim.
2. **Never hardcode a color, spacing, radius, shadow or font size.** Use the tokens in Section 2.
3. **Use the Intent Registry (Section 4).** Every action in the product has exactly one canonical label, icon and component. Never invent a new button name for an existing action.
4. **Build the shared components in Section 6 once**, then reuse them on every page. The course card exists once (`CourseCard`) and has variants. Never rebuild it inside a page.
5. **Every screen must implement all states** (Section 12): loading, empty, error, partial, success.
6. **Before you finish any task, run the Definition of Done** (Section 20) and fix every failure.
7. **If information is missing**, choose the defaults in this file, state your assumption in one line, and continue. Do not stall.
8. **Do not add features, pages or decoration that were not requested.** Remove duplicates before adding anything new.
9. **Output complete files.** No `// ...rest of code` placeholders.
10. **When redesigning a page, first list what you removed, what you merged and what you added**, using the Remove / Merge / Add table in Section 5.

### Stack assumptions (override if the project differs)

- React (function components, hooks) + TypeScript, Vite, React Router
- Tailwind is allowed **only** if its theme maps to the CSS-variable tokens below
- Icons: Lucide (one icon set only)
- Font: Inter (fallback: system-ui)
- Backend-agnostic. Where Firebase/Firestore is used, follow Section 16.

---

## 1. Design philosophy (the 10 laws of the learner UI)

1. **Resume first.** The most valuable thing for a returning learner is _continue where I left off_. It is always the biggest, most prominent action on Home.
2. **One intent, one label, one place.** If two buttons do the same thing, delete one. If a button does different things in different places, rename it.
3. **One primary action per card and per section.** A card has at most one text button and one icon button. Everything else is a click on the card or an overflow menu.
4. **State decides the label.** Buttons change with the learner's state (Enroll → Start → Continue → Review). Never show "Start" on a course that is 40% done.
5. **Progress is always visible and always honest.** The same number comes from one source everywhere.
6. **Calm canvas, restrained accent.** About 90% neutral, the accent color only on the primary action, active navigation, links, progress and focus.
7. **Show less, but show what matters.** No filler copy, no empty rows (e.g. "no reviews"), no repeated badges. Add the missing useful information instead (next lesson, time left, outcome).
8. **Motivate without manipulating.** Streaks, badges and goals are encouraging and forgiving (streak freeze, no guilt copy, no fake urgency).
9. **Fast everywhere.** Instant feedback, optimistic updates, skeletons, keyboard shortcuts, search that is reachable from every page.
10. **Accessible by default.** Keyboard, screen readers, contrast, reduced motion and mobile thumbs are requirements, not extras.

---

## 2. Design tokens (copy exactly)

### 2.1 Color tokens

```css
:root {
  /* Neutrals (light) */
  --bg: #f7f6fb; /* page canvas */
  --surface: #ffffff; /* cards, header, modals */
  --surface-2: #f1eff8; /* hover, subtle fills, progress track */
  --surface-3: #e7e4f2; /* pressed, selected-neutral */
  --border: #e2dfee; /* default 1px border */
  --border-strong: #c9c4dd; /* inputs, emphasized dividers */
  --text: #151329; /* primary text */
  --text-2: #403d5c; /* secondary text */
  --muted: #615e7a; /* labels, meta, placeholders (min 4.5:1 on surface) */

  /* Accent (swap only these 4 to rebrand) */
  --accent: #5b3fd9;
  --accent-hover: #4a2fb8;
  --accent-soft: #efeafe; /* active nav bg, selected, soft badge */
  --accent-text: #ffffff;

  /* Status */
  --success: #12805c;
  --success-soft: #e2f4ec;
  --warning: #a86400;
  --warning-soft: #fbefd9;
  --danger: #c62f3e;
  --danger-soft: #fbe5e8;
  --info: #0e7aa8;
  --info-soft: #dff1f8;

  /* Learning-specific */
  --progress: var(--accent); /* progress fill */
  --progress-track: var(--surface-2);
  --streak: #c2410c;
  --streak-soft: #ffedd5;
  --gold: #a86400;
  --gold-soft: #fbefd9; /* badges earned */

  --overlay: rgba(21, 19, 41, 0.5);
  --focus-ring: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);
}

[data-theme="dark"] {
  --bg: #0f0e1a;
  --surface: #181727;
  --surface-2: #211f33;
  --surface-3: #2b2942;
  --border: #2d2b45;
  --border-strong: #423f63;
  --text: #eceaf7;
  --text-2: #bdb9d6;
  --muted: #9a96b8;
  --accent: #8c75ff;
  --accent-hover: #a592ff;
  --accent-soft: #2a2354;
  --accent-text: #0e0b22;
  --success: #3ecf9b;
  --success-soft: #12302a;
  --warning: #f0b04a;
  --warning-soft: #36290f;
  --danger: #ff7b88;
  --danger-soft: #3b1a20;
  --info: #4cc3f0;
  --info-soft: #10303d;
  --streak: #fb923c;
  --streak-soft: #3a1f0b;
  --gold: #f0b04a;
  --gold-soft: #36290f;
  --overlay: rgba(0, 0, 0, 0.65);
}
```

**Color usage rules**

| Token       | Use for                                                                      | Never use for                           |
| ----------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| `--accent`  | Primary button, active nav, links, progress fill, focus ring, selected state | Large backgrounds, decorative gradients |
| `--success` | Completed, Beginner level, saved confirmation                                | Primary buttons                         |
| `--info`    | Intermediate level, tips, neutral notices                                    | Record status                           |
| `--warning` | Advanced level, deadlines, attention                                         | Errors                                  |
| `--danger`  | Sign out of all devices, unenroll, delete account, validation errors         | Anything non-destructive                |
| `--streak`  | Streak flame and streak numbers only                                         | Buttons, text links                     |
| `--gold`    | Earned badges and milestones only                                            | Anything else                           |
| `--muted`   | Meta text, labels, timestamps                                                | Body text, button text                  |

**Hard color rules**

- **One primary color across the whole product.** The primary button, the active nav pill and the Search button are all `--accent`. A navy/dark button is never a primary (the current mismatch of purple vs dark navy is a bug).
- Status and level are **never color alone**. Always include the text ("Beginner", "In progress") or an icon.
- Contrast: text at least 4.5:1, large text/UI borders at least 3:1. Never put text on an image without a scrim.
- No gradients on buttons, cards or headers. Gradients are allowed **only** on generated course covers (Section 6.3).
- Light and dark mode from day one. Respect `prefers-color-scheme` and allow manual override via the profile menu.

### 2.2 Spacing scale (4px base)

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

Use only these. No `13px`, `18px`, `22px`.

| Context                     | Value                                        |
| --------------------------- | -------------------------------------------- |
| Button horizontal padding   | `--s-4` (compact `--s-3`)                    |
| Card padding                | `--s-4` for course cards, `--s-5` for panels |
| Gap between cards in a grid | `--s-5`                                      |
| Gap between page sections   | `--s-6` to `--s-7`                           |
| Page horizontal padding     | `--s-6` desktop, `--s-4` mobile              |
| Label to field              | `--s-1`                                      |

### 2.3 Radius, borders, shadows

```css
:root {
  --r-sm: 8px; /* buttons, inputs, chips */
  --r-md: 12px; /* cards, dropdowns */
  --r-lg: 16px; /* hero cards, modals */
  --r-full: 999px; /* badges, avatars, icon buttons */
  --shadow-sm: 0 1px 2px rgba(21, 19, 41, 0.06);
  --shadow-md: 0 6px 16px rgba(21, 19, 41, 0.1); /* hover lift, dropdowns */
  --shadow-lg: 0 16px 40px rgba(21, 19, 41, 0.18); /* modals, command palette */
}
```

Cards use a **1px border** at rest. Hover on clickable cards: border `--border-strong` + `--shadow-md` + `translateY(-2px)` (180ms, disabled under reduced motion).

### 2.4 Typography

```css
:root {
  --font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --fs-xs: 12px;
  --lh-xs: 16px; /* minimum size anywhere: badges, meta */
  --fs-sm: 13px;
  --lh-sm: 20px; /* secondary meta, helper text */
  --fs-md: 15px;
  --lh-md: 24px; /* DEFAULT body, buttons, inputs */
  --fs-lg: 17px;
  --lh-lg: 26px; /* card titles */
  --fs-xl: 22px;
  --lh-xl: 30px; /* section titles */
  --fs-2xl: 30px;
  --lh-2xl: 38px; /* page titles */
  --fs-3xl: 40px;
  --lh-3xl: 48px; /* Home greeting, big stat numbers */
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;
}
body {
  font-family: var(--font);
  font-size: var(--fs-md);
  line-height: var(--lh-md);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
```

| Element                  | Size / weight            |
| ------------------------ | ------------------------ |
| Home greeting            | 30-40px / 700            |
| Page title               | 30px / 700               |
| Section title            | 22px / 600               |
| Course card title        | 17px / 600 (max 2 lines) |
| Body, buttons, inputs    | 15px / 400-500           |
| Meta (duration, lessons) | 13px / 400, `--muted`    |
| Badge, chip              | 12px / 600               |
| Stat number              | 30-40px / 700            |

Rules: **sentence case everywhere** (not Title Case, not ALL CAPS). The small uppercase "eyebrow" labels with wide tracking (e.g. "ARTIFICIAL INTELLIGENCE", "YOUR LEARNING COMMAND CENTER") are **removed**; categories use a normal-case 12px chip or text. Nothing below 12px, ever. One font family.

### 2.5 Layout constants, motion, breakpoints

```css
:root {
  --header-h: 64px;
  --content-max: 1280px;
  --reading-max: 720px;
  --control-h: 40px;
  --control-h-sm: 32px;
  --control-h-lg: 48px;
  --z-sticky: 10;
  --z-dropdown: 40;
  --z-modal: 70;
  --z-toast: 90;
  --z-tooltip: 100;
  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-slow: 260ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

**Breakpoints:** `sm 640` / `md 768` / `lg 1024` / `xl 1280` / `2xl 1536`.

---

## 3. App shell and navigation

```
Desktop
+--------------------------------------------------------------+
| Logo   Home  Explore  My learning  Saved     [Search Ctrl K]  🔔  ☾  (Avatar ▾) |
+--------------------------------------------------------------+
|  Page header: Title ................................. [Primary]  |
|  Content                                                       |
+--------------------------------------------------------------+

Mobile
+----------------------+
| Logo        🔍  🔔 Avatar |
| Content                 |
| [Home][Explore][Learn][Saved] <- bottom tab bar
+----------------------+
```

### 3.1 Primary navigation (exactly 4 items)

| Order | Label           | Route                              | Replaces      |
| ----- | --------------- | ---------------------------------- | ------------- |
| 1     | **Home**        | `/home` (was `/dashboard`)         | "Dashboard"   |
| 2     | **Explore**     | `/explore` (was `/courses`)        | "Courses"     |
| 3     | **My learning** | `/my-learning` (was `/my-courses`) | "My Learning" |
| 4     | **Saved**       | `/saved`                           | "Saved"       |

Keep old routes as redirects. **The page title equals the nav label** (Explore page title is "Explore", not "All available courses").

- Desktop: top header, `--surface`, 1px bottom border, sticky. The nav is a text-link row (not a pill container); the active item has `--accent` text, weight 600 and a 2px accent underline. The active label must always meet 4.5:1 contrast. (Current bug: active "Dashboard" text is invisible on the dark pill. Never put dark text on a dark fill.)
- Mobile (under 768px): the same 4 items become a **bottom tab bar** (icon + label, 56px high, safe-area padding). The header keeps only logo, search icon, bell and avatar.
- **Search** lives in the header on every page (opens the command palette, Section 8.3). The big "Find a course" search bar appears only on Explore.

### 3.2 Header right side (in order)

Search trigger → Notifications bell → Avatar menu. Nothing else.

**Avatar menu** contains: name + email, **Profile**, **Settings**, **Theme** (Light / Dark / System), **Help and shortcuts**, divider, **Sign out**.

- The standalone logout icon next to the name is **removed** (accidental clicks). The standalone moon icon and settings gear are **moved into** the avatar menu.
- Bell opens a popover with unread count (a number, not just a dot) and "Mark all as read".

### 3.3 Footer

- When signed in, show a **slim** footer only (copyright + Help, Privacy, Terms). Never show marketing columns, "Sign in", "Pricing" or "Get started" to a logged-in learner.
- The full marketing footer appears only on public pages (landing, pricing, login).

### 3.4 Page header

Title (30px/700) left, optional one-line description (`--muted`), **at most one primary button** on the right. Breadcrumbs only on deep pages (Course page, Roadmap, Player). No eyebrow label above the title.

---

## 4. The Intent Registry (the fix for duplicate and confusing buttons)

**Rule: every user intent has one canonical label, one icon and one component. If a screen needs the same intent in two places, both use the same label and the same component. Two different labels for the same intent are forbidden.**

| Intent                         | Canonical label                                         | Icon                | Component / placement                                             | Replaces (delete these)                          |
| ------------------------------ | ------------------------------------------------------- | ------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| Open a course page             | _(click anywhere on the card)_                          | none                | Whole card is a single link                                       | "View Course" button, circular arrow `>` button  |
| Enroll in a course             | **Enroll free** (free) / **Enroll** (paid)              | `Plus`              | Card footer primary, Course page hero                             | "View Course" used as enroll                     |
| Begin an enrolled course, 0%   | **Start**                                               | `Play`              | Card footer primary, My learning, Home                            | "Start learning"                                 |
| Continue an in-progress course | **Continue**                                            | `Play`              | Card footer primary, Home resume card                             | "Resume", "Start learning"                       |
| Revisit a finished course      | **Review**                                              | `RotateCcw`         | Card footer primary                                               | "View Course" on completed                       |
| Save for later                 | _(icon only; label "Save" / "Saved" in tooltip + aria)_ | `Bookmark` / filled | Top-right of card image, Course page                              | "Save" text button on every card                 |
| See the learning plan          | **Roadmap**                                             | `Map`               | A tab on the Course page; overflow-menu item on My learning cards | "View roadmap" button on every card              |
| Try before enrolling           | **Preview**                                             | `Eye`               | Text link on the Course page hero                                 | "Preview course" button on every card            |
| Browse more courses            | **Explore** (nav) / **See all** (section links)         | `ArrowRight`        | Nav + section header links                                        | "Explore learning", "View all", "Browse Courses" |
| Build an AI-made plan          | **Build my path**                                       | `Sparkles`          | Explore header, Home empty state                                  | "Build with AI"                                  |
| Leave the app                  | **Sign out**                                            | `LogOut`            | Inside avatar menu only                                           | Standalone logout icon                           |
| Remove from my courses         | **Unenroll**                                            | `Trash2`            | Overflow menu → confirm dialog                                    | n/a                                              |

### 4.1 Button state machine (course primary action)

| Learner state      | Button                              | Status chip            | Progress bar                |
| ------------------ | ----------------------------------- | ---------------------- | --------------------------- |
| Not enrolled, free | **Enroll free**                     | none                   | none                        |
| Not enrolled, paid | **Enroll** + price on the card meta | none                   | none                        |
| Enrolled, 0%       | **Start**                           | Not started            | Empty track (visible)       |
| In progress        | **Continue**                        | In progress            | Filled + "12 of 40 lessons" |
| Completed          | **Review**                          | Completed (check icon) | Full                        |

- "Enrolled" is a **status chip**, never a button.
- A Continue button deep-links to the **next unfinished lesson**, not the course overview.
- "Resume" and "Start learning" are retired words. Use **Continue** and **Start** only.

### 4.2 Duplicate-action checklist (apply to every screen)

Before finishing a screen, answer: (1) Is there any action reachable by two buttons with different names? (2) Is any button a copy of "click the card"? (3) Does any label differ between pages for the same intent? Fix all "yes" answers.

---

## 5. Remove / Merge / Rename / Add (what to change in the current product)

### 5.1 Remove

| Remove                                                                                                    | Why                                                                               |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Circular arrow button on every card                                                                       | Duplicates the card click and the main button                                     |
| "View Course" button on catalog cards                                                                     | Duplicates card click; replace with the state-based primary                       |
| "Preview course" full-width button on every card                                                          | Heavy; moves to the Course page                                                   |
| Duplicate "Free" label (top and bottom of the card)                                                       | Show price once, only when paid. A free-only catalog needs no "Free" chip at all  |
| "★ New (no reviews)" row                                                                                  | Empty information. Show a rating only once it exists; otherwise show lesson count |
| "Enrolled" badge on every My learning card                                                                | Redundant on a page of enrolled courses; replaced by a status chip                |
| Brand eyebrow "BUDDYFORSTUDY" above "My Learning"                                                         | Repeats the logo                                                                  |
| Eyebrow "YOUR LEARNING COMMAND CENTER"                                                                    | Jargon; replaced by a greeting                                                    |
| Machine-written descriptions ("AI-selected X stage for a Beginner learner, ordered after prerequisites.") | Says nothing; replaced by an outcome sentence                                     |
| Subtitle "13 published courses available. Browse the full catalog, not only popular courses."             | Internal developer copy                                                           |
| "Find a course / Search topics or build with AI" floating label                                           | Redundant; the placeholder does the job                                           |
| Standalone moon, gear and logout icons in the header                                                      | Moved into the avatar menu                                                        |
| Sign in / Pricing / Get started in the logged-in footer                                                   | Wrong audience                                                                    |
| Leaked internal category "AI COURSE SEARCH"                                                               | Internal source name; map it to a real category                                   |
| Native browser `<select>` filters                                                                         | Replaced by custom filter chips                                                   |

### 5.2 Merge

| Merge                                                                  | Into                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| Resume (Home), Start learning (My learning), View Course, Enrolled     | One state-based primary (Section 4.1)             |
| "Explore learning", "View all", "Browse Courses"                       | **Explore** (nav) and **See all** (section links) |
| Stats "Completed lessons" and "18 lessons completed" under Active days | One metric, one source (Section 11)               |
| Card meta "Self-paced" and "19 study days at 120 min/day"              | One meta pattern (Section 6.2)                    |
| Category labels across catalog                                         | One category taxonomy (Section 10.3)              |

### 5.3 Rename (reimagined names)

| Current                                     | New                                                 | Notes                           |
| ------------------------------------------- | --------------------------------------------------- | ------------------------------- |
| Dashboard                                   | **Home**                                            | Where you land and continue     |
| Courses                                     | **Explore**                                         | Discovery, not a database table |
| My Learning                                 | **My learning**                                     | Sentence case                   |
| Your learning command center                | _(delete)_                                          | Use "Welcome back, Yashodip"    |
| Explore learning (button)                   | **Continue: {course name}**                         | The most useful action          |
| Build with AI                               | **Build my path**                                   | Describes the outcome           |
| Recommended for you / Keep exploring        | **Picked for you**                                  | Each card shows a reason line   |
| Achievements / "Small wins compound."       | **Badges**                                          | Short, concrete                 |
| Current streak "1 days"                     | **1-day streak**                                    | Pluralize: 1 day, 2 days        |
| Active learning days                        | **Days studied**                                    |                                 |
| Completed lessons                           | **Lessons done**                                    |                                 |
| Avg. progress                               | **Overall progress**                                |                                 |
| Self-paced / "19 study days at 120 min/day" | **Self-paced · 12 lessons** / **19 days · 2 h/day** |                                 |
| Level labels                                | **Beginner, Intermediate, Advanced**                | Always the same three           |
| Resume / Start learning                     | **Continue / Start**                                |                                 |
| View roadmap                                | **Roadmap**                                         | A tab, not a card button        |
| Enrolled (button)                           | **Enrolled** (status chip only)                     |                                 |

### 5.4 Add (what is missing and worth having)

| Add                                                                                                         | Where             | Why                                            |
| ----------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------- |
| **Resume hero card** with thumbnail, next lesson title, time left and **Continue**                          | Top of Home       | Fastest path back to learning                  |
| **Daily goal** (minutes or lessons) and a 7-day week strip                                                  | Home              | Gives the streak meaning                       |
| **Streak freeze** (1 per week) and forgiving copy                                                           | Streak card       | Prevents streak anxiety                        |
| **Reason line** on recommendations ("Because you're learning JavaScript") and exclusion of enrolled courses | Picked for you    | Trust and relevance                            |
| **Sort, filter chips, result count, clear filters**                                                         | Explore           | Findability                                    |
| **Search, sort, status filter** (All / In progress / Not started / Completed)                               | My learning       | 20+ courses is unmanageable without it         |
| **Progress bar and "x of y lessons"** on every enrolled card                                                | My learning, Home | Progress must be visible                       |
| **Generated cover fallback**                                                                                | All cards         | Consistent look when thumbnails are missing    |
| **Course page** with outcomes, curriculum, duration, who it's for, Preview, Roadmap tab                     | `/course/:id`     | Decision support before enrolling              |
| **Command palette** (`Ctrl/Cmd + K`)                                                                        | Global            | Jump to anything                               |
| **Onboarding** (goal, level, time per day)                                                                  | First sign-in     | Makes picks and plans relevant                 |
| **Badge cards** with icon, name, description and locked state with progress                                 | Home, Profile     | Achievements need to be visible and meaningful |
| **Skeletons, empty states, toasts with Undo**                                                               | Everywhere        | Polish and trust                               |
| **Notes and bookmarks inside lessons**                                                                      | Player            | Study tools learners expect                    |

---

## 6. Component specifications

For every component implement: default, hover, focus-visible, active, disabled, loading (where relevant). Sizes come from tokens.

### 6.1 Buttons

| Variant       | Style                                                             | Use                                             |
| ------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| **Primary**   | `--accent` bg, `--accent-text` text                               | Exactly one main action per card/section/screen |
| **Secondary** | `--surface` bg, `1px --border-strong`, `--text`                   | Alternative actions (Roadmap, Cancel)           |
| **Ghost**     | Transparent, `--text-2`, hover `--surface-2`                      | Toolbar, overflow, tertiary                     |
| **Icon**      | 40x40 (32 small) round ghost, **requires** `aria-label` + tooltip | Save, notifications, overflow                   |
| **Danger**    | `--danger` bg, white text, always confirmed                       | Unenroll, delete account                        |
| **Link**      | `--accent` text, underline on hover                               | In-text navigation, "See all"                   |

- Height 40 (small 32, large 48), radius `--r-sm`, 15px/500. Icon + label gap 8px.
- Labels never wrap: `white-space: nowrap`. If a button does not fit, the layout is wrong (make it full width or shorten the label). Two-line buttons like "Start / learning" are a bug.
- Loading: spinner replaces the label, width is fixed, double-submit is blocked.
- Labels are **verb or verb + object** and come only from the Intent Registry. Never "Submit", "OK", "Yes", "Click here".
- Group order: secondary left, primary right.
- Never show two primary buttons in the same card or the same viewport section.

### 6.2 CourseCard (the single most important component)

One component, five variants. Anatomy (top to bottom):

```
+----------------------------------+
| [Cover 16:9]        [Save icon ⌑]|   <- bookmark top-right; status chip bottom-left (when relevant)
+----------------------------------+
| Category · Level                 |   <- 12px, sentence case, text only, no uppercase
| Course title (max 2 lines)       |   <- 17px/600
| One-line outcome (max 2 lines)   |   <- 13-15px, --text-2
| ▰▰▰▱▱▱  12 of 40 lessons         |   <- enrolled only
| 🕒 19 days · 2 h/day   ·  40 lessons |  <- meta row, always the same pattern
| [   Primary button (state)   ]   |   <- ONE button
+----------------------------------+
```

Rules:

- The **entire card is one link** to the course page (focusable, one tab stop). The Save and the primary button are separate controls that stop propagation.
- **Exactly one text button** (state-based per Section 4.1) and **one icon button** (Save). Nothing else.
- **Level** is text in the category line ("AI · Beginner"), not a badge over the image. Badges never cover the cover artwork.
- **Price:** show nothing when free (if the whole catalog is free, show nothing at all); show "₹499" in the meta row when paid.
- **Rating:** show "4.7 (1.2k)" only when reviews exist. Otherwise omit.
- **Meta row pattern (fixed):** `{duration} · {lesson count}`. Duration is "19 days · 2 h/day" for structured plans or "Self-paced" otherwise. Always show lesson count.
- Titles clamp to 2 lines, descriptions to 2 lines; the footer is pinned with `margin-top: auto` so buttons align across a row.
- Truncated text has a `title` tooltip with the full text.

Variants: `catalog` (Explore, Saved), `enrolled` (My learning, shows progress), `recommended` (adds a reason line under the title), `compact` (Home continue list rows), `horizontal` (search results).

**Grid:** `repeat(auto-fill, minmax(260px, 1fr))`, gap `--s-5`. Never leave a half-empty row by hard-coding 5 columns; sections with few items use the same card width and left-align.

### 6.3 Cover image and fallback

- Always 16:9, `object-fit: cover`, lazy-loaded with reserved space.
- Use the real thumbnail only if it passes: not blank, no large baked-in text being cropped, not a face/photo unrelated to the course. Otherwise use the **generated cover**.
- **Generated cover:** deterministic gradient from the course category (8 hues from the category taxonomy), a large Lucide category icon centered at 40% opacity white, and the first 2 words of the title in 20px/700 white at bottom-left on a darkening scrim. This is the only allowed gradient in the product.
- A 40% black-to-transparent bottom scrim sits under any overlay text or chip on a cover.
- Never use the identical graduation-cap placeholder for different courses.

### 6.4 Badges, chips, status

- Badge height 24px, padding 0 8px, radius full, 12px/600, soft bg + matching text + optional icon.
- **Level:** Beginner = success, Intermediate = info, Advanced = warning. Always a text label.
- **Status:** Not started = neutral, In progress = accent-soft, Completed = success with check icon.
- **Category:** plain 12px `--muted` text with a 6px colored dot (category hue). No pill, no uppercase.
- Maximum 2 badges per card. The same status always has the same label and color in the whole app.

### 6.5 Progress

- Bar height 6px, radius full, track `--progress-track` (**always visible even at 0%**, never invisible), fill `--progress`, `role="progressbar"` with `aria-valuenow`.
- The percentage or "12 of 40 lessons" sits directly beside or under the bar, not at the far edge of the row.
- Completed: fill `--success` with a check icon.
- Ring variant for the Home goal tile (56px, 6px stroke).

### 6.6 Stat tile (Home)

Label (13px `--muted`) → number (30-40px/700) → optional delta or secondary line ("2 completed", "+3 this week"). Equal widths in a grid, icon in a 40px tinted circle. Maximum 4 tiles. The whole tile links to the list behind the number where one exists. **Pluralize every count** with a shared helper (`pluralize(n, 'day')` → "1 day", "2 days").

### 6.7 Streak and daily goal

- Streak tile: flame icon, "**3-day streak**", "Longest: 12 days", a 7-dot week strip (M T W T F S S) with studied days filled, and a one-line nudge ("Study today to reach 4 days"). If a day was missed and a freeze is available, say so ("Streak freeze used").
- Daily goal: ring + "25 of 30 min today". Goal is editable in Settings.
- No guilt copy ("You lost your streak!"). Use "Start a new streak today."

### 6.8 Badges (achievements)

- Card: 64px icon in a circle (`--gold-soft` when earned, `--surface-2` greyscale when locked), name (15px/600), one-line description, locked progress ("2 of 5 days").
- Earned badges animate once (scale + confetti, 600ms, reduced-motion safe) and trigger a toast "Badge earned: First step".
- Show 3 on Home + "See all"; full grid on Profile.

### 6.9 Forms and inputs

- Height 40px, padding 0 12px, radius `--r-sm`, `1px --border-strong`, label above (13px/500), helper below (12px). Focus: border `--accent` + `--focus-ring`. Error: red border + icon + text.
- Validate on blur and submit. Show/hide password. Correct `type`, `autocomplete`, `inputmode`.
- Switches save immediately with a toast; checkboxes are part of a form with Save.

### 6.10 Filters, sort and search (Explore, My learning, Saved)

Order in one row: **Search (flex)** → **Level** → **Category** → **Sort** → **More filters** (Free/Paid, Duration) → **Reset** (only when active).

- Custom dropdowns (no native `<select>`). Selected filters read "Level: Beginner" with `--accent-soft`.
- Active filter chips under the bar with an ✕ and "Clear all". Result count: "13 courses".
- Sort options: **Recommended, Newest, Shortest, Most popular**. My learning also: **Recently active, Progress, A to Z**.
- Search is debounced 300ms, shows suggestions (topics, courses), highlights matches, has a clear button, supports `/` to focus.
- Filters, sort and search live in the **URL query string** (shareable, back-button safe) and persist per user.

### 6.11 Tabs

Underline style, 15px/500, active 2px accent underline, height 44px, counts as small neutral pills ("In progress 21"). Tabs switch views of the same page (My learning: In progress / Completed; Course page: Overview / Curriculum / Roadmap / Reviews). Deep-linkable.

### 6.12 Modals, sheets, toasts, tooltips

- **Modal** for confirmations and short tasks (3 fields or fewer), width 400/520, radius `--r-lg`, focus trap, Esc closes, focus returns to the trigger. On mobile, modals become bottom sheets.
- **Confirm pattern:** title "Unenroll from JavaScript Fundamentals?", body states the consequence ("Your progress is kept for 30 days."), buttons **Cancel** and **Unenroll**. Never Yes/No.
- **Toasts:** bottom-center on mobile, bottom-right on desktop, 4s, errors persist, with **Undo** for reversible actions (Save, Unenroll). Copy repeats the action: "Saved to your list. Undo".
- **Tooltips:** 300ms delay, on hover and focus, never hold critical info. Every icon-only control has one.

### 6.13 Avatars and profile menu

32px circle, image or initials on a deterministic soft color, menu per Section 3.2.

### 6.14 Skeletons, empty states, errors

See Section 12. Skeletons use the real card layout (same height), shimmer 1.2s.

---

## 7. Page templates (build these, nothing improvised)

### 7.1 Home (`/home`)

Order from top:

1. **Greeting row:** "Welcome back, Yashodip" (first name only, no full stop) + one line of context ("You're 3 lessons from finishing Deep Learning"). Primary button **Continue: {course name}** on the right. No second button.
2. **Resume card (large):** thumbnail, course title, _Next: Lesson 4 · Backpropagation_, progress bar with "12 of 40 lessons · about 3 h left", **Continue**. If nothing is in progress: an empty state with **Explore** and **Build my path**.
3. **Row of 3-4 stat tiles:** Streak (with week strip), Today's goal (ring), Lessons done, Overall progress. Every number has one definition (Section 11).
4. **Continue learning:** the next 2 in-progress courses as `compact` cards (not a repeat of the resume course) + **See all** (links to My learning).
5. **Badges:** 3 cards (earned or closest to unlock) + **See all**.
6. **Picked for you:** 4 `recommended` cards, **excluding enrolled courses**, each with a reason line.

Home answers: "Where was I? What's next? How am I doing? What should I learn after?"

### 7.2 Explore (`/explore`)

Header "Explore" + one-line description. Large search bar (placeholder "Search courses, skills or topics") with **Build my path** secondary button beside it. Category chips row (horizontal scroll). Filter/sort row. Result count. Card grid. Sections for the empty search ("Trending", "New", "Beginner friendly") when no query. Infinite scroll or "Show more" (24 per page).

### 7.3 My learning (`/my-learning`)

Header "My learning" with a summary ("21 courses · 2 completed"). Tabs: **In progress / Not started / Completed**. Search + sort. `enrolled` cards with progress, status chip and **Continue / Start / Review**. **Roadmap** and **Unenroll** live in each card's overflow menu. A "Continue where you left off" strip pins the latest course at the top.

### 7.4 Saved (`/saved`)

Same as Explore without category chips. Empty state: "Nothing saved yet. Tap the bookmark on any course." + **Explore**. Unsave shows a toast with **Undo**.

### 7.5 Course page (`/course/:id`)

Hero (cover, title, one-line outcome, meta: level, duration, lessons, price) with **one primary button** (state machine) + Save icon + **Preview** link. Tabs: **Overview** (what you'll learn, who it's for, requirements) / **Curriculum** (collapsible modules with lesson durations and a lock/check state) / **Roadmap** (timeline by day/week) / **Reviews** (only when they exist). Right rail on desktop: sticky enroll card. Related courses at the bottom.

### 7.6 Roadmap (`/course/:id/roadmap`)

Vertical timeline grouped by week/day, each step shows lessons, estimated time and a state (done / current / upcoming). A sticky **Continue** button jumps to the current step. Printable and shareable.

### 7.7 Lesson player (`/learn/:courseId/:lessonId`)

Distraction-free: reduced header, video/content (max 1100px), next/previous, **Mark complete** (auto-completes at 90% watched), collapsible curriculum sidebar with progress, notes tab, bookmarks, speed, captions. Keyboard: `Space` play/pause, `J/K/L` seek, `N` next lesson, `M` mark complete, `F` fullscreen. Progress syncs instantly (optimistic) and after completion the toast offers **Next lesson** with a 5s auto-advance that can be cancelled.

### 7.8 Profile and settings (`/profile`, `/settings`)

Profile: avatar, name, stats, badges grid, learning history. Settings: Account, Learning goals, Notifications, Appearance (theme), Privacy, Danger zone (delete account) at the bottom in a red-bordered card. Sticky save bar for dirty forms.

### 7.9 Onboarding

3 steps max, skippable: goal (career, school, hobby), current level, daily time. Ends by producing a first pick or a **Build my path** prompt. Progress dots, a Back button, never blocks access.

### 7.10 Auth

Centered 400px card on `--bg`, logo, title, fields, one primary button, secondary links. Show/hide password, clear errors, social sign-in buttons as secondary, loading state. No navigation bar.

---

## 8. Efficiency playbook (fewer clicks, faster)

1. **One-click continue** from anywhere (Home resume card, header "Continue" shortcut in the avatar-adjacent mini widget on desktop).
2. **Deep-link every Continue** to the exact next lesson.
3. **Optimistic UI** for Save, Enroll and Mark complete; roll back with an error toast.
4. **Undo toasts** instead of confirmation dialogs for reversible actions.
5. **Persist** filters, sort, tab and scroll position per page.
6. **Prefetch** a course page on card hover; cache lists; keep stale data visible while refetching.
7. **Autosave** notes and progress; never lose typed text.
8. **Keyboard shortcuts** (listed in a `?` dialog):

| Shortcut                 | Action                                     |
| ------------------------ | ------------------------------------------ |
| `Ctrl/Cmd + K`           | Command palette                            |
| `/`                      | Focus search                               |
| `G` then `H / E / L / S` | Go to Home / Explore / My learning / Saved |
| `C`                      | Continue last course                       |
| `?`                      | Show shortcuts                             |
| `Esc`                    | Close dialog, menu or sheet                |

### 8.3 Command palette

`Ctrl/Cmd + K`, 640px modal. Groups: **Continue** (last courses), **Courses** (fuzzy search), **Pages**, **Actions** (Toggle dark mode, Build my path, Sign out). Arrow keys + Enter. On mobile it is a full-screen search.

---

## 9. UX writing rules

- Plain language, active voice, **sentence case**. Friendly but not childish. Address the learner as "you".
- **Same verb all the way through:** button "Enroll free" → toast "Enrolled in JavaScript Fundamentals" → status "Enrolled".
- **Never ship generated filler.** Every course has a one-line _outcome_ sentence (max 120 characters) starting with a verb: "Build REST APIs with FastAPI and deploy them". If a description is missing, show the first lesson topics, not a template sentence.
- Errors: what happened + how to fix. "Couldn't save your progress. Check your connection. We'll retry."
- Empty states invite action: "No saved courses yet. Tap the bookmark on any course."
- Numbers: thousand separators; durations "2 h 30 min"; dates `20 Oct 2026`, relative for under 7 days ("2 days ago") with exact time on hover.
- Pluralize everything: 1 lesson / 2 lessons, 1 day / 2 days.
- Motivational copy is warm and short ("Nice work, 3 days in a row"). No shame, no fake urgency, no countdowns.

---

## 10. Content and data standards

### 10.1 Course content minimums (reject a course from the catalog without these)

Title (max 70 chars), outcome sentence, category, level, lesson count, estimated duration, a valid cover or a generated one.

### 10.2 Course titles

No ellipsis-dependent titles. Keep titles under 70 characters and put the subtitle in the outcome line ("Professional Japanese: zero to JLPT N4" rather than a 90-character title).

### 10.3 Category taxonomy (one list, no overlaps)

AI and machine learning · Programming · Web development · Data and analytics · Databases · Software engineering · Languages · Career and soft skills · Design · Math and science · Other. Each has one hue and one icon. Internal source tags (e.g. "AI course search") are never shown to learners.

---

## 11. Metrics: one definition, one source

| Metric            | Definition                                                                                                                     | Shown as                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Lessons done      | Unique lessons a learner has completed, across all courses                                                                     | "10 lessons done"        |
| Course progress % | Completed lessons ÷ total lessons in that course                                                                               | Bar + "12 of 40 lessons" |
| Overall progress  | Sum of completed lessons ÷ sum of all lessons in enrolled courses (or the mean of course progress, chosen once and documented) | "2%"                     |
| Days studied      | Distinct calendar days with at least one completed lesson or 5+ min of study                                                   | "5 days"                 |
| Streak            | Consecutive days studied ending today or yesterday (freeze-aware)                                                              | "1-day streak"           |

Home, Profile and the Player must read these from **one** selector/hook (`useLearningStats`). If two components show a number with the same name, they must show the same value.

---

## 12. State matrix (every screen and component)

| State                      | Requirement                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Loading**                | Skeleton matching the final layout (card skeletons in the grid)                                         |
| **Refreshing**             | Keep old data visible + thin top progress bar                                                           |
| **Empty (no data)**        | Icon, one sentence, one primary action                                                                  |
| **Empty (no results)**     | "No courses match these filters" + **Clear filters**                                                    |
| **Error (recoverable)**    | Inline alert with reason + **Retry**                                                                    |
| **Error (permission/404)** | Friendly page with a link to Home                                                                       |
| **Offline**                | Banner "You're offline. Progress will sync when you reconnect." Downloaded or cached lessons still play |
| **Partial**                | If one section fails, only that section shows an error                                                  |
| **Success**                | Toast with the action's name; UI updates immediately                                                    |
| **Disabled**               | Visible, 45% opacity, tooltip with the reason                                                           |
| **Dirty form**             | Sticky save bar + leave warning                                                                         |
| **Image error**            | Generated cover fallback, never a broken image                                                          |

---

## 13. Accessibility (non-negotiable)

- Semantic HTML: `<nav>`, `<main>`, `<header>`, `<button>`. No clickable `<div>`s. A card is one `<a>` with its inner controls outside the link's text, or uses the stretched-link pattern.
- Every interactive element is keyboard reachable with a visible `--focus-ring`. Skip-to-content link.
- Icon-only controls have `aria-label`. Inputs have `<label>`. Errors use `aria-describedby` and `aria-invalid`. Toasts use `role="status"` (errors `role="alert"`).
- Progress bars: `role="progressbar"`. Active nav: `aria-current="page"`.
- Hit area at least 40x40 (44x44 on touch). Color is never the only signal. Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Video: captions, keyboard controls, no autoplay with sound.

---

## 14. Responsive behavior

| Width     | Behavior                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| >= 1280   | Full header, 4-5 card columns, sticky right rail on Course page                                                                               |
| 1024-1279 | 3-4 columns                                                                                                                                   |
| 768-1023  | 2-3 columns, filters collapse into a "Filters" button with a sheet                                                                            |
| < 768     | 1-2 columns, **bottom tab bar**, sticky bottom Continue bar on Course page and Player, modals become bottom sheets, filters in a bottom sheet |

Never require hover on touch: the overflow menu and Save are always visible on mobile cards.

---

## 15. Motion and delight (tasteful)

- Motion explains change: card hover lift (180ms), tab underline slide, progress fill animates from old to new value (400ms), badge earned pop, lesson-complete check draw.
- One celebration moment per milestone (first lesson, course completed, streak of 7). Keep it under 1.5 seconds and skippable. Reduced-motion users get a static check and a toast.
- No decorative looping animations, no parallax.

---

## 16. Performance and data rules

- Budgets: first render under 1.5s, interaction under 100ms, route change under 300ms, route bundle under 200KB gzipped.
- Code-split by route; lazy-load the player, charts and the command palette contents.
- Never load entire collections. Paginate (24 per page) with cursor/`startAfter`. Filter and sort on the server.
- Cache with React Query/SWR: stale-while-revalidate, dedupe, retry with backoff, invalidate on mutation. Recommendations and stats are fetched once per session and shared.
- **Firebase/Firestore (if used):** composite indexes for filter+sort combos; real-time listeners only for notifications and current progress, always unsubscribed on unmount; denormalized counters for lesson totals (never count on the client); batch writes; security rules enforce enrollment and progress ownership.
- Images: lazy-load, WebP/AVIF, correct dimensions, `srcset`, reserved aspect ratio (no layout shift). Thumbnails are generated at 480px width for cards.

---

## 17. Recommended code architecture

```
src/
  styles/
    tokens.css          <- Section 2
    base.css            <- reset, typography, scrollbars, focus
  components/
    ui/                 <- Button, IconButton, Input, Select, Tabs, Badge, Chip, ProgressBar,
                           ProgressRing, Tooltip, Modal, Sheet, Dropdown, Toast, Alert, Skeleton,
                           EmptyState, Avatar, Switch, Checkbox
    learning/           <- CourseCard (variants), CoverImage, CourseActionButton, StreakTile,
                           GoalRing, StatTile, BadgeCard, LessonRow, RoadmapTimeline, ResumeCard
    layout/             <- AppHeader, BottomTabBar, PageHeader, PageContent, SlimFooter
    feedback/           <- CommandPalette, ShortcutsDialog, ConfirmDialog
  features/             <- home/, explore/, my-learning/, saved/, course/, player/, profile/, onboarding/
  hooks/                <- useLearningStats, useCourseState, useUrlState, useDebounce, useHotkeys, useTheme
  lib/                  <- api, formatters (date, duration, pluralize), taxonomy, intents (Section 4 registry)
```

- **`lib/intents.ts`** exports the Intent Registry as a typed object (`label`, `icon`, `ariaLabel`). Components import labels from it. This makes "two buttons with different names for one action" impossible.
- **`CourseActionButton`** takes the learner state and returns the correct label/icon/handler (Section 4.1). No page builds its own enroll/start/continue button.
- Feature pages contain no styling decisions, only composition.
- A `/design` route (or Storybook) renders every component in every state, in light and dark.

---

## 18. Anti-patterns (never do these)

1. Two buttons with different names for the same action; a button that duplicates "click the card".
2. More than one primary button in a card or section; a dark navy primary next to a purple primary.
3. Showing "Resume" or "Start learning" regardless of progress.
4. Badges or text laid over thumbnails without a scrim; identical placeholders for different courses.
5. Generated filler descriptions, "(no reviews)" rows, internal jargon, "1 days".
6. Text truncated without a tooltip, or buttons that wrap their labels onto two lines.
7. Uppercase letter-spaced eyebrow labels everywhere; Title Case labels; text smaller than 12px.
8. Recommending courses the learner is already enrolled in.
9. Two different numbers for the same metric on one screen.
10. Hover-only actions; icon-only buttons without labels; color-only status.
11. Streak shaming, fake countdowns, dark patterns.
12. Marketing footer or "Sign in" for a signed-in learner.
13. Full-collection loads, client-side filtering of big data, uncancelled requests, leaked listeners.
14. Decorative animation or gradients on buttons/cards.
15. Inventing a new pattern when one exists in this file.

---

## 19. Step-by-step rebuild order (for the AI)

1. **Tokens and base styles** (Section 2, dark mode, scrollbars, focus).
2. **Intent registry and formatters** (`lib/intents.ts`, `pluralize`, duration/date formatters, taxonomy).
3. **Core UI:** Button, IconButton, Input, Badge, Chip, ProgressBar, Tabs, Tooltip, Skeleton, EmptyState, Toast, Modal/Sheet.
4. **App shell:** AppHeader (4-item nav, search, bell, avatar menu), BottomTabBar, SlimFooter, PageHeader.
5. **CourseCard + CoverImage + CourseActionButton** with all variants and states. Verify against Sections 4 and 6.2.
6. **`useLearningStats`** single source for metrics (Section 11).
7. **Home** (7.1) → **Explore** (7.2) → **My learning** (7.3) → **Saved** (7.4).
8. **Course page** and **Roadmap** (7.5, 7.6).
9. **Player** (7.7) → **Profile/Settings** (7.8) → **Onboarding** (7.9).
10. **Power features:** command palette, shortcuts, streak freeze, badges, Undo toasts.
11. **Polish pass:** state matrix, accessibility audit, performance audit, copy audit against Sections 4 and 9, duplicate-action checklist (4.2).

When given a single page to redesign, always say which template (Section 7) you are applying, list what you removed/merged/renamed/added (Section 5), then build it using only the shared components.

---

## 20. Reusable prompts for the user to give an AI

**Redesign a page**

> Read USER_UI_DESIGN_SYSTEM.md fully. Redesign the [Home] page using template 7.1. Use only the tokens, intents and shared components defined in the file. Implement all states in Section 12. First list what you removed, merged, renamed and added. Output complete files. At the end, list which Definition of Done items you verified.

**Audit an existing screen**

> Read USER_UI_DESIGN_SYSTEM.md. Audit this code against Sections 2, 4, 5, 6, 12, 13 and 18. Return a table of violations (location, rule broken, fix), then provide the corrected code.

**Fix duplicate buttons**

> Read USER_UI_DESIGN_SYSTEM.md Section 4. Find every place in [file/folder] where two controls trigger the same intent or one control is used for different intents. Replace them with the canonical labels from the Intent Registry and the `CourseActionButton` state machine.

**Build a component**

> Read USER_UI_DESIGN_SYSTEM.md. Build the [CourseCard] component per Section 6.2 with all variants, generated cover fallback, progress, Save, single state-based primary button, skeleton and keyboard support. Include a usage example.

---

## 21. Definition of Done (the AI must verify every line)

**Naming and actions**

- [ ] Every action label comes from the Intent Registry; no duplicate or renamed variants
- [ ] No control duplicates "click the card"
- [ ] Primary button label matches the learner state (Enroll / Start / Continue / Review)
- [ ] Exactly one primary button per card/section; Save is an icon only
- [ ] Nav is Home / Explore / My learning / Saved; page titles match nav labels

**Visual**

- [ ] Only tokens used; no hardcoded colors, spacing, radii or font sizes
- [ ] One accent color; no navy/purple primary mismatch
- [ ] No text under 12px; no uppercase eyebrows; sentence case everywhere
- [ ] Cards use 1px borders; hover lift only on clickable cards; gradients only on generated covers
- [ ] Looks correct in light and dark mode; active nav label contrast checked

**Content and data**

- [ ] No generated filler, no empty "(no reviews)" rows, no internal labels
- [ ] Meta row follows the fixed pattern; counts pluralized
- [ ] Each metric uses one source (`useLearningStats`); numbers agree across pages
- [ ] Recommendations exclude enrolled courses and show a reason
- [ ] Footer is the slim version when signed in; no "Sign in" for signed-in users

**Behavior**

- [ ] Loading, refreshing, empty, no-results, error, offline, success states present
- [ ] Filters/sort/search in the URL; persisted per user
- [ ] Optimistic updates with rollback; Undo toasts for reversible actions
- [ ] Continue deep-links to the next unfinished lesson
- [ ] Command palette and shortcuts work

**Quality**

- [ ] Fully keyboard-operable with visible focus; roles, labels and `aria-current` present
- [ ] Contrast at least 4.5:1; status never by color alone; reduced motion respected
- [ ] Works at 360px, 768px, 1280px and 1920px; bottom tab bar on mobile
- [ ] No truncated text without a tooltip; no wrapped button labels
- [ ] No console errors; no layout shift; listeners cleaned up
- [ ] Code uses shared components with typed props; no duplicated UI

> **Final instruction to the AI:** When in doubt, choose the option that is more consistent, shows less but more useful information, and gets the learner back to learning faster. Delete duplicates before adding anything new. Do not ask for permission to follow this file; follow it.
