# USER FLOW, NAVIGATION AND ELEMENT MAP: Master Instructions for AI Models (BuddyForStudy)

> **Purpose:** This file tells an AI model how to think like a panel of 10 expert UI/UX designers and then **plan every single UI element (small and big), its action, its destination, when it appears, and where new things belong**, so the learner never lands on the wrong page, never meets two buttons that do the same thing, and never hits a dead end.
>
> **Companion files:** `USER_UI_DESIGN_SYSTEM.md` (tokens, components, naming, visual rules) and `ADMIN_PANEL_DESIGN_SYSTEM.md` (admin only). This file owns **behavior**: routes, destinations, states and element planning. If the design-system file and this file disagree about *where a control goes*, **this file wins**. About *how it looks*, the design-system file wins.
>
> **Goal:** After a learner enrolls, the product treats them as a learner, not a shopper. Every enrolled-course control leads to learning in one click. Every control leads to a page that exists. Same label means same destination, everywhere.

---

## 0. How the AI must use this file

1. **Read the whole file before changing any code.**
2. **Never hardcode a route or a button label inside a page.** Destinations come from `lib/courseNav.ts` (Section 5) and labels come from the Intent Registry in `USER_UI_DESIGN_SYSTEM.md` Section 4.
3. **Before writing code for any page, produce an Element Plan** (Section 10 template) that lists every element, its action, destination, visibility rule and state behavior. Get every row through the Destination Rules (Section 4).
4. **Run the expert panel review (Section 2)** on the plan. Fix every veto before coding.
5. **Never add a control that leads to a route that can fail.** Use capability flags (Section 6) and fallbacks (Section 8).
6. **After coding, run the navigation test matrix (Section 13)** and the Definition of Done (Section 14).
7. If information is missing, choose the defaults in this file, state the assumption in one line, and continue.
8. Output complete files. No `// ...rest of code` placeholders.

---

## 1. Diagnosis: what is broken right now (from the real code and your reports)

Read from the `test` branch (commit `7e9ddf2`, 20 Oct 2026). These are the confirmed causes. **Fix them first.**

| # | Symptom (what the learner sees) | Root cause in code | Fix |
|---|---|---|---|
| B1 | On `/courses`, an enrolled card's button goes to `/learn/:id/:lessonId`, but clicking the card or "Preview" goes to `/courses/:id` (sales page) | `CourseCard.tsx` line ~244: card link is hard-coded to `"/courses/" + course.id` for every state. The primary button (line ~226) correctly goes to `/learn/...` | Card link must come from `getCourseNavTargets().cardHref`: enrolled → learn, not enrolled → details |
| B2 | A non-enrolled card has **three** controls (card, "View course", "Preview") that all open the same page | Controls were added per feature, not per intent | Keep card click + one state-based primary. Remove the duplicate "View course" and "Preview" buttons from cards (Preview lives on the course page) |
| B3 | A completed course's button ("Review") goes to `/courses/:id` instead of the lessons | `CourseCard.tsx` line ~222: `completed` branch navigates to the details page | Completed → `/learn/:id` (review mode from the player); details only via overflow "Course info" |
| B4 | On `/my-courses`, the cover, the title, **"Start learning"** and **"View roadmap"** all go to `/courses/:id/roadmap` | `MyCourses.tsx` line ~56: one `roadmapUrl` constant is used for every link on the card | Cover, title and primary → `/learn/:id` (player resolves the next lesson). Roadmap is a separate, conditional control |
| B5 | `/courses/:id/roadmap` shows "Roadmap unavailable. The requested item could not be found." for some courses | `CourseRoadmap.tsx` loads `/api/courses/:id` **and** `/api/progress/:id` in one `Promise.all`. If either returns 404 (typically progress for a course the learner has enrolled in but never opened, or a course without roadmap data such as a YouTube-playlist course) the whole page fails | (a) Treat a missing progress record as 0%, using `Promise.allSettled`. (b) If the course loads but has no roadmap data, render a **generated roadmap from modules and lessons**, never an error. (c) Only show the Roadmap control when `hasRoadmap` is true. Verify the failing request in DevTools → Network |
| B6 | "Start learning" and "View roadmap" bring the user to the **same** URL | Two labels, one destination (B4) | Rule R3: different labels must have different destinations |
| B7 | An enrolled user keeps seeing sales content (price, enroll box, reviews) before they can learn | Details page has one layout for all learners | Three Course page variants (Section 7.1). Enrolled users see the Course hub, and the default path skips the page entirely |
| B8 | `/dashboard` redirects to `/home` but the nav still reads "Dashboard"/"Courses" in places; `/explore`, `/my-learning`, `/saved` exist as duplicates | Aliases were added without choosing canonical routes | Canonical routes in Section 3; every internal link uses canonical routes only; old ones stay as redirects |
| B9 | Unknown URLs render Home (`path="*"`) | Catch-all returns Home with a wrong URL left in the address bar | Add a real 404 page with a link to Home; keep Home only for `/` |

> Verification tip for B5: open `/courses/6ad75063b3aebd6ba5593c0c/roadmap`, open DevTools → Network, and check which of `/api/courses/{id}` or `/api/progress/{id}` returns 404. The fix in B5(a)/(b) covers both cases.

---

## 2. The expert panel: 10 designers who must review every plan

For every page or feature, the AI plays all 10 roles in order. Each role asks its mandatory questions and has **veto power**: a veto must be fixed before the work continues. Output a short "Panel review" section after the Element Plan listing each role as PASS or the fix applied.

| # | Expert | Mandatory questions | Veto when |
|---|---|---|---|
| 1 | **Product strategist** | Which learner job does this page serve (find, decide, learn, track, get motivated)? What is the one primary action? | There is no single primary action, or the page serves two jobs at once |
| 2 | **Information architect** | Where does this live in the route map? Can the learner always tell where they are and how to go back? Does the URL exist and resolve? | A control points to a route that is not in Section 3 or can return 404 |
| 3 | **Interaction designer** | What happens on click, hover, keyboard, long-press and touch? What is the feedback within 100ms? What happens after success and failure? | An action has no feedback, no loading state or no failure path |
| 4 | **UX writer** | Is the label from the Intent Registry? Does the same label always go to the same place? Is the copy short, active, sentence case? | Two labels for one intent, or one label for two destinations |
| 5 | **Visual/UI designer** | Is the hierarchy clear (one primary, quiet secondary)? Does spacing, type and color use tokens? | Two primary-looking buttons in a region, text on images without a scrim |
| 6 | **Design-systems engineer** | Is this an existing component variant? Is any element a copy of another? | A new component is built where a variant would do, or a page builds its own button/card |
| 7 | **Accessibility specialist** | Can it be used with a keyboard and a screen reader? Is the link vs. button semantics right? Is every icon-only control labeled? | A card has nested interactive elements without correct semantics, or any icon button has no label |
| 8 | **Learning-experience designer** | Does it shorten the path back to the lesson? Does it show progress and the next step? Does it avoid distraction in learning mode? | An enrolled learner needs more than 1 click to reach their next lesson |
| 9 | **Data and trust analyst** | Is every number defined once? Do two places show the same metric the same way? Is there an event for the action? | The same metric differs between pages, or a key action is not tracked |
| 10 | **Frontend QA/performance engineer** | What are the empty, loading, error, offline, 404 and permission states? Is the navigation covered by a test? | A state is missing, or there is no navigation test for the control |

---

## 3. Route map (canonical routes)

Use **only canonical routes** in code, links and navigation. Aliases remain as redirects.

| Canonical route | Aliases (redirect to canonical) | Auth | Purpose | Who sees which view |
|---|---|---|---|---|
| `/` | none | public | Landing. Signed-in users are redirected to `/home` | Guest only |
| `/home` | `/dashboard` | learner | Resume, goals, picks | Learner |
| `/explore` | `/courses` | public | Discover courses | Guest + learner |
| `/courses/:courseId` | none | public | **Course page** (3 variants, Section 7.1) | Guest = sales, enrolled = hub, completed = hub + completion |
| `/courses/:courseId/roadmap` | none | learner | Roadmap view (never errors, Section 8) | Enrolled |
| `/learn/:courseId` | none | learner | Player entry: **resolves the next lesson** and replaces the URL | Enrolled |
| `/learn/:courseId/:lessonId` | none | learner | Lesson player | Enrolled |
| `/my-learning` | `/my-courses` | learner | Enrolled courses | Learner |
| `/saved` | `/saved-courses` | learner | Saved courses | Learner |
| `/playlists/:playlistId` | none | learner | YouTube-playlist course entry | Learner |
| `/profile`, `/settings`, `/notifications`, `/billing` | none | learner | Account | Learner |
| `/pricing` | none | public | Plans | Guest + learner |
| `/login`, `/register`, `/verify-email`, `/forgot-password`... | none | public | Auth | Guest |
| `*` | none | public | **404 page** (not Home) | Anyone |

- Internal links must be built with helpers in `lib/routes.ts` (`routes.learn(id, lessonId?)`, `routes.course(id)`, `routes.roadmap(id)`), never with string concatenation in pages.
- `/learn/:courseId` (no lesson) is a **supported entry point**: the player already resolves the next lesson and redirects with `replace: true`. Use it whenever a page does not know the next lesson.

---

## 4. The Destination Rules (non-negotiable)

**R1. Learners go to learning.** For a course the user is enrolled in, every control that means "open this course" (card, cover, title, primary button) goes to the **player**, not to the sales page.

**R2. Same label, same destination, everywhere.** "Continue" always opens the next unfinished lesson of that course, from Home, My learning, Explore, Saved, notifications and search.

**R3. Different labels, different destinations.** If two controls share a destination, they are the same intent and one must be deleted. (Fixes "Start learning" and "View roadmap" both opening the roadmap.)

**R4. No dead ends.** A control must never lead to a route that can show "not found" for a valid course. Guard with capability flags (Section 6); if data is missing, render a fallback (Section 8) or hide the control.

**R5. A card is a link plus at most two controls.** A card has: the card link, one primary action, one Save icon, and (enrolled cards only) an overflow menu. Nothing else is clickable.

**R6. Details for enrolled learners are opt-in.** Reviews, price, instructor pitch, "what you'll learn" and related courses are never on the default path for an enrolled learner. They are reachable via **Course info** (overflow menu or the course title in the player), which opens the **Course hub** (Section 7.1).

**R7. Back always works.** The player's back control returns to where the learner came from (`location.state.from`), falling back to `/my-learning`. Breadcrumbs on deep pages.

**R8. State drives the page, not the URL.** The same `/courses/:id` renders a different layout depending on guest / not enrolled / enrolled / completed. The server-side access check, not the button, protects content.

**R9. Enrolling keeps momentum.** After a successful enroll from a card, the card flips in place to **Start**, with a toast "Enrolled. Start now" whose action goes to `/learn/:id`. After enrolling from the Course page, go straight to `/learn/:id`.

**R10. One source of truth for navigation.** All the above is implemented once in `getCourseNavTargets()` and consumed by every card and button. Pages do not decide destinations.

---

## 5. Central navigation function (build this first)

Create `src/lib/routes.ts` and `src/lib/courseNav.ts`. Every page and component must use them.

```ts
// src/lib/routes.ts
export const routes = {
  home: () => "/home",
  explore: () => "/explore",
  myLearning: () => "/my-learning",
  saved: () => "/saved",
  course: (id: string) => `/courses/${id}`,
  roadmap: (id: string) => `/courses/${id}/roadmap`,
  learn: (id: string, lessonId?: string | null) =>
    lessonId ? `/learn/${id}/${encodeURIComponent(lessonId)}` : `/learn/${id}`,
  login: () => "/login",
} as const;
```

```ts
// src/lib/courseNav.ts
import { routes } from "./routes";

export type CourseNavInput = {
  courseId: string;
  isEnrolled: boolean;
  isCompleted: boolean;
  isPaid: boolean;
  priceLabel?: string;        // "₹499"
  progressPct: number;        // 0-100
  nextLessonId?: string | null;
  hasRoadmap: boolean;        // roadmap data exists OR a fallback can be generated
  hasPreview: boolean;        // at least one free preview lesson
  isPublished: boolean;
};

export type NavAction =
  | { kind: "link"; label: string; href: string; icon: string }
  | { kind: "action"; label: string; action: "enroll" | "unenroll" | "save"; icon: string };

export type CourseNavTargets = {
  cardHref: string;               // where the whole card goes
  status: "not-enrolled" | "not-started" | "in-progress" | "completed";
  primary: NavAction;             // exactly one
  overflow: NavAction[];          // enrolled cards only
};

export function getCourseNavTargets(i: CourseNavInput): CourseNavTargets {
  const learnHref = routes.learn(i.courseId, i.nextLessonId);

  if (!i.isEnrolled) {
    return {
      cardHref: routes.course(i.courseId),
      status: "not-enrolled",
      primary: i.isPaid
        ? { kind: "link", label: "Enroll", href: routes.course(i.courseId), icon: "Plus" }   // checkout lives on the course page
        : { kind: "action", label: "Enroll free", action: "enroll", icon: "Plus" },
      overflow: [],
    };
  }

  const status = i.isCompleted ? "completed" : i.progressPct > 0 ? "in-progress" : "not-started";
  const primaryLabel = status === "completed" ? "Review" : status === "in-progress" ? "Continue" : "Start";
  const primaryIcon = status === "completed" ? "RotateCcw" : "Play";

  const overflow: NavAction[] = [];
  if (i.hasRoadmap) overflow.push({ kind: "link", label: "Roadmap", href: routes.roadmap(i.courseId), icon: "Map" });
  overflow.push({ kind: "link", label: "Course info", href: routes.course(i.courseId), icon: "Info" });
  overflow.push({ kind: "action", label: "Unenroll", action: "unenroll", icon: "Trash2" });

  return {
    cardHref: learnHref,                       // R1: enrolled learners go to learning
    status,
    primary: { kind: "link", label: primaryLabel, href: learnHref, icon: primaryIcon },
    overflow,
  };
}
```

Rules for this file:
- It is **pure** (no fetching, no React). It is unit-tested for every state combination (Section 13).
- The data for `nextLessonId`, `progressPct`, `hasRoadmap`, `isCompleted` comes from one hook, `useCourseState(courseId)`, backed by the cached enrollment + progress queries (no per-card N+1 requests).
- `CourseCard`, `MyCourses`, Home resume card, Saved, notifications and search results all call this function. No component builds a `/learn`, `/courses` or `/roadmap` string by hand.

---

## 6. Learner and course state model

Every control's visibility and destination is derived from this model.

| Field | Meaning | Source |
|---|---|---|
| `isAuthenticated` | Learner is signed in | session |
| `isEnrolled` | Has an active enrollment | enrollments |
| `isCompleted` | All required lessons done | progress |
| `progressPct` | Completed ÷ total lessons | progress (0 when no record exists; a missing record is **not** an error) |
| `nextLessonId` | First unfinished lesson (or last viewed if finished) | progress + course modules |
| `isPaid` / `priceLabel` | Needs payment | course |
| `hasRoadmap` | Roadmap data exists or can be generated from modules | course |
| `hasPreview` | Free preview lesson exists | course |
| `isPublished` | Visible to learners | course |
| `type` | `structured` (manual/AI), `youtube-playlist`, `ai-generated` | course |

Derived `status`: `guest` → `not-enrolled` → `not-started` → `in-progress` → `completed`. The UI label, chip and destination for each status are fixed in Section 7.

---

## 7. Destination matrix (the answer to "where does each control go?")

### 7.1 The course page has three views

| View | Shown to | Layout |
|---|---|---|
| **Sales view** | Guest, or signed-in and not enrolled | Hero (cover, title, outcome, meta), **one** primary button (**Enroll free** / **Enroll** / **Sign in to enroll**), Save icon, **Preview** link (if `hasPreview`), tabs Overview / Curriculum / Reviews, sticky enroll card, related courses |
| **Course hub** | Enrolled, in progress or not started (opened via "Course info") | Top banner: progress, "Next: Lesson 4 · Backpropagation", **Continue** (primary, sticky on mobile). **No price, no enroll card.** Tabs: Curriculum (default) / Roadmap (if `hasRoadmap`) / About / Notes. Reviews of others hidden by default (see R6) |
| **Completion view** | Completed | Hub plus a completion header: **Review** (primary), **Certificate** (if enabled), **Rate this course** (inline stars), "Next course for you" |

The route is the same. The page reads `status` and renders one view. A guest never sees the hub; an enrolled learner never sees the enroll card.

### 7.2 Course card destinations by state (Explore, Saved, Picked for you, search)

| State | Card (whole), cover, title | Primary button | Save icon | Overflow ⋯ | Status chip |
|---|---|---|---|---|---|
| Guest | `/courses/:id` | **Enroll free** → `/login` with `from` | `/login` with `from` | none | none |
| Not enrolled, free | `/courses/:id` | **Enroll free** → enrolls in place, flips to **Start**, toast with action to `/learn/:id` | Toggle save + Undo toast | none | none |
| Not enrolled, paid | `/courses/:id` | **Enroll · ₹499** → `/courses/:id` (checkout) | Toggle save | none | none |
| Enrolled, 0% | `/learn/:id` | **Start** → `/learn/:id` | Toggle save | Roadmap*, Course info, Unenroll | Not started |
| Enrolled, in progress | `/learn/:id/:nextLessonId` | **Continue** → same | Toggle save | Roadmap*, Course info, Unenroll | In progress |
| Completed | `/learn/:id` (review mode) | **Review** → same | Toggle save | Roadmap*, Course info, Certificate*, Unenroll | Completed |

*Only when the capability flag is true. **Removed from all cards:** "View course" button, "Preview" button, circular arrow, "Enrolled" button.

### 7.3 My learning destinations

| Element | Destination |
|---|---|
| Cover, title, primary (**Start / Continue / Review**) | `/learn/:id` (or `/learn/:id/:nextLessonId`) |
| Status chip | Not a link |
| Progress bar | Not a link (part of the card link) |
| Overflow → Roadmap | `/courses/:id/roadmap` (only if `hasRoadmap`) |
| Overflow → Course info | `/courses/:id` (hub view) |
| Overflow → Unenroll | Confirm dialog, then removes the card with Undo toast |

The two-button footer "Start learning / View roadmap" is **deleted**. There is one primary button per card.

### 7.4 Home destinations

| Element | Destination |
|---|---|
| **Continue: {course}** (header button) and the Resume card | `/learn/:id/:nextLessonId` of the most recently active course |
| Continue list rows (compact cards) | Card link and Continue → learn |
| Streak tile | `/profile#activity` |
| Today's goal tile | `/settings#learning-goals` |
| Lessons done / Overall progress tiles | `/my-learning` |
| Badges "See all" | `/profile#badges` |
| Picked for you cards | Per 7.2 (never contains enrolled courses) |
| "See all" (section links) | `/explore` or `/my-learning` as labeled |

### 7.5 Player destinations

| Element | Destination |
|---|---|
| Back | Origin (`location.state.from`), fallback `/my-learning` |
| Course title in the player header | `/courses/:id` (hub view) |
| Curriculum sidebar item | `/learn/:id/:lessonId` |
| Previous / Next | Adjacent lesson |
| Roadmap link (header, only if `hasRoadmap`) | `/courses/:id/roadmap` |
| Mark complete | Marks done, toast with **Next lesson** (5s, cancellable auto-advance) |
| End of course screen | **Rate this course**, **Certificate**, **Next course for you**, **Back to My learning** |

### 7.6 Roadmap destinations

| Element | Destination |
|---|---|
| Step / lesson row | `/learn/:id/:lessonId` |
| Sticky **Continue** | `/learn/:id/:nextLessonId` |
| Breadcrumb "Course" | `/courses/:id` (hub) |
| Back to My learning | `/my-learning` |

---

## 8. Roadmap availability and error handling (never show a dead end)

1. `hasRoadmap` is true when roadmap data exists **or** the course has modules/lessons (a roadmap can be generated from them). It is false only for courses with no lessons.
2. **Generated roadmap:** group lessons by module into a timeline; estimate time from lesson durations; the current step is highlighted from progress. A YouTube-playlist course (e.g. "Entrepreneurship and Startup Ecosystem", 9h 28m) gets a roadmap built from its video list.
3. Load course and progress independently with `Promise.allSettled`. A 404 for progress means `progressPct = 0`, not an error. Only a 404 for the **course** is a real not-found.
4. If the course itself is not found or unpublished, show: title **"This course isn't available"**, one sentence ("It may have been removed or unpublished."), primary **Back to My learning**, secondary **Explore**. Never expose the raw API message "The requested item could not be found."
5. The Roadmap control is **hidden** (not disabled) when `hasRoadmap` is false.
6. Every other page that links to something conditional follows the same pattern: hide the control when the destination cannot render.

---

## 9. Element inventory by page (every element, action and rule)

Column key: **ID** (use in code comments and tests) | **Element** | **Action → destination** | **Visible when** | **Notes**.

### 9.1 Global header (all signed-in pages)

| ID | Element | Action → destination | Visible when | Notes |
|---|---|---|---|---|
| GH-01 | Logo | → `/home` | Always (guest → `/`) | Not duplicated by a text "BuddyForStudy" elsewhere |
| GH-02 | Nav: Home | → `/home` | Signed in | Active: accent text + underline + `aria-current` |
| GH-03 | Nav: Explore | → `/explore` | Always | |
| GH-04 | Nav: My learning | → `/my-learning` | Signed in | Optional count badge = in-progress courses |
| GH-05 | Nav: Saved | → `/saved` | Signed in | |
| GH-06 | Search trigger | Opens command palette (`Ctrl/Cmd+K`) | Always | Shows shortcut hint |
| GH-07 | Notifications bell | Opens popover; "See all" → `/notifications` | Signed in | Number badge; mark all as read |
| GH-08 | Avatar menu | Opens menu: Profile → `/profile`, Settings → `/settings`, Billing → `/billing`, Theme (Light/Dark/System), Help and shortcuts, **Sign out** | Signed in | Sign out only lives here |
| GH-09 | Mobile bottom tab bar | Same 4 destinations as GH-02..05 | `< 768px` | Replaces the header nav on mobile |
| GH-10 | Guest actions | Sign in → `/login`, Start learning → `/register` | Guest | Only for guests |

### 9.2 Explore (`/explore`)

| ID | Element | Action → destination | Visible when | Notes |
|---|---|---|---|---|
| EX-01 | Page title "Explore" + one-line description | none | Always | No eyebrow label |
| EX-02 | Search input | Filters results; updates `?q=`; suggestions list | Always | 300ms debounce, `/` focuses |
| EX-03 | **Build my path** | Opens AI path-builder modal (a goal, level, time per day), then creates a path and goes to its course page. If the plan lacks `ai_course_builder`, opens an upgrade prompt linking `/pricing` | Always | Secondary style, sparkle icon, tooltip explains it |
| EX-04 | Category chips | Sets `?category=` | Always | Horizontal scroll on mobile |
| EX-05 | Level filter | Sets `?level=` | Always | Custom dropdown |
| EX-06 | Sort | Sets `?sort=` | Always | Recommended / Newest / Shortest / Most popular |
| EX-07 | More filters (Free/Paid, Duration) | Popover | Always | |
| EX-08 | Reset | Clears filters | Only when a filter is active | |
| EX-09 | Result count | none | Always | "13 courses" |
| EX-10 | Course grid | Cards per Section 7.2 | Has results | `auto-fill, minmax(260px,1fr)` |
| EX-11 | Empty / no results | **Clear filters** | Zero results | |
| EX-12 | Show more | Loads next 24 | More results exist | |

### 9.3 Course card (all variants) element list

| ID | Element | Action → destination | Visible when | Notes |
|---|---|---|---|---|
| CC-01 | Cover (real or generated) | Card link (`cardHref`) | Always | Level/price badges never overlap the artwork |
| CC-02 | Save icon (top-right) | Toggle save, Undo toast | Always (guest → login) | `aria-label` "Save course"/"Remove from saved"; pressed state |
| CC-03 | Category · Level (text) | none | Always | Not clickable |
| CC-04 | Title (2 lines) | Card link | Always | Tooltip if truncated |
| CC-05 | Outcome line (2 lines) | none | Has outcome text | Never filler copy |
| CC-06 | Progress bar + "12 of 40 lessons" | none | Enrolled | Track visible at 0% |
| CC-07 | Meta row (duration · lessons) | none | Always | Fixed pattern |
| CC-08 | **Primary button** | From `getCourseNavTargets().primary` | Always | One only |
| CC-09 | Overflow ⋯ | From `getCourseNavTargets().overflow` | Enrolled only | Always visible on touch |
| CC-10 | Status chip | none | Enrolled (not-started / in-progress / completed) | Bottom-left of cover with a scrim |

### 9.4 My learning (`/my-learning`)

| ID | Element | Action → destination | Visible when | Notes |
|---|---|---|---|---|
| ML-01 | Title "My learning" + summary "21 courses · 2 completed" | none | Always | |
| ML-02 | Tabs: In progress / Not started / Completed | Sets `?tab=` | Always | Counts in pills |
| ML-03 | Search | Filters own courses | 6+ courses | |
| ML-04 | Sort | Recently active / Progress / A to Z | 6+ courses | Persisted |
| ML-05 | "Continue where you left off" strip | → `/learn/:id/:nextLessonId` | Has an active course | Top of page |
| ML-06 | Enrolled cards | Per 7.2 / 7.3 | Has courses | **No** second "View roadmap" button |
| ML-07 | Empty state | **Explore** → `/explore` | No enrolled courses | |

### 9.5 Home (`/home`)

| ID | Element | Action → destination | Visible when | Notes |
|---|---|---|---|---|
| HM-01 | Greeting "Welcome back, {first name}" | none | Always | |
| HM-02 | Header button **Continue: {course}** | → `/learn/:id/:nextLessonId` | Has an active course | Otherwise **Explore** |
| HM-03 | Resume card | Card + Continue → learn | Has an active course | Shows next lesson and time left |
| HM-04 | Stat tiles (Streak, Goal, Lessons done, Overall progress) | Per 7.4 | Always | Same metric definitions as everywhere |
| HM-05 | Continue list (2 compact cards) | Per 7.2 | More than one active course | Excludes the resume course |
| HM-06 | Badges row | **See all** → `/profile#badges` | Always | Earned or closest to unlock |
| HM-07 | Picked for you | Per 7.2 | Always | Excludes enrolled; reason line under each title |
| HM-08 | Empty state (no enrollments) | **Explore**, **Build my path** | No enrollments | Replaces HM-02..05 |

### 9.6 Course page (`/courses/:id`)

| ID | Element | Action → destination | Visible when (view) | Notes |
|---|---|---|---|---|
| CP-01 | Breadcrumb | Explore (or My learning) / Course | All | Back target = origin |
| CP-02 | Cover, title, outcome, meta | none | All | |
| CP-03 | **Primary button** | Sales: Enroll free / Enroll / Sign in to enroll. Hub: **Continue** or **Start**. Completion: **Review** | All | One only |
| CP-04 | Save icon | Toggle save | All | |
| CP-05 | **Preview** link | Opens the free preview lesson in a modal player | Sales view and `hasPreview` | Not on cards |
| CP-06 | Tabs | Sales: Overview / Curriculum / Reviews. Hub: Curriculum / Roadmap* / About / Notes | All | Deep-linkable `?tab=` |
| CP-07 | Sticky enroll card (price, Enroll) | Enroll / checkout | **Sales view only** | Never shown to enrolled learners |
| CP-08 | Progress banner | → learn | Hub and Completion | Replaces the enroll card |
| CP-09 | Reviews of others | Read list | Sales view; hidden by default in hub | Rate-this-course lives in the player end screen and completion view |
| CP-10 | Related courses | Cards per 7.2 | Sales and Completion | |
| CP-11 | Certificate | Download | Completion and enabled | |

### 9.7 Roadmap (`/courses/:id/roadmap`)

| ID | Element | Action → destination | Visible when | Notes |
|---|---|---|---|---|
| RM-01 | Breadcrumb Course / Roadmap | → `/courses/:id` | Always | |
| RM-02 | Summary (duration, % done) | none | Always | |
| RM-03 | Timeline steps | Lesson rows → `/learn/:id/:lessonId` | Always | Done / current / upcoming states |
| RM-04 | Sticky **Continue** | → learn | Enrolled | |
| RM-05 | Share / print | Native share / print | Always | Optional |
| RM-06 | Error / not-available state | **Back to My learning**, **Explore** | Course missing | Friendly copy (Section 8.4) |

### 9.8 Lesson player (`/learn/:id/:lessonId`)

| ID | Element | Action → destination | Visible when | Notes |
|---|---|---|---|---|
| PL-01 | Back | Origin, fallback `/my-learning` | Always | |
| PL-02 | Course title | → `/courses/:id` (hub) | Always | |
| PL-03 | Progress indicator | none | Always | "12 of 40" |
| PL-04 | Content / video | Play, captions, speed | Always | |
| PL-05 | Mark complete | Completes, toast with **Next lesson** | Lesson not done | Auto-complete at 90% watched |
| PL-06 | Previous / Next | Adjacent lesson | Always | `N` shortcut |
| PL-07 | Curriculum sidebar | Jump to a lesson | Always (collapsible) | |
| PL-08 | Tabs: Notes / Practice quiz | In-page | Always | |
| PL-09 | Roadmap link | → `/courses/:id/roadmap` | `hasRoadmap` | |
| PL-10 | Completion screen | **Rate this course**, **Certificate**, **Next course for you**, **Back to My learning** | Last lesson done | |

### 9.9 Saved, Notifications, Profile (short)

| ID | Element | Action → destination | Notes |
|---|---|---|---|
| SV-01 | Saved cards | Per 7.2 | Unsave shows Undo toast |
| SV-02 | Empty state | **Explore** | "Nothing saved yet. Tap the bookmark on any course." |
| NT-01 | Notification item | Deep-links to the relevant `routes.*` (course update → `/learn/:id`, billing → `/billing`) | Uses the same route helpers |
| PR-01 | Badges grid, learning history, stats | Same metric definitions | Streak, days studied, lessons done |

---

## 10. Element Plan template (the AI must output this before coding any page)

```
PAGE: <name>   ROUTE: <canonical route>   TEMPLATE: <from USER_UI_DESIGN_SYSTEM.md Section 7>
LEARNER JOB: <find | decide | learn | track | motivate>
PRIMARY ACTION: <one>

ELEMENT PLAN
ID | Element | Type | Label (from Intent Registry) | Action -> Destination (route helper) | Visible when | States (loading/empty/error) | Event name

REMOVED / MERGED / RENAMED / ADDED
- Removed: ...
- Merged: ...
- Renamed: ...
- Added: ...

PANEL REVIEW
1 Product strategist: PASS | fix
2 Information architect: PASS | fix
... (all 10)

NAVIGATION TEST LIST
- <state> + <control> -> <expected URL>
```

**Worked example (My learning card, "Advanced MongoDB for Backend Engineers", enrolled, 0%):**

```
CC-01 Cover        | link   | -                | cardHref -> routes.learn(id)            | always   
CC-04 Title        | link   | -                | cardHref                                  | always
CC-06 Progress     | status | "0 of 28 lessons"| none                                      | enrolled
CC-08 Primary      | link   | Start            | routes.learn(id, nextLessonId)            | enrolled, 0%
CC-09 Overflow     | menu   | Roadmap*, Course info, Unenroll | routes.roadmap / routes.course / confirm | enrolled
CC-10 Chip         | status | Not started      | none                                      | enrolled, 0%
REMOVED: "View roadmap" button (duplicated the destination of "Start learning"), "Enrolled" cover badge.
```

---

## 11. Where to add things (placement and decision framework)

### 11.1 The 8 questions before adding any element
1. Which learner job does it serve? If none, do not add it.
2. Is there already an element with the same intent? If yes, reuse it (Intent Registry).
3. Is it needed by **every** learner state, or only some? Show it only in the states that need it.
4. Can the destination ever fail? If yes, add a capability flag or fallback first.
5. Is it primary, secondary, tertiary or rare? Place it in the matching zone (11.2).
6. Does it add a click for the main path (getting back to the lesson)? If yes, reject it.
7. Is it information the learner needs **now**, or information for deciding? Deciding info stays on the Sales view.
8. What event will it fire, and what does the learner see after the action (feedback)?

### 11.2 Placement zones (top to bottom priority)

| Zone | Content | Budget |
|---|---|---|
| **Zone 1: Primary** | The one action that moves the learner forward (Continue, Enroll) | 1 per card/section/page |
| **Zone 2: Context** | Title, outcome, progress, meta, status | As needed, no actions |
| **Zone 3: Secondary** | Save icon, Preview link, filters, tabs | 1-2 per component |
| **Zone 4: Overflow** | Roadmap, Course info, Unenroll, Share, Certificate | Behind a ⋯ menu |
| **Zone 5: Hidden by default** | Reviews of others, price details for enrolled, marketing text | Opt-in only |

### 11.3 Element budgets

| Component | Max interactive elements |
|---|---|
| Course card | 3 visible (card link, primary, Save) + overflow for enrolled |
| Home screen above the fold | 1 primary button + the resume card |
| Page header | 1 primary button |
| Filter row | 5 controls + Reset |
| Player header | Back, title link, Roadmap (conditional), progress |

### 11.4 When to remove an element
Remove it if: it has the same destination as another element (R3); it duplicates clicking the card; it appears for a state where it makes no sense (Enroll for an enrolled learner, Start for a 40% course); it leads to content the learner has already seen or does not need.

---

## 12. Action feedback, events and edge cases

### 12.1 Every action defines these five things
| Item | Rule |
|---|---|
| Immediate feedback | Within 100ms: pressed state, spinner or optimistic update |
| Success | Toast naming the action ("Enrolled in JavaScript Fundamentals"), UI updates in place |
| Failure | Inline error or error toast + **Retry**; roll back optimistic changes |
| Undo | Save, Unsave, Unenroll show **Undo** for 6 seconds |
| Analytics event | `snake_case` verb_object: `course_enrolled`, `course_started`, `course_continued`, `course_saved`, `roadmap_opened`, `lesson_completed`, `course_unenrolled`, `search_used`, `path_builder_opened` with `{courseId, source: "explore" | "my_learning" | "home" | "saved" | "search", status}` |

### 12.2 Navigation edge cases (all must be handled)
| Case | Behavior |
|---|---|
| Guest clicks Enroll or Save | → `/login`, then returns to the original page and completes the action |
| Not enrolled opens `/learn/:id` | Redirect to `/courses/:id` with a toast "Enroll to start learning" |
| Enrollment expired or subscription lapsed | Player shows an access screen with **Renew** (`/billing`) and **Back to My learning** |
| Paid course not purchased | Primary → checkout on the course page |
| Course unpublished or deleted | "This course isn't available" screen (Section 8.4), never a raw API message |
| Lesson removed or id invalid | Player redirects to the next valid lesson with a toast |
| `/learn/:id` with no lesson | Resolve the next lesson and `replace` the URL |
| Offline | Banner; cached lessons play; progress syncs on reconnect |
| Unknown URL | 404 page with **Back to Home** |
| Browser Back after Continue | Returns to the page the learner clicked from |

---

## 13. Navigation test matrix (the AI must write and pass these)

**Unit tests for `getCourseNavTargets`:** every combination of `isEnrolled × isCompleted × progressPct(0/>0) × isPaid × hasRoadmap × nextLessonId(present/absent)` returns a valid `cardHref`, exactly one `primary`, and no overflow link whose capability flag is false.

**Property assertions (must always hold):**
1. For enrolled courses, `cardHref === primary.href` (R1, R3 for the card).
2. No two controls on one card share the same `href` unless one is the card link itself.
3. `primary.label` is one of: Enroll free, Enroll, Start, Continue, Review.
4. No generated href contains `//`, `undefined` or `null`.

**End-to-end tests (Playwright/Cypress), minimum set:**

| # | Setup | Action | Expected URL / result |
|---|---|---|---|
| 1 | Not enrolled, free card on `/explore` | Click card | `/courses/:id` |
| 2 | Same | Click **Enroll free** | Card shows **Start**; toast with action; no navigation |
| 3 | Enrolled 0% card on `/explore` | Click card, cover, title, **Start** (4 separate tests) | `/learn/:id` → resolves to `/learn/:id/:lessonId` |
| 4 | Enrolled in progress | Click **Continue** | `/learn/:id/:nextLessonId` |
| 5 | Completed | Click **Review** and card | `/learn/:id` |
| 6 | Enrolled card on `/my-learning` | Click cover, title, primary | All `/learn/:id...` |
| 7 | Same, course with roadmap | Overflow → Roadmap | `/courses/:id/roadmap` renders a timeline |
| 8 | YouTube-playlist course with no roadmap record | Open its roadmap URL directly | Generated roadmap renders; **no** "Roadmap unavailable" |
| 9 | Enrolled, no progress record (API 404) | Open roadmap | Renders at 0%, no error |
| 10 | Overflow → Course info | Click | `/courses/:id` hub view (no enroll card, no price) |
| 11 | Enrolled | Open `/courses/:id` directly | Hub view with Continue |
| 12 | Not enrolled | Open `/learn/:id` | Redirect to `/courses/:id` + toast |
| 13 | Guest | Click Save | `/login`, then back and saved |
| 14 | Any | Visit `/does-not-exist` | 404 page |
| 15 | Home | Click **Continue: {course}** | `/learn/:id/:nextLessonId` of the latest active course |

---

## 14. Definition of Done (the AI must verify every line)

**Destinations**
- [ ] All links are built with `routes.*` helpers; no hand-built route strings in components
- [ ] All card and button destinations come from `getCourseNavTargets()`
- [ ] For enrolled courses the card, cover, title and primary all go to learning (R1)
- [ ] No two controls with different labels share a destination (R3)
- [ ] No control can lead to "not found" for a valid course (R4); conditional controls are hidden when unavailable
- [ ] `/learn/:id` without a lesson resolves correctly; `/courses/:id` shows the right view for each state
- [ ] A real 404 page exists; Home is not the catch-all

**Elements**
- [ ] An Element Plan exists for each changed page and passed all 10 expert reviews
- [ ] Each card has at most: card link, one primary, Save icon, overflow (enrolled)
- [ ] Removed controls ("View course", "Preview" on cards, circular arrow, "View roadmap" as a second button, "Enrolled" as a button) are gone
- [ ] Reviews, price and enroll card never appear for an enrolled learner by default

**Behavior and quality**
- [ ] Every action has immediate feedback, success, failure, Undo (where reversible) and an analytics event
- [ ] Missing progress is treated as 0%, not an error
- [ ] Generated roadmap works for YouTube-playlist and AI-generated courses
- [ ] Unit tests and the 15 end-to-end navigation tests pass
- [ ] Keyboard navigation and visible focus work; cards use correct link/button semantics
- [ ] Labels come from the Intent Registry; copy is sentence case
- [ ] No console errors, no layout shift, no unhandled promise rejections

> **Final instruction to the AI:** When in doubt, ask "does this get the learner back to their lesson faster, and does this control lead somewhere that exists?" If either answer is no, change the design. Delete duplicates before adding anything. Do not ask for permission to follow this file; follow it.

---

## 15. Reusable prompts for the user to give an AI

**Fix all routing problems**
> Read USER_FLOW_AND_ELEMENT_MAP.md and USER_UI_DESIGN_SYSTEM.md fully. Implement Section 5 (`routes.ts`, `courseNav.ts`, `useCourseState`), then fix B1-B9 from Section 1 in `CourseCard.tsx`, `MyCourses.tsx`, `CourseRoadmap.tsx`, `CourseDetails.tsx` and `App.tsx`. Add the unit and end-to-end tests from Section 13. Output complete files and list which Definition of Done items you verified.

**Plan a page before coding**
> Read USER_FLOW_AND_ELEMENT_MAP.md. For the [My learning] page, output the Element Plan (Section 10) and the 10-expert panel review. Do not write code until every veto is resolved.

**Audit navigation**
> Read USER_FLOW_AND_ELEMENT_MAP.md. Scan [folder] and list every link/button that builds a route by hand, shares a destination with a differently labeled control, or can lead to a not-found state. Return a table (file, line, problem, fix) then the corrected code.

**Build the course page views**
> Read USER_FLOW_AND_ELEMENT_MAP.md Section 7.1 and 9.6. Implement the Sales view, Course hub and Completion view of `/courses/:id` from one component driven by learner status. Hide price, the enroll card and reviews for enrolled learners.