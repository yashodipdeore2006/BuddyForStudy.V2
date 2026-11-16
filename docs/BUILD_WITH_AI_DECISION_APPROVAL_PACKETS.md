# BuddyForStudy — Build with AI Decision & Approval Packets

**Document version:** 1.0  
**Prepared:** 2026-11-16  
**Working branch:** docs/build-with-ai-engineering-readiness  
**Tracker:** [Issue #43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)  
**Readiness report:** [Build with AI Engineering Readiness Report](BUILD_WITH_AI_ENGINEERING_READINESS_REPORT.md)  
**Implementation backlog:** [Prioritized Implementation Backlog](BUILD_WITH_AI_IMPLEMENTATION_BACKLOG.md)  
**Companion decision records:** ADR-002, ADR-004 and ADR-005

---

## 1. Purpose, status and decision authority

This document packages the three unresolved decisions that most directly block the next Build with AI implementation phase:

1. **YouTube API policy and resource-data use** — whether and how the product may use YouTube API Data for resource selection, ranking, evaluation, persistence and display.
2. **Durable roadmap processing** — which job/queue architecture will satisfy the approved D-08 restart-recovery outcome.
3. **Privacy, consent, export and deletion** — what the product must collect, record, retain, export, erase or preserve, and when a privacy request may truthfully be reported as fulfilled.

The packets are decision aids. They are not legal advice, a YouTube compliance audit, an architecture approval, a security certification or implementation authorization.

**All three packets are currently OPEN. No approval is recorded by this document.** A proposed recommendation is not an approved decision. Only the designated decision owner, supported by the required specialist review, can resolve a gate.

### 1.1 Decision-status vocabulary

| Status | Meaning |
|---|---|
| Draft for review | Packet is prepared; decision owner has not recorded a decision |
| Awaiting evidence | A decision cannot be made until specified technical, legal or provider evidence is supplied |
| Approved | Named authorized approver has selected an option and recorded conditions/date |
| Approved with conditions | Implementation is limited by explicit conditions, owners and closure evidence |
| Rejected | Option was considered and explicitly rejected; reason and replacement path are recorded |
| Deferred | No decision; blocked work remains blocked |
| Superseded | A later signed decision replaces this record; history remains available |

### 1.2 Authority and separation of responsibilities

The exact people must be named by the organization; this document does not assign a person by inference.

| Role | Required contribution |
|---|---|
| Product owner | Confirms product scope, user experience, risk appetite and whether a feature is removed, narrowed or delayed |
| Engineering/architecture owner | Confirms feasibility, architecture, migration, testability and implementation impact |
| Security/privacy owner | Reviews data flows, threat model, access control, retention, deletion and operational controls |
| India privacy/legal counsel | Determines applicable law, legal basis, notice/consent semantics, retention exceptions and regulatory obligations |
| YouTube API compliance contact / authorized provider response | Determines whether the exact API use case and any additional metrics are accepted by YouTube |
| Operations owner | Confirms worker topology, monitoring, backup behavior, production controls and incident response |

A product owner cannot self-approve a legal interpretation or YouTube exception. Engineering cannot infer a provider policy exception from quota availability. A successful technical test cannot substitute for the required written policy/legal approval.

### 1.3 Current readiness decision

The consolidated readiness recommendation remains **NO-GO for broad production rollout**. The current implementation backlog has nine P0 items, eleven P1 items and six P2 items. The packets below clarify the approvals needed to unblock selected P0/P1 work; they do not close those items.

---

## 2. Executive decision register

| Decision ID | Gate | Current status | Decision required | Recommended default for review |
|---|---|---|---|---|
| DEC-YT-01 | YouTube API Data use and derived metrics | Open — external policy decision not evidenced | Approve a narrow policy-safe scope, seek explicit acceptance for an exact analytics use case, or remove the affected YouTube feature from launch | Suspend all custom API-derived ranking/quality metrics unless and until the exact use case and metric are accepted in writing; review any replacement selection method before use |
| DEC-JOB-01 | Durable roadmap queue and worker | Open — ADR-002 proposed | Select initial durable job store/queue, worker model, lease/recovery protocol and retention ownership | Accept MongoDB-backed durable queue as the initial implementation, with an adapter boundary and measured BullMQ/Redis migration triggers |
| DEC-PRIV-01 | Registration consent and privacy notice | Open — SEC-03; legal/product decision required | Approve first-time Google-account and local-account acceptance semantics, versioning, optional marketing consent and existing-user behavior | Require versioned Terms and Privacy Policy acceptance before a new account is activated; keep marketing consent separate and optional; counsel must settle exact legal wording and purpose-specific consent |
| DEC-PRIV-02 | Data export, erasure and retention | Open — SEC-04; execution unavailable | Approve the data inventory, legal-retention exceptions, erasure/anonymization rules, processor scope and fulfilment evidence | Do not report a request fulfilled until every in-scope store/processor is completed or a documented legal-retention exception is approved and disclosed |

**Important:** DEC-PRIV-01 and DEC-PRIV-02 are separate decisions. Accepting a privacy policy is not the same as consenting to every optional processing purpose. Accepting a deletion request is not proof that deletion has occurred.

---

# Packet A — YouTube API Data policy and resource selection

## A1. Decision statement

**Decision ID:** DEC-YT-01  
**Related records:** ADR-004, ADR-005, Learning Resource Candidate and Selection Contract, YouTube Quota and Provider Degradation Contract, P0-01 and P0-09 in the implementation backlog.

Decide the launch scope for YouTube API Data used by Normal Search fallback and Build with AI lesson-resource selection. The decision must cover acquisition, filtering, ordering, derived classifications/scores, caching, durable storage, learner-facing display, benchmark/evaluation and deletion.

This is not only a question about view counts. The current source review records that the curation implementation derives multiple candidate-selection and ranking components from YouTube API Data, including descriptive metadata and statistics. Removing raw statistics from a persisted Course object would not, by itself, resolve derived use earlier in the pipeline.

## A2. Current evidence and policy position

### Repository evidence

The readiness source review and ADR-004 record:

- Public search requests use API-key access and are treated as Non-Authorized Data in the current design.
- YouTube metadata is present in temporary caches and durable course lesson/generation snapshots.
- In-process caches are short-lived, but durable Course snapshots do not have an equivalent automatic expiry.
- The current compliance refresher has a 25-day stale threshold but does not replace every provider field, does not fully clear stale fields when a resource becomes unavailable, and does not refresh playlist metadata/membership.
- The compliance job is behind a disabled-by-default flag. The Render manifest declares a worker, but the 2026-11-14 dashboard evidence recorded only the API service; live worker health and effective production flags remain unverified.
- The source review identifies API-derived ranking/quality logic using both statistics and descriptive metadata. It also identifies a risk in treating metadata structure as proof of actual video instruction/content.
- No written YouTube acceptance for BuddyForStudy's educational-resource recommendation use case or its exact metric formulas is recorded in the repository evidence.

These are source-mapped findings and dated operational evidence, not a live production compliance certification.

### Official YouTube policy snapshot checked 2026-11-16

The official Developer Policies state that API Clients must not use API Data to create new or derived data or metrics under the default policy. The policy examples include a score that factors in likes, views or other API Data. Non-Authorized Data is subject to the 30-calendar-day refresh-or-delete rule. The policies also require an API Client to make its privacy policy available and obtain user agreement before users access API Client features. See the official [Developer Policies](https://developers.google.com/youtube/terms/developer-policies).

YouTube's additional derived-metrics policy is conditional. It says the additional pathway applies to audited developers with analytics use cases that have explicitly applied for permission through the standard quota-extension request. It lists examples of allowed analytics metrics and says the API Service must reflect an analytics use case on YouTube. The page does not establish that educational-resource recommendation or curriculum matching qualifies. See [Additional policies for derived metrics and data storage](https://developers.google.com/youtube/terms/derived-metrics-policy).

For developers accepted into that additional policy pathway, certain statistical data and derived metrics may be stored up to 36 calendar months. Other data, including video titles, creator names and descriptions, remains subject to the 30-day refresh/deletion rule. This is not a blanket extension for all API Data and does not imply that BuddyForStudy has been accepted.

YouTube's compliance guide directs developers who are unsure whether their service is allowed to apply for an API Compliance Audit and include a clear summary of the use case and end users. See [Complying with YouTube's Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide).

### Current safe assumption

Until an explicit written decision covers the exact BuddyForStudy use case and method:

- Do not enable or persist custom scores, percentiles, rankings, engagement measures, quality/fit/freshness/coverage metrics or automated benchmark outputs derived from YouTube API Data.
- Do not assume that a metric becomes permitted merely because it is internal, renamed, not displayed, or based on descriptive rather than statistical metadata.
- Do not use the 2026 additional-metrics pathway unless YouTube confirms the use case is accepted and the relevant application/amendment/audit requirements have actually been completed.
- Continue to treat the 30-day refresh/delete requirement as applicable to Non-Authorized API Data. A cache TTL does not prove that durable course snapshots meet the requirement.
- Do not download or store audiovisual content. Use the official player and comply with attribution, privacy and Made For Kids requirements.
- Keep BuddyForStudy-owned feedback (for example, a learner's own helpful/outdated response or course progress) logically separate from YouTube API Data and do not calculate it from YouTube statistics.

## A3. Decision options

| Option | Decision | Advantages | Costs / risks | Consequence |
|---|---|---|---|---|
| A — Retain current derived ranking and seek permission | Apply for the documented audit/permission path with the exact educational-resource use case, data fields, transformations, outputs and retention model | Preserves the intended curation design if accepted | Acceptance is not guaranteed; education-resource recommendation is not shown by the published examples to be an accepted analytics use case; engineering cannot proceed on the assumption of acceptance | Keep affected ranking/metrics disabled until written provider acceptance and internal legal approval are on file |
| B — Narrow launch scope and suspend API-derived metrics | Remove custom API-derived metrics from launch scope; seek counsel/provider review of the exact remaining retrieval, filtering and presentation behavior | Lowest immediate policy exposure while preserving the possibility of a limited provider-resource feature | A renamed heuristic or metadata-only algorithm is not automatically safe; the remaining method still requires review; possible loss of ranking capability | Recommended interim path for review; launch only the specifically reviewed behavior |
| C — Remove YouTube Data API resource discovery from launch | Keep first-party/local resources only until a permitted provider design is confirmed | Clearest boundary when no policy-safe API use is confirmed | Reduces external-resource breadth and may leave some roadmap nodes with no external resource | Use if Option B cannot be approved or implemented safely |

**Recommended default for discussion:** Option B, with a parallel request for a written YouTube determination. If YouTube or counsel cannot confirm a permitted remaining method, choose Option C. Option A is not an approval to keep the current scoring pipeline active while an application is pending.

## A4. Required questions for legal/compliance and YouTube

The written request must describe the actual product accurately and include end users. Request a written answer to each applicable question:

1. Does BuddyForStudy's educational-resource discovery and curriculum-to-video matching qualify as an eligible analytics use case under the additional derived-metrics pathway, given that the product is a learner-facing learning platform rather than a creator analytics/reporting product?
2. Are resource relevance, topic fit, curriculum coverage, freshness, authority, quality or suitability classifications calculated from video title, description, duration, publication date, channel/playlist metadata or statistics permitted for this use case?
3. Is ranking API-returned resources by a formula or heuristic based on those fields permitted? If yes, which exact fields, transformations, user-facing labels and storage terms are permitted?
4. Can a human reviewer use API Data in a playback-based review process and store the resulting judgement? Which source data and reviewer outputs may be retained, and how must their provenance be labelled?
5. Which evaluation outputs can be retained or reported internally (including NDCG, precision/recall, junk-rate and aggregate metrics), and under which exact approved method?
6. Does acceptance require selecting Analytics & Reporting in the standard quota-extension/audit flow, accepting a specific amendment, completing an audit, or receiving additional written approval for the exact proposed metrics?
7. Which data must still be refreshed or deleted within 30 days even after acceptance? Confirm treatment of titles, descriptions, creator identity, playlists, membership and derived metrics.
8. Does the proposed user journey, player rendering, attribution, Made For Kids handling and privacy disclosure satisfy the applicable minimum functionality and policy requirements?

Do not submit a generic statement that BuddyForStudy “uses YouTube for education.” Include concrete request/response field inventory, sample formulas, where values are calculated, whether values are stored, the learner-visible UI and retention/deletion behavior.

## A5. Evidence required to close DEC-YT-01

- A versioned data-flow and field inventory across API gateway, candidate DTOs, caches, Course snapshots, telemetry, benchmark runner and frontend.
- Written YouTube API Services response or acceptance artifact addressing the exact product use case and proposed metrics; preserve the application/audit identifier and approved scope.
- Written Indian/international counsel or qualified compliance review of the planned use, contract terms and user-facing disclosures.
- A signed product decision selecting A, B or C, including features removed or restricted.
- A technical implementation plan for the chosen scope; it must not say “policy safe” until the reviewed implementation matches the approved field/method matrix.
- Separate evidence for refresh/delete, worker health, attribution, player controls and Made For Kids handling before persisted provider snapshots are enabled.

## A6. Decision record — to be completed by approvers

| Field | Entry |
|---|---|
| Decision ID | DEC-YT-01 |
| Selected option | Pending — A / B / C |
| Product owner | Pending |
| Legal/compliance reviewer | Pending |
| YouTube response / audit reference | Pending |
| Exact approved API fields | Pending |
| Exact approved transformations/metrics | Pending |
| Storage and retention terms | Pending |
| User-facing disclosure/player conditions | Pending |
| Conditions and excluded features | Pending |
| Decision date | Pending |
| Review/expiry trigger | Pending |

**No-go condition:** no current derived metric or affected ranking path may be enabled while the acceptance artifact is missing, ambiguous or does not cover the exact use case and method.

---

# Packet B — Durable roadmap jobs and worker architecture

## B1. Decision statement

**Decision ID:** DEC-JOB-01  
**Related records:** D-08, ADR-002, Build with AI API Contracts and Backward Compatibility, P0-02, P0-08 and P1-08 in the implementation backlog.

Approve the initial durable processing architecture that will make accepted roadmap jobs and per-node state survive API/worker restarts, automatically recover unfinished work, preserve completed work, execute idempotently with bounded retries and expose actionable permanent failures.

D-08 is an approved product outcome. This packet asks for an implementation-architecture decision; it does not reopen the user-facing reliability requirement.

## B2. Current evidence and constraints

ADR-002 records the following source-mapped baseline from 2026-11-15:

- The async service schedules work in a process-local JavaScript queue.
- RoadmapDraft persists status, profile, result, idempotency key, events and admission token, but the persisted record is not currently a worker-consumable durable queue contract.
- RoadmapDraft has a one-hour TTL based on createdAt; an active or recoverable job can therefore be deleted if that TTL applies.
- Admission leases are capacity accounting, not execution ownership. Expired admission recovery currently marks queued/building drafts failed rather than resuming unfinished nodes.
- The worker entrypoint handles maintenance and other background jobs but does not consume the roadmap queue.
- The Render manifest declares a worker service, but the 2026-11-14 dashboard evidence recorded only the API service. The current live worker state remains unverified.
- Redis client support and a REDIS_URL configuration do not prove that a durable Redis queue exists. No BullMQ roadmap consumer was found in the inspected source tree.
- The current configured node concurrency is low (NODE_CONCURRENCY=3), and no repository load test establishes a throughput need for a separate queue datastore.

**Failure mode:** the API inserts a durable draft, then places the actual execution callback in API-process memory. If that process stops before work completes, another process cannot recover the callback from the MongoDB draft record. The current recovery path fails the expired job instead of resuming its unfinished work.

## B3. Options evaluated

| Option | Architecture | Advantages | Costs / risks |
|---|---|---|---|
| A — MongoDB-backed queue and job store | API creates a durable job record; one or more workers atomically claim jobs in MongoDB; job and node progress remain in MongoDB | Uses the existing database; one source of truth; fewer infrastructure components; single-document conditional updates can implement atomic claim/lease transitions | Team must engineer polling, lease/fencing, retry, fairness, shutdown, event replay and query indexes; queue workload adds database reads/writes |
| B — BullMQ with Redis-compatible queue | MongoDB remains authoritative for roadmap/result state; an outbox/dispatcher enqueues BullMQ jobs; Redis-backed workers process them | Mature queue features for concurrency, retries, delayed work, stalled-job handling and independent worker scaling | Adds a separately operated queue service and consistency boundary; requires an outbox; current repo has no BullMQ roadmap integration; ephemeral/non-persistent queue storage cannot be the only durable job record |
| C — MongoDB source of truth with a queue adapter/migration seam | Implement A first behind a job-store/dispatcher boundary; migrate transport to B later only when measured operational needs justify it | Avoids premature infrastructure while preserving a migration route; keeps controllers and curriculum logic independent of queue transport | Requires an explicit interface boundary and migration criteria from the start; does not remove the engineering work for Option A |

## B4. Recommendation for approval

**Recommend Option A as the initial execution model, implemented with the Option C migration boundary.**

Reasons recorded in ADR-002:

1. MongoDB is already required and stores roadmap draft/result state.
2. Current observed concurrency is low and no load evidence currently justifies the additional queue datastore.
3. A separate worker entrypoint is already described in the deployment manifest, although deployment/health must be verified.
4. Redis reachability and a BullMQ consumer are not established by the current source baseline.
5. MongoDB supports atomic single-document conditional state updates, provided the team implements expected-state filters, leases and fencing correctly.

This is a recommendation, not a claim that MongoDB is universally better. Option B should be selected now instead if the architecture owner has a measured operational requirement or a managed, persistent Redis-compatible queue is already approved and available.

## B5. Decisions that must be recorded

The approvers must answer each row; accepting “MongoDB queue” without these sub-decisions is incomplete.

| Sub-decision | Proposed default for review | Approval state |
|---|---|---|
| Authoritative state | MongoDB owns job, node, result and replayable event state | Pending |
| Initial queue transport | MongoDB-backed atomic claim and lease | Pending |
| Migration seam | Job-store/dispatcher abstraction; consider BullMQ only on measured triggers | Pending |
| Job model | Decide whether RoadmapDraft evolves or a separate RoadmapJob collection is created | Pending |
| Execution ownership | Worker ID, random lease token, lease expiry and monotonically increasing fencing version | Pending |
| Atomicity | Conditional atomic claim; all writes include current job ID, lease token and fencing version | Pending |
| Idempotency | Stable user-scoped request/idempotency identity; repeat delivery is safe; provider calls are at-least-once | Pending |
| Retry policy | Bounded, classified retries with backoff/jitter; quota exhaustion waits for reset or enters a clear retryable state | Pending |
| Cancellation | Terminal cancellation state; stale worker cannot later finalize | Pending |
| Node recovery | Preserve completed outputs; resume only pending/retryable nodes whose inputs remain compatible | Pending |
| Event recovery | MongoDB-backed persisted event history; reconnect uses last event ID or bounded state replay | Pending |
| Active-job retention | No TTL expiry for an active/recoverable job | Pending |
| Terminal retention | Product/privacy decision required; do not adopt the ADR's proposed 30-day terminal default without privacy approval | Pending |
| Worker deployment | Choose target platform, service identity, region, scaling and shutdown window; verify actual deployment | Pending |
| Feature flag | Async Roadmap stays disabled until all required gates pass and a separate rollout authorization is recorded | Pending |

### Queue implementation invariants

- Admission-capacity reservation and execution lease are separate concepts.
- One active worker owns a valid job lease at a time. Stale workers cannot overwrite newer results.
- A job must be committed to the durable queue before the API reports that it has been accepted.
- Completed curriculum and node outputs are preserved across worker crashes and retries.
- Provider calls are at-least-once where the provider lacks idempotency; do not claim exactly-once external execution.
- Course creation/finalization must be idempotent and must not hold a MongoDB transaction open while waiting on Gemini/YouTube network calls.
- Browser refresh and SSE reconnect must not depend on an API-local in-memory listener map.
- Bounded retry exhaustion produces an actionable terminal failure, not a silent loss or infinite retry loop.
- Active jobs must not expire under a generic draft-created TTL.

## B6. Acceptance and failure-injection evidence

Before Async Roadmap is enabled, require the following tests on the implementation commit:

| Failure scenario | Required behavior |
|---|---|
| API exits immediately after durable job insert | Worker independently claims and completes the job |
| API restarts during active generation | Job remains visible and processing continues or is safely reclaimed |
| Worker exits after claim | Lease expiry permits another worker to reclaim the job |
| Worker exits after several nodes complete | Completed node results remain; only unfinished eligible nodes resume |
| Two workers claim at the same time | Only one obtains a valid lease/fencing version |
| Previous worker continues after lease expiry | Stale writes/finalization are rejected |
| Same idempotency key submitted concurrently | One logical job is admitted; duplicate request returns/reuses it |
| Provider transient failure / quota exhaustion | Bounded retry or explicit deferred state; no hot loop |
| Permanent validation failure | Terminal actionable status without pointless retries |
| Browser refresh / SSE disconnect | Learner reconstructs current state and event history from durable storage |
| SIGTERM during active processing | Worker stops new claims; active work drains or becomes safely reclaimable |
| Job crosses previous one-hour TTL boundary | Active job is not deleted |
| MongoDB outage | Worker backs off, reports degraded state and resumes after recovery |
| Cancellation races with worker completion | A cancelled/stale worker cannot finalize after cancellation wins |

Required operational evidence includes worker heartbeat, last successful poll, oldest queued age, running count, expired leases, retry backlog, terminal-failure count and alert/runbook ownership.

## B7. Dependencies and decision boundary

- G-03 / API contract approval remains a dependency for public job DTO, public state mapping, error envelopes, polling/SSE reconnect and cancellation semantics. Internal worker state such as retry_wait must not leak as an unapproved public state.
- Terminal retention depends on DEC-PRIV-02. Do not decide retention duration in isolation from learner history, privacy, support and legal obligations.
- Operations must verify deployed worker health and its real environment before staging evidence is accepted.
- Approval of DEC-JOB-01 does not approve a production service/plan, Redis provisioning, dependency installation, flag change, deployment or merge. Those changes require the separate implementation and rollout gate.

## B8. Decision record — to be completed by approvers

| Field | Entry |
|---|---|
| Decision ID | DEC-JOB-01 |
| Selected architecture | Pending — A / B / other |
| Architecture owner | Pending |
| Product owner | Pending |
| Security/privacy reviewer | Pending |
| Operations owner | Pending |
| Job model and schema version | Pending |
| Lease/fencing/retry protocol | Pending |
| Terminal retention decision | Pending — linked to DEC-PRIV-02 |
| API contract reference | Pending |
| Conditions and migration triggers | Pending |
| Decision date | Pending |

**No-go condition:** Async Roadmap must remain disabled until the approved durable consumer, restart recovery, node preservation, event recovery and critical failure-injection tests are demonstrated in the approved staging topology.

---

# Packet C — Privacy, registration consent, data export and deletion

## C1. Decision statement

**Decision IDs:** DEC-PRIV-01 and DEC-PRIV-02  
**Related records:** SEC-03, SEC-04, Security Negative-Test Specification, P0-04, P0-05 and P1-11 in the implementation backlog.

Approve the legal/product rules for first-time account creation, privacy notice and consent records, data export, deletion/anonymization, legal retention exceptions and the evidence required before a privacy request can be reported as fulfilled.

This packet deliberately separates:
- Terms of service acceptance;
- privacy-policy acknowledgement/agreement required by the YouTube API Client policy;
- consent for specific personal-data processing purposes where required;
- optional marketing consent;
- identity verification for a privacy request;
- deletion/anonymization execution and legal retention exceptions.

These concepts must not be collapsed into a single Boolean field without legal and product approval.

## C2. Source-mapped product baseline

The Security and Privacy Review records:

### SEC-03 — Google new-account consent gap

- Google login validation permits termsAccepted and privacyAcknowledged to be omitted.
- The controller passes consent only when both are true.
- The service can create a new Google user while consent is null.
- Existing-user sign-in should not require repeated acceptance of unchanged terms; the new-account case needs explicit server enforcement.
- Marketing consent should remain optional and default false.

### SEC-04 — Privacy deletion is intake/review only

- A learner can request export and submit correction/deletion requests.
- The current export identifies itself as partial_repository_inventory.
- The documented omissions include browser-local notes, provider-side records, infrastructure logs and backups.
- Requests can progress through identity_pending and administrative review states.
- The request/status responses state executionAvailable=false and explicitly state that no data has been deleted or anonymized.
- Therefore, the current workflow is not an executable account-deletion or completed privacy-right fulfilment system.

The source review requires an inventory across Mongo collections, object storage, analytics, email, push, Gemini/YouTube, logs and backups; a lawful retention matrix; verified identity; idempotent execution; retries/recovery; session revocation where required; per-store evidence; and a final report describing residual retained data.

## C3. India legal commencement calendar — snapshot as at 2026-11-16

The official Gazette commencement notifications use staged commencement dates. This section records only the dates in the published notifications; it is not a legal opinion about how each provision applies to BuddyForStudy.

### Digital Personal Data Protection Act, 2023

The commencement notification dated 2025-11-13 specifies:

| Effective date | Provisions specified in the notification |
|---|---|
| 2025-11-13 | Section 1(2), section 2, sections 18–26, 35, 38–43, and section 44(1) and 44(3) |
| 2026-11-13 | Section 6(9) and section 27(1)(d) |
| 2027-05-13 | Sections 3–5; section 6(1)–(8) and 6(10); sections 7–17; section 27 except section 27(1)(d); sections 28–34, 36, 37 and section 44(2) |

The dates above follow the notification's one-year and eighteen-month commencement intervals from 2025-11-13. As at this packet's date, the one-year commencement date has passed; the eighteen-month commencement date has not.

### Digital Personal Data Protection Rules, 2025

The final Rules were notified in the Gazette on 2025-11-13. Their commencement clause specifies:

| Effective date | Rules specified in the commencement clause |
|---|---|
| 2025-11-13 | Rules 1, 2 and 17–21 |
| 2026-11-13 | Rule 4 |
| 2027-05-13 | Rules 3, 5–16, 22 and 23 |

**Interpretation boundary:** do not state that every substantive provision of the DPDP Act or every DPDP Rule is already in force on 2026-11-16. Equally, do not infer that BuddyForStudy may defer all privacy work until 2027. Counsel must determine the currently applicable provisions, transitional obligations, any other applicable Indian law, contractual commitments and YouTube/Google policy requirements. The product should be designed now so that its notices, records, access controls and deletion operations can meet the applicable requirements as they commence.

Official references:
- [Digital Personal Data Protection Act commencement notification — G.S.R. 843(E), 2025-11-13 (MeitY Gazette PDF)](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6e5dc0bfa85ebd78686cadad39.pdf)
- [Digital Personal Data Protection Rules, 2025 — G.S.R. 846(E), 2025-11-13 (MeitY Gazette PDF)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)

### Separate YouTube API Client requirement

The current YouTube Developer Policies also require an API Client to require users to agree to a privacy policy before they access its features; the policy must disclose YouTube API use and explain data access, collection, storage, use and sharing, and link to Google's Privacy Policy. The Client's own terms must link YouTube's Terms of Service and explain that use binds the user to those terms. This is a separate provider-policy requirement and must be included in the legal review even while Indian statutory commencement is staged.

Official reference: [YouTube API Services Developer Policies, section III.A](https://developers.google.com/youtube/terms/developer-policies).

## C4. Decision DEC-PRIV-01 — New-account acceptance and consent semantics

### Required decision

Approve the exact account-creation rules for local registration and Google OAuth, including which legal documents and processing purposes require affirmative action, how versions are recorded and when an existing user must be asked again.

### Options

| Option | Decision | Advantages | Risks / consequence |
|---|---|---|---|
| A — Versioned acceptance on new-account completion | Require the current Terms and Privacy Policy acceptance/agreement before creating or activating a new local or Google account; separately record any purpose-specific consent required by counsel; marketing opt-in remains separate | Makes the first-account flow consistent across local and Google registration; supports YouTube's privacy-policy agreement requirement; creates auditable evidence | Legal counsel must approve wording, document versions, notice presentation, purpose-specific consent and what happens when recording fails |
| B — Frontend-only acknowledgement | Let the browser display a checkbox but allow the API to create the account when the field is missing | Lowest immediate client change | Does not close SEC-03; direct API callers can bypass it; not acceptable as a release decision |
| C — Require acceptance on every login | Ask existing users to accept terms/privacy on every OAuth or password login | Strong repeated acknowledgement signal | Creates friction without necessarily addressing the correct legal trigger; does not replace change-of-purpose/version management; not recommended as a default |

**Recommended default for review:** Option A, with a server-enforced distinction between first-time account creation and returning-user authentication.

### Required product/legal rules to approve

1. **New account vs existing account:** verify whether the identity maps to an existing account before applying first-account requirements. Returning sign-in must not create a duplicate account or silently reset consent history.
2. **Terms vs privacy policy:** record the exact document IDs and versions accepted. Acceptance of the platform's Terms must not be described as blanket consent to every processing purpose.
3. **YouTube API privacy policy:** before access to API Client features, require agreement to the privacy policy and ensure it describes YouTube API Services use, data categories, purpose, storage, sharing, third-party processors, user controls and required Google links.
4. **Purpose-specific consent:** legal counsel must identify which purposes rely on consent and which may rely on another legally available basis. Do not create one all-purpose consent Boolean.
5. **Marketing:** separate, optional, default false and independently revocable.
6. **Version changes:** decide which material changes require re-acceptance, a new notice, or renewed purpose-specific consent. A document update must not overwrite the historical acceptance event.
7. **Atomicity:** do not activate a new account if required acceptance/consent evidence cannot be durably recorded. Use a transaction or compensating rollback consistent with the approved database design.
8. **Google OAuth boundary:** Google identity authentication is not a substitute for BuddyForStudy's own Terms/Privacy acceptance. Do not request YouTube channel scopes merely for account sign-in.
9. **Minimization:** collect only consent metadata required to prove the decision; approve any IP/device metadata separately with a defined purpose and retention.

### Acceptance evidence

- Counsel-approved Terms and Privacy Policy version IDs and text; required YouTube terms/privacy disclosures included.
- Signed purpose/legal-basis matrix that separates contract acceptance, policy agreement, consent-based processing and optional marketing.
- Tests for new local user with missing/false/current acceptance; new Google user with missing/false/current acceptance; returning user; outdated document version; marketing left unchecked; and consent-record persistence failure.
- Database evidence shows immutable/versioned acceptance records and no account activation when required evidence is absent.
- Privacy review confirms consent history is requester-scoped, protected and exportable where required.

### Decision record — to be completed

| Field | Entry |
|---|---|
| Decision ID | DEC-PRIV-01 |
| Selected option | Pending — A / B / C / other |
| Product owner | Pending |
| India privacy/legal counsel | Pending |
| Security/privacy reviewer | Pending |
| Required document IDs/versions | Pending |
| Purpose/legal-basis matrix | Pending |
| Existing-user re-acceptance trigger | Pending |
| Marketing consent behavior | Pending |
| Decision date | Pending |

## C5. Decision DEC-PRIV-02 — Export, deletion, anonymization and retention

### Required decision

Approve the system-wide data map and the exact rules for what must be exported, erased, anonymized or retained under a documented exception when a user submits a privacy request or deletes an account.

### Data domains that must be inventoried

The inventory must be derived from actual code, database schemas, provider/vendor configuration and operational practice. At minimum, evaluate:

| Domain | Examples to locate and classify | Questions requiring approval |
|---|---|---|
| Account and identity | User profile, email/phone, OAuth identity mapping, verification state, role and account settings | What is erased, retained or pseudonymized? What identity evidence remains after closure? |
| Consent and legal records | Terms/privacy versions, processing consent events, withdrawal, privacy requests | Which evidence must remain to demonstrate prior choices or respond to disputes, and for how long? |
| Learning product data | Generated roadmaps, private courses, curriculum, quizzes, attempts, progress, notes, preferences and saved resources | Which data is portable, deletable, anonymizable or retained for a learner-requested export/history? |
| Feedback and discovery | Helpful/outdated feedback, impressions, search history and resource selections | Are records user-linked? Can aggregates be retained after irreversible anonymization? |
| Communications | Email provider records, push subscriptions, notifications and delivery logs | What can be deleted at source vs disabled/revoked? What delivery/audit evidence remains? |
| Payments and subscriptions | Orders, invoices, refunds, subscription events, provider references and fraud/risk records | Which transaction records must be kept under applicable financial, tax, fraud or dispute rules? Counsel must identify the rule and period. |
| AI/provider processing | Gemini prompts/responses, provider logs, YouTube API snapshots, caches and external processing references | What is stored by BuddyForStudy, what is processed by vendors, what deletion controls exist, and what cannot be recalled from third-party systems? |
| Security and operations | Audit events, application logs, Sentry/error telemetry, rate-limit events, backups and infrastructure logs | Which records are security evidence; what can be redacted or anonymized; what is the retention/backup expiry schedule? |
| Browser/device state | Browser-local notes, local storage, cached UI data and device-held tokens | What can the platform remotely clear, and what must the user be told to remove locally? |

This is an inventory checklist, not an assertion that every listed system or vendor is currently used or stores every data class. Record each confirmed system, owner, processor, data category, region, retention, export method, deletion method and proof source.

### Options

| Option | Decision | Advantages | Risks / consequence |
|---|---|---|---|
| A — Durable, evidence-based fulfilment workflow | Build an idempotent executor across each in-scope store/processor; support legal holds and approved retained categories; report completion only after evidence is complete | Scalable, auditable and honest; supports retries and partial failure; avoids false fulfilment claims | Requires a full data inventory, legal rules, provider/backup work and significant engineering |
| B — Controlled manual fulfilment as an interim process | Use a counsel-approved operator runbook with per-system checks and evidence until automation is complete | Can provide a bounded interim path without claiming automation exists | Human error and weak scalability; must have separation of duties, restricted access, audit and a named operator; cannot silently become the permanent solution |
| C — Keep intake/review only | Accept requests and leave execution unavailable | Requires little engineering | Does not fulfil the request; product must clearly state the limitation and must not represent the request as completed. Not an acceptable long-term closure path |

**Recommended default for review:** Option A as the target. Option B may be used as a temporary interim control only after counsel approves the process and a named operator, deadline, escalation and evidence standard are established. Option C must not be described as completed deletion or fulfilment.

### Deletion and anonymization workflow to approve

A proposed workflow should include the following controls; exact statuses, deadlines and legal holds require counsel/product approval:

1. **Request intake:** authenticate the requester or provide an approved alternative for users who cannot sign in; capture the requested scope and give a reference number.
2. **Identity verification:** do not disclose or delete another person's data based on an unverified request. Use proportionate verification and avoid collecting excessive identity documents.
3. **Scope resolution:** map the user to all internal identifiers, owned records, object/file references, connected processors and relevant caches.
4. **Legal/contractual review:** identify obligations to retain or preserve particular records. Record the legal basis, owner, data category and expiry/review date for each exception.
5. **Execution plan:** revoke sessions/credentials where required; remove or anonymize each approved data class; send processor deletion requests where supported; clear relevant caches and derived copies; prevent delayed jobs/events from recreating erased records.
6. **Retry and recovery:** each store action is idempotent; partial failures remain visible and retryable; worker/API restart cannot silently drop the request.
7. **Backups:** define how backup copies expire or are made inaccessible, whether restoration can reintroduce erased data, and how deletion is re-applied after restore.
8. **Completion evidence:** record per-system execution result, processor acknowledgement where available, legal-retention exceptions and remaining backup expiry. Keep audit evidence minimized and access-controlled.
9. **User response:** explain what was erased, anonymized or retained and why; do not claim deletion from a third party where the platform cannot perform it.
10. **Closure rule:** only mark fulfilled when every in-scope action is complete or a legally approved exception is documented and disclosed. A request in review, queued, executing or partially failed is not fulfilled.

### Export decision

The current export is explicitly partial and omits browser-local notes, provider-side records, infrastructure logs and backups. Approvers must decide:

- What constitutes the exportable user-data scope for each product feature.
- Whether exported data includes generated course/roadmap artifacts, quiz attempts, progress, feedback, consent history, payments and privacy request history.
- Which data is excluded because it is not personal data, is security-sensitive, is subject to legal retention or is held by a processor that does not support user-level export.
- How omissions are explained without overstating completeness.
- How export is generated securely, scoped to the requester, delivered, expired and audited.

Until the approved data map is implemented, the product must continue to label the existing export as partial. Do not rename the current partial export as a complete data export.

### Retention and legal-hold decision

For every data category, counsel and the relevant business owner must select one of:

- Delete at the approved trigger.
- Retain for a specified purpose and period with restricted access.
- Irreversibly anonymize when identifiable information is no longer needed.
- Preserve under a documented legal hold, dispute or statutory retention obligation, with a review/expiry date.

No generic “keep billing data” or “delete all data immediately” rule is sufficient. Counsel must identify the applicable legal basis and retention period for financial, tax, fraud, security, consent and audit records. The decision must also address vendor-side copies and backup restoration.

### Acceptance evidence

- Approved data inventory and system/processor map covering the domains above.
- Counsel-approved deletion, anonymization, legal-hold, payment-record and backup-retention matrix.
- Export schema mapped to the data inventory, with explicit omissions and tests.
- Executed synthetic-user tests for complete deletion/anonymization, legal hold, duplicate request, retries, partial processor failure, API/worker restart, restored backup, session revocation, cross-user isolation and delayed-event re-creation.
- Operator runbook, roles/permissions, audit evidence and escalation path.
- User-facing status and completion language reviewed by legal/privacy.
- No request can reach a fulfilled state while required actions remain outstanding.

### Decision record — to be completed

| Field | Entry |
|---|---|
| Decision ID | DEC-PRIV-02 |
| Selected option | Pending — A / B / C / other |
| Product owner | Pending |
| India privacy/legal counsel | Pending |
| Security/privacy reviewer | Pending |
| Data inventory owner | Pending |
| Approved data map version | Pending |
| Legal retention and hold matrix | Pending |
| Export completeness decision | Pending |
| Deletion deadline/operating target | Pending — counsel to determine |
| Backup and processor treatment | Pending |
| Decision date | Pending |

---

## 3. Approval meeting preparation checklist

The meeting is decision-ready only when the following materials are available:

### Before the meeting

- [ ] Name the decision owners and required reviewers.
- [ ] Attach the exact YouTube data-flow/field inventory, metric formulas, candidate DTOs, caches, persisted snapshots and UI examples.
- [ ] Prepare the YouTube audit/permission submission with the real educational-resource use case and end-user journey.
- [ ] Attach the current queue sequence, state-transition diagram, failure model, staging topology and API-contract proposal.
- [ ] Prepare the privacy data map from actual schemas, routes, storage services, vendor configuration, logs and backups.
- [ ] Obtain Indian privacy counsel's review of current staged DPDP commencement, other applicable laws, terms/privacy notice, consent purposes, retention and deletion.
- [ ] Bring explicit option selections and list any remaining conditions; do not infer acceptance from silence.

### During the meeting

- [ ] Record a selected option for every decision ID, or record Deferred with the missing evidence and next owner.
- [ ] Record approver names, role, authority, date and any conflict/recusal.
- [ ] Record exact conditions, excluded features, expiry/review trigger and residual risks.
- [ ] Identify which implementation-backlog items become unblocked and which remain blocked.
- [ ] Confirm that no production flag, deployment, database migration or merge is being authorized accidentally.

### After the meeting

- [ ] Update the relevant ADR/decision record with the outcome and rationale.
- [ ] Attach or link the written external YouTube response and legal review; do not paraphrase these as approvals if they are conditional or limited.
- [ ] Update Issue #43 and the implementation backlog with owner, status and evidence links.
- [ ] Create a separate implementation branch from the then-current main only after implementation authorization.
- [ ] Keep every feature flag and production service unchanged until the separate rollout gate is approved.

---

## 4. Decision resolution template

Copy this section once for each decision when the authorized approvers are ready to decide.

**Decision ID:**  
**Decision title:**  
**Decision date:**  
**Selected option:**  
**Status:** Approved / Approved with conditions / Rejected / Deferred  
**Decision owner and authority:**  
**Required reviewers:**  
**Evidence reviewed:**  
**Rationale:**  
**Approved scope:**  
**Explicit exclusions:**  
**Conditions and closure evidence:**  
**Residual risks and accepted owner:**  
**Implementation-backlog items unblocked:**  
**Items that remain blocked:**  
**Review/expiry trigger:**  
**Links to written approvals:**  

No approval is validly recorded by filling in a recommendation or by changing a draft status. The decision record must be completed by the authorized owner and linked to the supporting evidence.

---

## 5. Current recommendation and next action

- **YouTube:** use Option B as the conservative planning default, request an explicit written determination for the exact educational-resource use case, and use Option C if no permitted implementation can be confirmed. Keep the current derived ranking path disabled.
- **Durable jobs:** seek approval for MongoDB-backed queue as the initial implementation with a transport abstraction and evidence-based BullMQ migration triggers. Keep Async Roadmap disabled until restart/failure tests and worker health pass.
- **Privacy:** seek counsel approval for first-account versioned Terms/Privacy acceptance, separate optional marketing consent, a complete data map and evidence-based deletion/export. Keep deletion status honest; the current workflow does not execute deletion.

**Task 14 status:** Complete — decision packets prepared for review only.

**Overall readiness:** NO-GO for broad rollout remains unchanged.

**Execution boundary:** no application code, tests, builds, CI, live provider calls, staging checks, production configuration, database, feature flags, deployment, merge or main-branch changes were made. No YouTube approval, legal approval, architecture decision or release authorization is claimed.
