# Course discovery ranking policy

**Policy:** `course-ranking-v1`  
**Owner:** server-side course discovery  
**Status:** Initial deterministic policy; weights require calibration against a labelled catalogue

## Purpose and boundary

Search ranking runs only after the published-catalogue query and domain/relevance filter have selected the eligible candidate set. It scores the complete candidate set before pagination. It does not weaken publication approval, enrollment, pricing, entitlement or canonical-domain rules.

Normal Explore search remains deterministic and does not call Gemini to rank catalogue courses.

## Composite score

Every component is normalized to 0–100. The initial weighted score is:

| Component | Weight | Interpretation |
|---|---:|---|
| Query/topic relevance | 35% | Coverage across title, taxonomy/tags, learning outcomes and description, with a small exact-title phrase bonus |
| Catalogue completeness | 25% | Presence and completeness of core catalogue metadata, learning outcomes and curriculum structure |
| Curriculum coverage | 15% | Structural coverage proxy based on outcome, module and lesson counts |
| Confidence-adjusted learner rating | 15% | Approved, non-hidden rating aggregate adjusted toward a prior when review counts are small |
| Popularity | 5% | Active/completed enrollment signal with logarithmic diminishing returns |
| Freshness | 5% | Exponential recency signal with a two-year decay constant |

The policy weights sum to 100 and are returned with the score so the result is reproducible and explainable. A version change is required when component definitions or weights change materially.

## Rating confidence

The rating stage reads only reviews with `moderationStatus: approved` and `isHidden != true`. The current prior is 3.5/5 with a strength of 10 review-equivalents:

```
adjustedAverage = (observedAverage × reviewCount + 3.5 × 10) / (reviewCount + 10)
confidence = reviewCount / (reviewCount + 10)
```

A course with one review therefore cannot use a raw five-star average as though it had a large, stable sample. With no valid aggregate, the neutral prior is used and confidence is zero. Invalid averages or counts are ignored rather than converted into a 1-star/5-star signal.

The prior is an explicit conservative starting assumption, not a claim about the current catalogue-wide mean. Calibrate it from an audited review distribution before changing it.

## Popularity and freshness

Popularity is based on active and completed enrolments, normalized logarithmically against a reference of 1,000 enrolments and capped at 100. This keeps popularity a weak tie-breaking signal instead of letting older/high-volume courses dominate.

Freshness uses `100 × exp(-ageDays / 730)`. Invalid timestamps receive zero. Future timestamps are treated as age zero.

## Structural quality proxy limitations

The catalogue-completeness and curriculum-coverage components measure observable structure only. They do **not** establish that content is accurate, pedagogically effective, complete in substance, watched, or associated with improved learning outcomes. Outcome/completion signals remain excluded until reliable, sufficiently populated data and an offline evaluation set exist.

The public course preview may expose the policy version, total score, component scores, weights, and rating confidence details. Learner-facing reason labels and additional sort modes are handled separately under Task DISC-004.

## Supported sorting modes

The public catalogue accepts five server-validated sort values:

| URL/API value | Learner label | Ordering |
|---|---|---|
| `best_match` | Best match | Composite ranking score; when a search query exists, query relevance remains a component of that score |
| `quality` | Highest quality | Structural catalogue completeness (45%), curriculum coverage (25%), confidence-adjusted rating (30%) |
| `popular` | Most popular | Active/completed enrolments descending, then structural quality |
| `highest_rated` | Highest rated | Confidence-adjusted approved rating, then review count and structural quality |
| `newest` | Newest | Creation timestamp descending, then composite ranking |

For all five modes, catalogue publication and the explicit/inferred domain boundary are applied before ranking. Selecting Highest quality, Most popular, Highest rated or Newest never broadens the query candidate set or reintroduces a known cross-domain course.

Legacy `recent` URLs map to `newest`; legacy `title` URLs map to `best_match`. New UI state uses only the five canonical values. Explore stores the selected value in its URL so refresh and browser history restore it.

### Learner-facing ranking reasons

Public previews may include concise reason labels generated from the deterministic ranking components:

- Strong match for your search / Relevant to your search.
- Detailed course information.
- Structured learning path.
- Positive learner ratings (requires at least five approved reviews and a confidence-adjusted average of at least 4.2/5).
- Popular with learners (at least 100 active/completed enrolments).
- Recently added (freshness score at least 75).

These labels describe the specific observable signals; they do not claim measured learning effectiveness or independently verified instructional quality. Cards show at most two reasons to keep the explanation concise.

## Pagination and deterministic behavior

- Domain/relevance filtering occurs before this ranker.
- The full filtered direct-course candidate set is scored before page slicing.
- Standalone module-derived candidates use the same policy.
- Ties break on component relevance, creation timestamp, then stable course ID.
- Rating inputs are the approved aggregates already used by the public catalogue.

## Golden regression fixtures

Task DISC-005 adds a fixed fixture set in `server/test/fixtures/courseDiscoveryRanking.fixtures.js` and focused tests in `server/test/courseDiscoveryRanking.fixtures.test.js`.

| Regression | Expected invariant |
|---|---|
| Cross-domain search | A React/software-development intent excludes Data & AI records, including records whose legacy category conflicts with an explicit canonical domain |
| Unknown legacy catalogue item | An unclassified legacy record remains discoverable rather than being guessed into another domain |
| Ambiguous mixed intent | A query spanning React and Data Analytics does not force a single domain |
| Low review count | A single five-star review is confidence-adjusted below an established 4.7-star rating with 150 reviews |
| Structural quality | A well-described, outcomes-rich, structured curriculum outranks a sparse course in Highest quality, even when the sparse course has a larger raw rating sample |
| Composite golden output | The fixed complete React fixture locks its catalogue-completeness, popularity, freshness, quality and composite values under a fixed clock |
| Pagination | 37 candidates produce seven non-overlapping pages; their concatenation equals the full deterministic ordering, independent of input order |
| Relevance versus popularity | A strong exact-topic result remains ahead of a weak cross-topic record with a very high enrolment count |

Run these fixtures with `npm test` from `server/`. Any intentional scoring-policy change must review and update the fixtures alongside the policy version and documentation.

## Validation

The unit suite covers policy version/weight integrity, relevance ordering, small-sample shrinkage, invalid-rating fallback, logarithmic popularity, bounded structural components, all supported sort modes and deterministic full-set ordering. The DISC-005 fixture suite adds the cross-domain, confidence, quality and pagination golden regressions above.

The numeric weights and thresholds are initial defaults. Further calibration should use human-labelled results rather than the ranker’s own score.
