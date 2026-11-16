# Build with AI Cache Architecture and Invalidation Contract

**Status:** Proposed contract — owner approval, measurement and implementation pending  
**Date:** 2026-11-16  
**Scope:** Intent parsing, roadmap templates, generated-course reuse, YouTube discovery/curation, per-node resources and durable generation state  
**Related:** [Target Architecture](BUILD-WITH-AI-TARGET-ARCHITECTURE.md), [ADR-004 — YouTube resource data lifecycle](ADR-004-youtube-resource-data-lifecycle.md), [ADR-005 — Curation quality and YouTube quota model](ADR-005-curation-quality-and-youtube-quota-model.md), [ADR-006 — Versioned Gemini output validation](ADR-006-versioned-gemini-output-validation.md), [Evidence and Confidence Model](BUILD-WITH-AI-EVIDENCE-CONFIDENCE-MODEL.md)

## 1. Purpose and non-negotiable boundaries

Caching should reduce repeated Gemini/YouTube calls and latency without returning an incompatible curriculum, leaking learner-specific data, suppressing recovery after quota failures, or retaining provider data beyond its policy deadline.

A cache is an optimization, never the source of truth for:
- ownership, privacy, course visibility, publication, enrollment or payment entitlements;
- learner-confirmed profile values or learner progress;
- job state, retry eligibility, cancellation or resumability;
- current YouTube resource availability/freshness;
- current product policy or access control.

Every cache must have an explicit owner, data classification, key contract, TTL/expiry behavior, invalidation events, failure behavior and telemetry. A cache hit must not bypass authoritative validation or authorization.

## 2. Current repository baseline (source inspection, 2026-11-16)

The following facts were verified on the working branch. They are a baseline, not approval of the current design.

| Layer | Current storage / key | Current TTL / behavior | Observed concern |
|---|---|---|---|
| Intent parse | Mongo `IntentParseCache`, unique `normalizedQuery` | 30 days; TTL index on `expiresAt` | Key omits explicit prompt/model/contract version. Result includes model-derived profile/confidence/question plan. |
| Roadmap template | Mongo `RoadmapTemplate`, SHA-256 of topic, goal, level, language, prompt version, outcome and preferences | 30 days; TTL index | Key currently omits course depth, schema/contract version, domain and canonical skill registry version. |
| Generated-course reuse | Query against published/eligible `Course` records by mode/topic keys/exact query/prompt version | 30-day createdAt lookback; not a cache TTL | This is persistent course reuse, not a disposable cache. Must continue to enforce visibility, approval, deletion and owner rules. |
| Curation syllabus | Process memory + Redis + Mongo `CourseCurationCache` | Gemini syllabus 30 days; fallback syllabus 6 hours | Key is engine-kind + normalized query; prompt/schema/model version and source provenance need explicit identity. |
| Candidate-search pool | Process memory + Redis + Mongo | 24 hours with candidates; 5 minutes empty | Key includes query/category/level/language/result count, but search policy/provider API version and other search dimensions require review. |
| Candidate evaluation | Process memory + Redis + Mongo | 14 days | Key includes engine version and candidate identity; cached evaluation is model-derived and must be tied to evaluator prompt/schema/model versions and policy approval. |
| Curated results | Process memory + Redis + Mongo | 14 days with results; 5 minutes empty | Result key includes engine version, query/category/mode/level/language/node type/result count/cache scope/overrides hash. Selection-policy and evidence-contract version must be explicit. |
| Per-node resource selection | Mongo `CourseCurationCache` | `NODE_CACHE_TTL_DAYS`, default 14 and bounded to 25 in node curation config | Key includes engine version, canonical skill, skill-context hash, mode, level, language, duration bounds and cache scope. Selected payload includes provider metadata and score fields; ADR-004 policy gate still applies. |
| YouTube search response | Process-local Map | 1 hour | Process-local only; key includes search options/query. Not shared across instances. |
| YouTube video/channel details | Process-local Maps | 24 hours | Process-local only; provider data must be revalidated/deleted under ADR-004. |
| Generic Redis helper | Redis | Caller-supplied TTL; default 60 seconds | Redis unavailable/timeout returns cache miss/failure; caller must remain correct without it. |
| Durable roadmap/job state | Mongo documents/events | Job retention, not cache TTL | Must not be evicted while queued/running/retryable or within supported resume window. |

Additional verified implementation details:
- Curation reads local memory, then Redis, then Mongo. Writes populate all three best-effort.
- The process-memory curation cache trims when it exceeds 5,000 entries, removing expired entries and then oldest entries down to 4,000.
- Curation result and candidate pools have separate keys and TTLs. Empty result/pool entries use a five-minute negative TTL.
- Node curation caches only successful selections; quota-limited and empty results are not persisted as node cache entries.
- `forceRefresh` bypasses the result/pool/node read path where implemented, but the invalidation helper currently targets the curated-result key only. It does not establish a universal invalidation mechanism for every dependent cache.
- Mongo TTL indexes delete asynchronously; application reads must still enforce `expiresAt > now`. TTL index cleanup is not an exact-time deletion guarantee.
- The 30-day YouTube metadata retention ceiling is a hard policy boundary for non-authorized API Data, not a recommended cache TTL. ADR-004's 25-day refresh target and day-30 delete-or-refresh requirement apply to durable snapshots as well as cache layers.

## 3. Cache taxonomy and ownership

### 3.1 Computation caches

May cache deterministic or validated reusable computation outputs:
- intent classification result;
- generic roadmap template;
- syllabus extraction/normalization;
- candidate discovery pool;
- candidate evaluation, only if policy-approved;
- curated result, only if policy-approved;
- node-level selected resource, only if policy-approved.

These caches must be versioned and disposable. Their absence must not change correctness.

### 3.2 Persistent product records (not caches)

Do not treat these as cache entries:
- learner-specific generated courses and course snapshots;
- learner profile and confirmation history;
- roadmap job state, per-node state and event history;
- learner progress, assessment attempts and feedback;
- canonical Skill registry and approved alias data;
- first-party resource references and explicit learner choices.

They require product lifecycle, authorization, retention and migration contracts. A TTL must not delete active/resumable jobs or learner-owned course state.

### 3.3 Provider data classification

Any cache or persistent snapshot containing YouTube API Data must carry:
- provider/resource identity;
- snapshot version and field provenance;
- successful provider `lastVerifiedAt`;
- expiry/revalidation deadline;
- eligibility state and deletion state.

Never advance freshness on cache read, Mongo save, worker heartbeat or failed provider request. Do not store audiovisual content. Keep first-party learner progress/feedback outside the provider snapshot. Apply ADR-004's refresh/delete rule even when the same metadata is copied into several cache tiers.

## 4. Canonical cache envelope

Proposed logical envelope:

```ts
interface CacheEnvelope<T> {
  cacheKind: string;
  keyVersion: number;
  key: string;                     // opaque digest; no raw learner text
  payloadVersion: string;          // DTO/schema contract version
  payload: T;
  createdAt: string;
  expiresAt: string;
  sourceVersions: {
    promptVersion?: string;
    modelVersion?: string;
    schemaVersion?: string;
    engineVersion?: string;
    policyVersion?: string;
    registryVersion?: string;
  };
  scope: "global" | "tenant" | "user" | "job";
  sourceEvidenceIds?: string[];
  providerLastVerifiedAt?: string;
}
```

The exact persistence shape can vary by store. The required semantics do not:
- Cache key and payload versions are distinct.
- Version changes must make incompatible entries unreachable, even if old entries remain until TTL cleanup.
- Do not put raw queries, user IDs, syllabus text or private profile values into observable Redis keys. Hash normalized key material; apply HMAC or an equivalent keyed digest if keys could expose low-entropy personal input through offline guessing.
- Payloads must pass current DTO/schema validation before use. Old cache payloads must be rejected or explicitly migrated; never trust a cached object solely because it deserializes.
- A cache hit returns source/version/freshness metadata for telemetry and decision auditing.

## 5. Cache key contracts

Every key is a hash of a canonical, sorted serialization of all inputs that can change the output. Do not hash arbitrary object insertion order or omit a meaningful policy dimension.

| Cache | Required key dimensions |
|---|---|
| Intent parse | Normalized query; intent task contract/schema version; prompt version; model identifier/version; normalization version; locale if it changes parsing behavior |
| Roadmap template | Canonical topic + domain; goal; level; course depth; curriculum scope; language only if it changes generic curriculum; outcome/preferences that materially alter template; prompt version; schema/contract version; model version; canonical skill registry/graph version; template composition version |
| Syllabus extraction | Normalized topic/query; source identity/version or content digest; extraction task schema/prompt/model version; source type and extraction policy |
| Candidate-search pool | Normalized query set; category/domain; provider and API/search options; language filter and explicitness; result count; content type; search policy version; query-builder version |
| Candidate evaluation | Candidate IDs and metadata snapshot versions; syllabus/required-topic digest; evaluator prompt/schema/model version; rubric/policy version |
| Curated result | Candidate-pool key/version; selection-policy version; duration/content/Shorts bounds; level; language and explicitness; node type; learner-confirmed filters; result count; cache scope; evidence contract version |
| Node resource result | Canonical skill ID; skill-context digest; curriculum/node requirement version; level; language/provenance; duration/content policy; selection-policy/evidence version; provider snapshot policy version; cache scope |
| Provider detail | Provider + resource type + provider ID + requested field set/API version; successful snapshot version. Do not mix different field projections under one key. |

**Version requirements:** A release changing a prompt, output schema, model, skill registry semantics, candidate query builder, selection policy, provider field projection or evidence interpretation must bump the corresponding version dimension. Engine version alone is not a substitute for explicit schema and policy versions.

**Personalization rule:** A generic template cache must not include or return learner-specific known skills, private syllabus text, profile confirmation, progress, schedule or generated course state. If a value depends on an individual learner, either apply it after generic template retrieval or use a private user/job-scoped cache with explicit authorization and short retention. Never solve a missing user scope by placing sensitive data into a global key.

## 6. TTL policy and expiry behavior

The existing TTLs in §2 are source facts, not approved future values. Do not extend TTLs to improve hit rate until freshness, privacy, policy and version compatibility are demonstrated.

Proposed policy:
1. Every entry has an explicit TTL and absolute `expiresAt`; no immortal cache entries.
2. Set the TTL according to data volatility, cost of recomputation, risk of stale output and maximum permitted retention.
3. Provider metadata TTL must remain below the 30-calendar-day hard maximum and must leave time for successful refresh/deletion. Follow ADR-004's 25-day operational refresh target; use earlier refresh when known changes/ineligibility occur.
4. Empty/negative results use short bounded TTLs. Quota-limited, timeout, provider outage, authorization failure and internal errors must not be cached as authoritative empty results.
5. Cache only validated successful outputs. Schema-invalid or semantically invalid Gemini responses are never cached.
6. A stale cache entry is a miss for correctness-sensitive flows. Stale-while-revalidate is allowed only for data classes where policy and product semantics explicitly permit it; never show stale provider availability/language as current.
7. Mongo TTL cleanup is asynchronous; application queries must reject expired entries even if the TTL monitor has not deleted them.
8. TTLs for durable product records/jobs are separate from cache TTLs and must respect ownership, retention and resume guarantees.

## 7. Invalidation matrix

| Change/event | Required invalidation |
|---|---|
| Intent prompt/schema/model/normalizer changes | New intent cache key version; invalidate or age out old incompatible entries |
| Learner corrects an inferred profile value | Invalidate user-scoped intent/profile-derived artifacts and personalized results; generic templates may remain if unaffected |
| Course depth/scope/goal/language changes | Invalidate affected template/personalization and resource selection keys; do not invalidate unrelated learners' entries |
| Canonical skill merge, alias approval or graph change | Bump registry/graph version; invalidate affected template and node-resource keys; preserve old course IDs via explicit migration mapping |
| Required topic/syllabus/source version changes | Invalidate syllabus and dependent candidate-evaluation/curation keys |
| Search query builder, provider options or API field projection changes | Bump candidate-search/provider-detail key version |
| Curation rubric/model/prompt/policy changes | Invalidate candidate-evaluation and curated-result keys; only use evaluation metrics after policy clearance |
| Duration/Shorts/content-type/language policy changes | Invalidate affected result/node keys |
| Admin result-count/search settings change | Invalidate candidate-pool and result keys that include the setting |
| YouTube video/playlist updated or unavailable | Replace or delete provider snapshot and all dependent cached copies; update selection/node availability |
| YouTube day-25 refresh due / day-30 hard deadline | Revalidate or delete provider metadata across all stores; do not rely on TTL alone |
| User deletes account/course or requests applicable data deletion | Delete user-scoped caches and applicable first-party records; remove references/snapshots according to provider and privacy policies |
| Course is unpublished, archived, private or ownership changes | Re-check authoritative course state at read time; invalidate reuse indexes where appropriate; cache must never grant access |
| Job cancelled/retried/resumed | Durable job/node state controls behavior; cached computation may be reused only if key/version/owner scope still matches |
| Cache corruption or payload schema mismatch | Treat as miss, emit safe diagnostic, delete/quarantine bad entry; regenerate under current contract |

Use versioned keys for broad deterministic invalidation. Use explicit index/tag/reference tracking for targeted invalidation when stale provider copies or user-scoped data must be physically removed promptly. A version bump alone is not enough for mandatory deletion or provider-retention compliance.

## 8. Failure and concurrency semantics

- **Redis unavailable:** fall through to Mongo where available, then recompute. Cache failure must not fail the learner's request unless the operation itself is a required durable write (which is not a cache).
- **Mongo cache unavailable:** local/Redis cache may serve only when payload is valid and not expired; otherwise recompute. Do not report a cache write as successful when persistence failed.
- **All cache tiers unavailable:** compute normally subject to provider quota/rate limits. Apply admission control and bounded provider budgets to avoid a thundering herd.
- **Cache stampede:** use per-key request coalescing or short-lived distributed single-flight leases for expensive work. Lease loss must not permit stale results to overwrite a newer version.
- **Concurrent writes:** use version-aware conditional writes or immutable versioned keys; older work must not overwrite a newer policy/schema result.
- **Quota exhaustion:** return typed `quota_limited`; do not cache it as empty/no-resource. Retry after quota reset under the durable job retry policy.
- **Provider error:** preserve prior first-party progress; do not advance provider freshness; do not replace a valid cache with a false empty success.
- **Corrupt/invalid cache:** validate on read, delete/quarantine and recompute. Do not silently coerce incompatible payloads.
- **Force refresh:** bypass all relevant read layers and refresh the dependent data path; document which downstream caches are also invalidated/replaced. A bypass of only the final result cache is not a complete force refresh.
- **Cache writes are best effort:** authoritative state writes and required retention/deletion operations are not best effort.

## 9. Security, privacy and isolation

- A cache key is not an authorization mechanism. Re-check owner, visibility, publication and entitlement against authoritative records on every protected read.
- Global caches may contain only genuinely reusable, non-personalized data approved for global sharing.
- User/job-scoped entries must include the scope in key and access checks; never return them across users.
- Do not cache private learner course objects in shared result/template caches.
- Minimize sensitive values in payloads, keys, logs and metrics. Hash key material; avoid retaining raw syllabus text/query/profile fields unless needed and approved.
- Respect account/course deletion and data subject requests across local memory, Redis, Mongo and any derived cache copies.
- Provider metadata is subject to ADR-004 even when embedded in a generic curation payload. Keep provider snapshots separable from first-party learner data so deletion is complete and auditable.

## 10. Observability and measurement

Measure by cache kind, workflow and storage tier:
- lookups, hits, misses, expired entries and invalid payloads;
- hit rate and age-at-hit (do not treat hit rate alone as quality);
- read/write latency, timeout/error rate and fallback tier;
- payload size and eviction count;
- stampede/coalescing count and duplicate in-flight work;
- invalidation reason and propagation lag;
- provider requests and quota saved by cache layer/endpoint;
- oldest provider snapshot age, due refresh count, refresh failure and day-30 deletion count;
- stale/invalid result incidents and user-visible correction rate.

Do not log raw learner queries, private syllabus text, API keys, full provider URLs containing credentials or full cache payloads. Report aggregated dimensions with safe IDs.

A cache-efficiency target must be set only after a representative staging/production baseline. ADR-005's cold upper-bound model is a stress envelope, not evidence of current hit rate or forecasted savings.

## 11. Acceptance matrix

| Scenario | Expected behavior |
|---|---|
| Same normalized intent query, same versions | Reuse validated intent result |
| Intent prompt/schema/model version changes | Old entry is not reused |
| Same topic, different course depth | Different template cache identity |
| Same topic, different learner's private syllabus/progress | No cross-user payload reuse |
| Template payload schema is outdated | Reject as miss or explicit migration; never blindly deserialize and trust |
| Canonical skill graph changes | Affected templates/node resources become unreachable or are explicitly invalidated |
| Preferred language changes | Prior language's selected resource is not reused as current selection |
| Empty search result | Short negative TTL only |
| YouTube quota exhausted | No negative cache; node remains retryable |
| Redis is down | Correctness preserved through fallback/recompute and bounded admission |
| Mongo TTL monitor has not removed expired record | Read query rejects it based on `expiresAt` |
| Provider metadata reaches refresh deadline | Refresh or delete under ADR-004 across all copies |
| Provider reports video unavailable | Cached provider snapshot and dependent selection are cleared |
| Cache stampede occurs | Single-flight/coalescing bounds duplicate provider calls |
| Force refresh requested | All relevant layers are bypassed/refreshed, not just the outer result key |
| User requests deletion | Applicable user-scoped and derived cache copies are removed |
| Private/unpublished course is in a cache | Authoritative access check prevents unauthorized return |
| Job is running or resumable | Cache eviction cannot delete durable job state |

## 12. Open approvals and implementation gates

1. Approve the cache taxonomy and ownership boundaries, especially generated-course reuse versus disposable cache.
2. Approve the full version dimensions for intent/template/resource keys, including depth, schema, model, policy, skill registry and evidence contract versions.
3. Decide whether intent parsing is a globally reusable query-only computation or must be user-scoped for any fields derived from private context.
4. Approve data-class-specific TTLs after measuring latency, cost, volatility and hit rate; do not invent new TTL targets from the current stress model.
5. Approve negative-cache and stale-while-revalidate rules per data class.
6. Select invalidation implementation (versioned namespaces, tags/reference index, explicit deletion events) and prove provider/user deletion propagation.
7. Add cache contract tests, concurrency/stampede tests, cross-user isolation tests, expiry tests and provider-retention tests.
8. Measure cache hit rates and endpoint quota savings before making capacity or cost claims.

**Approval boundary:** Documentation only. No code, cache keys, TTLs, Mongo indexes/data, Redis data, provider requests, production flags, deployment or `main` branch changes are authorized.
