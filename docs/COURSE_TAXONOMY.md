# Course taxonomy and domain-aware discovery

## Taxonomy model

BuddyForStudy separates three classification layers:

1. **Domain** is the controlled top-level learning area. It uses a stable ID such as `software-development`, `data-ai`, or `health-wellness`.
2. **Category** is the existing subject/subcategory label. It remains unchanged for compatibility with existing course records and URLs.
3. **Tags** are optional cross-cutting descriptors (for example, `react`, `beginner-project`, or `interview-preparation`). Up to 20 tags are stored per course, with a 40-character limit per tag.

The canonical registry, aliases, and query intent rules live in `server/src/utils/courseTaxonomy.js`. Persist domain IDs, not display labels. Treat IDs as stable API data; add new IDs rather than renaming existing ones.

## Search and filtering behavior

- The server validates explicit domain filters against the registry.
- Search infers a domain only when the query has one unambiguous domain signal. Cross-domain and generic terms (for example, Python or SQL alone) do not trigger a domain filter.
- When an inferred or explicit domain is applied, courses with a known conflicting domain/category are excluded.
- Unknown legacy categories remain discoverable until an administrator classifies them. The system does not guess their domain from descriptions, outcomes, or generated text.
- Supplementary YouTube resources are filtered by the same conservative domain inference. Resources without a reliable domain signal are retained rather than dropped on a guess.
- Category facets come from the complete published catalogue, grouped by domain, rather than from whichever search results happen to be loaded in the browser.

## Existing-course backfill

A deterministic backfill script is available. It only fills a missing/null `domain` when the existing `category` resolves through a registered alias. It does not change category names, titles, descriptions, publication state, pricing, tags, or course content. Unmatched categories remain unclassified.

The script is **dry-run by default**. From the repository root:

```bash
npm --prefix server run taxonomy:backfill
```

Inspect the `unmatchedCategories` summary and the proposed `byDomain` counts. A bounded preview is supported:

```bash
npm --prefix server run taxonomy:backfill -- --limit 500
```

Only after reviewing the preview, apply the recognized mappings:

```bash
npm --prefix server run taxonomy:backfill -- --apply
```

A bounded apply can be run with `npm --prefix server run taxonomy:backfill -- --apply --limit 500`. The operation is idempotent: it updates only records that still have a null/missing domain. Re-running it will not overwrite an administrator's explicit classification. Unknown categories remain unchanged and can be assigned through Admin → Courses.

## Cache and compatibility

The public taxonomy/category facets use a five-minute shared cache with a process-local fallback. Course classification changes and admin publication lifecycle mutations invalidate the cache; the migration invalidates the shared cache after applying changes. Process-local cache entries age out within five minutes.

The course category field, course IDs, URLs, pricing, enrollment, and publication controls remain compatible. Domain and tags are additive metadata, returned by public course previews and editable in the admin course editor.

## Extending the registry

When adding a domain:
- Add an immutable ID, display label, and aliases to `courseTaxonomy.js`.
- Keep aliases specific; do not add ambiguous terms such as a programming language or database query language as a domain signal on its own.
- Add tests for alias normalization, cross-domain ambiguity, and legacy filter matching.
- Preserve unknown values as unclassified until there is enough evidence for a deterministic mapping.
