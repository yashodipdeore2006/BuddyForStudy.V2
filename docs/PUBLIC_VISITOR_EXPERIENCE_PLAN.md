# Public Visitor Experience — Design & Implementation Plan

**Repository:** `yashodipdeore2006/BuddyForStudy.V2`  
**Execution branch:** `buddy-for-study-v2.2`  
**Baseline SHA:** `c79444f6fdc0477210cd0641aaeb995ef8ae8b4f`  
**Programme:** 10 tasks  
**Scope:** Public homepage and first-time visitor journey only. Existing authenticated learner and admin experiences remain intact.

## Product decision

The root route remains the public marketing homepage for unauthenticated visitors. Authenticated learners continue to receive their personalized learning home at `/` through the existing `Home` route logic. About, Contact and FAQ remain supporting public pages; none becomes the default entry page.

The visitor journey is:

1. Understand BuddyForStudy and its learning value from the homepage.
2. Explore public courses and course details without being forced to register.
3. Understand how the platform supports course discovery, structured learning paths and progress tracking.
4. Review published pricing and the available free access.
5. Create an account when they want to save and organise learning activity.
6. Return to their intended destination after authentication.

## Brand and design direction

Use the existing learner design system in `docs/Useruidesignsystem.MD` as the source of truth:

- Inter typography.
- Light canvas `#f7f6fb`, white surfaces, restrained borders and neutral text.
- Learner accent `#5b3fd9` (dark mode `#8c75ff`) for primary actions, links and active states.
- Deep indigo `#1A1B41` may remain a brand/structural colour, not a competing primary button colour.
- 4px spacing scale, existing radius and focus tokens.
- Respect light/dark mode, reduced motion, keyboard access and WCAG contrast.
- Use the existing BuddyForStudy logo/mascot assets; do not invent a new identity.
- Avoid fabricated user counts, reviews, partner logos, testimonials, outcomes or AI capabilities that are not verified in the product.

## Page structure

1. **Public navigation:** brand, Explore, How it works, Pricing, Sign in and one primary Get started action. About, Contact, Help and legal links remain in the footer.
2. **Hero:** concise value proposition, clear primary CTA to Explore and secondary account creation, plus a product-shaped visual preview.
3. **Learning workflow:** discover a course, follow a structured path, track progress.
4. **Explore entry points:** links into the real public course catalogue and pricing; no fabricated course catalogue or metrics.
5. **How it works:** short, concrete steps explaining the existing learner journey.
6. **Conversion section:** invite visitors to create a free account when they are ready to save and organise their learning.
7. **Existing marketing footer:** retain settings-backed footer and public support/legal links.

## 10-task execution register

| # | Task | Acceptance evidence | Status |
|---:|---|---|---|
| 1 | Audit current public routes, guest/auth routing, brand assets, CSS tokens and existing tests | Findings based on the exact baseline branch; identify existing behaviour to preserve | DONE |
| 2 | Finalise visitor journey, content hierarchy and brand-aligned visual direction | This plan records route behaviour, content sections, design tokens and content safeguards | DONE |
| 3 | Redesign the public GuestLanding page | Responsive, semantic homepage using existing product capabilities and brand assets | IN_PROGRESS |
| 4 | Improve public navigation and CTA hierarchy | Explore, How it works, Pricing, Sign in and Get started remain usable at desktop/mobile widths | NOT_STARTED |
| 5 | Add clear product discovery and learning workflow sections | Links lead to existing public routes; no fake catalog data or claims | NOT_STARTED |
| 6 | Align public-page visual styles with the learner design system | Accent tokens, dark mode, focus, reduced motion and consistent spacing | NOT_STARTED |
| 7 | Verify public-page SEO and social metadata | Homepage metadata matches the actual public proposition; generated SEO assets remain valid | NOT_STARTED |
| 8 | Verify responsive and accessibility behaviour | Mobile/tablet/desktop layout, keyboard operation, contrast and semantic headings | NOT_STARTED |
| 9 | Add/adjust browser regression coverage | Guest homepage, authenticated Home, public routes, navigation and learner-data isolation pass | NOT_STARTED |
| 10 | Run final frontend CI and report implementation evidence | Lint, typecheck, unit tests, build, browser checks and exact commit SHA recorded | NOT_STARTED |

## Constraints and safety

- Work only on `buddy-for-study-v2.2`.
- Do not modify `main`, create branches, open PRs, merge or deploy.
- Preserve existing authenticated routing: signed-in learners at `/` must still see their learner dashboard.
- Preserve guest privacy: guest homepage must not fetch learner-only endpoints.
- Preserve current About, Contact, FAQ, pricing, authentication, SEO and footer functionality.
- A task is complete only after its acceptance evidence is verified against the current branch SHA.
