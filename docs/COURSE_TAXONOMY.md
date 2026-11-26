# Course taxonomy and domain-aware discovery

## Taxonomy model

BuddyForStudy keeps three distinct concepts:

1. **Domain** — a controlled, stable top-level identifier such as `software-development`, `data-ai`, or `health-wellness`.
2. **Category** — the existing course category value. It remains intact for compatibility and acts as the subject/subcategory label.
3. **Tags** — optional, searchable cross-cutting keywords (maximum 20 per course, 40 characters per tag).

Domain IDs are persisted, not display labels. The registry in `server/src/utils/courseTaxonomy.js` owns the allowed IDs, labels, legacy aliases, and query-intent aliases.

## Legacy-data strategy

- The `domain` field is optional and defaults to `null`; existing course records do not require a disruptive bulk migration.
- Known legacy category values are resolved through exact aliases for filters and search.
- Unknown legacy categories remain discoverable in unfiltered catalog and search results. The system does not guess a domain for them.
- Admins can assign a canonical domain. The existing category is retained and suggested from the values already present in the catalog.
- Tags are normalized to lowercase, whitespace-normalized, deduplicated, and bounded on admin updates.

## Search behavior

- An explicit domain filter is validated against the registry.
- Search intent is mapped to a domain only when the query has one unambiguous domain.
- When a query spans multiple domains or has no reliable domain signal, no inferred domain filter is applied.
- For an unambiguous query, courses with a known, conflicting domain/category are excluded. Unclassified legacy records remain visible until an admin classifies them.
- Search continues to match title, description, category, learning outcomes, and tags. Domain filtering is an additional relevance guard, not a replacement for text matching.

## Operations and compatibility

- Public and admin catalog APIs expose the canonical domain options. The public API also supplies live category facets grouped by resolved domain.
- The category/domain facet cache is bounded to five minutes and invalidated by admin classification changes and publication lifecycle changes.
- Existing category values, course URLs, course IDs, publication controls, and course pricing are not rewritten by this change.
- New domain/tag fields are returned in public course previews and the admin course editor.

When adding a domain, update the registry and its alias-focused tests. Prefer adding aliases to an existing domain over creating a near-duplicate domain. Keep aliases specific; ambiguous intent should resolve to no inferred domain.
