# BuddyForStudy — Decision Resolution Register & Authorization Gate

**Register version:** 1.0  
**Snapshot date:** 2026-11-16  
**Working branch:** docs/build-with-ai-engineering-readiness  
**Tracker:** [Issue #43 — Engineering readiness](https://github.com/yashodipdeore2006/BuddyForStudy.V2/issues/43)  
**Decision packets:** [Build with AI Decision & Approval Packets](BUILD_WITH_AI_DECISION_APPROVAL_PACKETS.md)  
**Implementation backlog:** [Prioritized Implementation Backlog](BUILD_WITH_AI_IMPLEMENTATION_BACKLOG.md)  
**Readiness report:** [Consolidated Engineering Readiness Report](BUILD_WITH_AI_ENGINEERING_READINESS_REPORT.md)

---

## 1. Purpose and current determination

Task 15 evaluates whether the outstanding decisions have actually been resolved and whether the evidence permits implementation authorization.

**Determination: decision-resolution review complete; approvals and implementation authorization remain outstanding.**

The repository's Issue #43 was fetched on 2026-11-16. It was open and contained 22 comments. The latest relevant entries were Task 11, Task 12, Task 13 and Task 14 documentation-completion records. No product-owner, legal/privacy, YouTube/provider, architecture or operations approval was recorded in the issue comments inspected for this review.

This is not proof that no conversation or approval exists outside the repository. It means there is no auditable approval evidence in the current readiness tracker. Therefore the register does not mark any pending decision as approved.

### 1.1 What this task can and cannot do

This task can:
- identify the exact decision owner categories and mandatory reviewers;
- distinguish internal decisions from external/provider/legal determinations;
- record recommendations without converting them into approvals;
- establish which work remains blocked and which is only awaiting implementation authorization;
- provide the exact resolution record needed when an approver responds.

This task cannot:
- grant YouTube policy permission or complete a YouTube audit;
- provide legal advice or determine legal applicability on behalf of Indian counsel;
- approve an architecture on behalf of the designated engineering/operations owners;
- infer a product-owner choice from the instruction "next";
- authorize code changes, infrastructure provisioning, feature-flag changes, a pilot, merge or production deployment.

### 1.2 Decision-status vocabulary

| Status | Meaning |
|---|---|
| Draft for review | Packet is prepared; decision owner has not recorded a decision |
| Awaiting evidence | A decision cannot be made until specified technical, legal or provider evidence is supplied |
| Approved | Named authorized approver has selected an option and recorded conditions/date |
| Approved with conditions | Implementation is limited by explicit conditions, owners and closure evidence |
| Rejected | Option was considered and explicitly rejected; reason and replacement path are recorded |
| Deferred | No decision; blocked work remains blocked |
| Superseded | A later signed decision replaces this record; history remains available |

### 1.3 Authority and separation of responsibilities

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

### 1.4 Current readiness decision

The consolidated readiness recommendation remains **NO-GO for broad production rollout**. The implementation backlog has nine P0 items, eleven P1 items and six P2 items. These packets clarify the approvals needed to unblock selected work; they do not close those items.

---

## 2. Decision status register

| ID | Decision / gate | Authority required | Current status | Resolution required |
|---|---|---|---|---|
| DEC-YT-01 | YouTube API Data, derived metrics and resource-selection scope | Product owner + qualified compliance/legal review + written YouTube/API Services determination where permission is sought | **Open — external policy evidence missing** | Select a launch scope and retain written policy determination for the exact use case/method |
| DEC-JOB-01 | Durable roadmap queue and worker architecture | Product owner + engineering/architecture owner + operations/security review | **Open — ADR-002 proposed** | Explicitly accept/revise/reject MongoDB queue recommendation and approve lease, recovery, retention and worker design |
| DEC-PRIV-01 | New-account Terms/Privacy acceptance and purpose-specific consent | Product owner + India privacy/legal counsel + security/privacy review | **Open — legal decision missing** | Approve exact document versions, purposes/legal bases, new-vs-returning account behavior and consent-record semantics |
| DEC-PRIV-02 | User export, deletion/anonymization and retention | Product owner + India privacy/legal counsel + data/operations owners + security/privacy review | **Open — fulfilment not implemented** | Approve data map, retention/hold matrix, export scope, processor/backup handling and completion rule |
| DEC-API-01 | Build with AI public API/job DTO, state and error compatibility | Product owner + API/engineering owner + client owner | **Open — proposed contract** | Approve versioned routes/DTOs, public states, error envelopes, reconnect/cancel behavior and legacy migration |
| DEC-SKILL-01 | Canonical skill domains, aliases and fuzzy-resolution governance | Product owner + engineering/AI owner + benchmark reviewer | **Open — ADR-003 proposed** | Approve domain model, alias provenance/approval, false-merge policy, benchmark and migration safeguards |
| DEC-GEM-01 | Gemini schema/prompt compatibility and rollback | Product owner + AI/engineering owner + security reviewer | **Open — ADR-006 proposed** | Approve immutable schema/prompt versioning, validation, repair/retry, cache and rollback policy |
| DEC-RELEASE-01 | Implementation authorization and Go/No-Go | Product + engineering + security/privacy + operations approvers | **Open — NO-GO** | Review closure evidence, residual risks, rollout/rollback and explicitly authorize bounded implementation/release scope |

**No decision above is marked Approved or Approved with conditions.**

---

## 3. Resolution analysis by decision

### 3.1 DEC-YT-01 — YouTube API Data and metrics

**Status:** Open — requires external/policy determination.

The current official YouTube Developer Policies prohibit creating new or derived metrics from API Data under the standard policy and specify a 30-calendar-day refresh-or-delete requirement for Non-Authorized Data. The same policy says that if a user deletes an account from an API Client, the API Client must delete related user data as soon as possible and within 7 calendar days. These are separate requirements: the 30-day API Data lifecycle limit is not a substitute for the 7-day user-related deletion obligation. See [Developer Policies — data storage/deletion and derived metrics](https://developers.google.com/youtube/terms/developer-policies).

The separate additional-metrics policy is limited to audited developers with analytics use cases that explicitly applied for and received permission under the relevant amendment. It states that the API Service must reflect an analytics use case on YouTube. It does not establish that learner-facing course/video recommendation qualifies. See [Additional policies for derived metrics and data storage](https://developers.google.com/youtube/terms/derived-metrics-policy).

**Current resolution position:**
- Do not enable the current custom API-derived score/ranking path on the assumption that an exception will be granted.
- Product may select a narrow launch path with policy-reviewed retrieval/presentation, or remove YouTube API discovery until the method is confirmed.
- If the additional-metrics path is pursued, the exact end-user use case, fields, calculations, storage, disclosures and evaluation outputs must be included in the request.
- A generic quota increase or API key working successfully is not policy approval.

**Recommended interim path:** keep unapproved derived metrics disabled; ask for written determination on the exact use case. If a compliant remaining selection method cannot be confirmed, remove YouTube API discovery from the affected release scope. This is a recommendation only.

**Owner action:** the product owner must choose whether to pursue written permission while retaining a restricted fallback path, or defer YouTube discovery from the launch scope. The external policy determination remains external.

**Closure evidence:** written YouTube response/audit scope; legal/compliance review; signed product scope selection; exact API field/transformation matrix; verified implementation and retention/player/attribution evidence.

### 3.2 DEC-JOB-01 — Durable job architecture

**Status:** Open — internal architecture approval required.

D-08 already approves the product outcome: jobs and per-step/node state survive API/worker restarts, completed work is preserved, unfinished work automatically recovers, processing is idempotent with bounded retries, and terminal failures are actionable. D-08 does not itself approve queue technology.

ADR-002 recommends a MongoDB-backed durable queue as the initial design, with a job-store/dispatcher abstraction and evidence-based BullMQ/Redis migration triggers. Its implementation still requires engineering review of atomic claims, lease/fencing, event replay, retention, cancellation, indexes, worker scaling, shutdown and failure injection.

**Recommended choice for explicit review:** Option A — MongoDB-backed queue and job record, retaining the Option C migration seam. This recommendation is supported by the current repository baseline, but it remains a proposal until an authorized architecture owner accepts it.

**Owner action:** product owner confirms the intended product direction; engineering/architecture owner validates the protocol; operations confirms deployment and worker health requirements. If any owner rejects the proposal, ADR-002 must record the alternative and trade-offs before implementation.

**Closure evidence:** accepted ADR; agreed model/state transitions; lease/fencing/retry/retention decisions; worker topology; API contract dependency; failure-injection plan and implementation authorization.

**No-go:** Async Roadmap remains disabled until the durable consumer is deployed and its restart, stale-worker, node-preservation, idempotency and event-replay tests pass.

### 3.3 DEC-PRIV-01 — Account acceptance and consent

**Status:** Open — requires qualified legal/privacy review.

SEC-03 records that the Google new-account flow can create an account while legal-consent fields are absent. The legal decision must distinguish Terms acceptance, privacy-policy agreement, purpose-specific consent where legally required, and optional marketing consent.

The current YouTube API Client policy separately requires users to agree to a privacy policy before accessing API Client functionality. It requires disclosure that the Client uses YouTube API Services and descriptions of relevant access, collection, storage, use and sharing. The policy also requires a link to Google's Privacy Policy and a link to YouTube's Terms of Service in the Client's own terms. See [YouTube Developer Policies, section III.A](https://developers.google.com/youtube/terms/developer-policies).

**Recommended default for review:** a consistent server-enforced, versioned first-account acceptance flow for local and Google registration; existing users are not asked to accept unchanged terms on every login; material version/purpose changes trigger the counsel-approved re-acceptance or notice flow; marketing remains separate, optional and off by default.

**Owner action:** product owner agrees the intended registration experience; India privacy/legal counsel approves document language, purpose/legal-basis matrix, version rules and existing-user treatment. Engineering then implements the approved server boundary.

**Closure evidence:** counsel-approved versions and purposes; immutable consent event structure; tests for missing/false/outdated acceptance, new Google/local accounts, returning users, marketing opt-out and persistence failure.

### 3.4 DEC-PRIV-02 — Export, deletion and retention

**Status:** Open — legal/data decision and implementation required.

SEC-04 records that the current export is marked partial_repository_inventory, with omissions including browser-local notes, provider-side records, infrastructure logs and backups. The privacy request workflow permits intake and review, but its responses identify executionAvailable=false and explicitly state that no user data has yet been deleted or anonymized.

**Recommended target:** an idempotent evidence-based deletion/anonymization executor across all in-scope stores and processors, with approved legal-retention exceptions. A manually operated interim workflow is acceptable only if counsel approves it, an operator is named, and access, audit, deadlines, retries and user communications are specified. The current intake-only workflow is not a fulfilment process.

**Owner action:** product owner confirms the service-level product expectation; legal counsel decides legal holds and record-specific retention; data/operations owners complete the system/processor inventory; security/privacy reviews authorization and evidence minimization.

**Closure evidence:** approved data map and retention matrix; complete export schema or explicit omissions; executed synthetic-user erasure/export tests; processor/backup behavior; retry/recovery; legal-hold tests; and user-facing completion language.

### 3.5 DEC-API-01 — API/job contracts

**Status:** Open — product and engineering approval required.

The existing API contract document proposes versioned intent/build/job/result DTOs, stable public lifecycle states and errors, sync/async parity, reconnect semantics and a legacy compatibility window. These remain proposals. Internal worker state such as retry_wait must not be exposed as a public API state without a deliberately approved mapping.

**Owner action:** product and engineering owners approve public semantics and compatibility period before a client migration or route change is implemented.

**Closure evidence:** accepted contract and OpenAPI/schema definitions; contract tests; old-client compatibility tests; sync/async parity and polling/SSE reconnect/cancel tests.

### 3.6 DEC-SKILL-01 — Skill governance

**Status:** Open — domain/AI owner decision required.

ADR-003 proposes domain-scoped, ambiguity-first skill matching, approved aliases with provenance, fuzzy candidates without automatic merges until a labelled benchmark is approved, and migration safeguards. The benchmark specification describes hard negatives, adjudication, concept-clustered splits and false-merge-first evaluation, but no labelled dataset or calibrated threshold is established.

**Owner action:** decide domain representation, alias approval authority, cross-domain identity rules and whether fuzzy results remain suggestions pending benchmark results.

**Closure evidence:** accepted ADR; approved dataset/governance; holdout benchmark results; threshold decision; stable-ID migration and rollback plan.

### 3.7 DEC-GEM-01 — Gemini output contract

**Status:** Open — AI/engineering approval required.

ADR-006 proposes strict server-owned schema and semantic validation before cache/persistence, immutable contract versions, independent prompt versions, cache compatibility and bounded repair/retry. Product/engineering approval and implementation remain pending.

**Owner action:** approve supported output versions, rejection/repair behavior, regeneration compatibility and rollback policy.

**Closure evidence:** accepted ADR; versioned schemas/prompts; adversarial/invalid/partial/incompatible output tests; proof invalid data is not cached or persisted.

### 3.8 DEC-RELEASE-01 — Implementation authorization

**Status:** Open — NO-GO.

No code work is authorized by Tasks 13–15. Once approvals and affected workstream evidence are available, the formal authorization record must specify:
- exact workstream and scope;
- implementation branch created from the then-current main;
- named product, engineering, security/privacy and operations approvers;
- PR/test/CI requirements;
- allowed staging/provider budgets;
- production flags that must remain off;
- deployment, merge and rollback permissions;
- residual risks explicitly accepted by an authorized owner.

The decision to approve one architecture does not automatically approve all application code, a production service plan, deployment, flag enablement or broad rollout.

---

## 4. Work that can be prepared independently vs work that remains blocked

| Workstream | Can be prepared now? | Implementation condition |
|---|---|---|
| Normal Search zero-Gemini isolation (D-01 / ADR-001) | Yes — implementation design and test cases can be refined; ADR-001 is accepted | Product-code changes still require DEC-RELEASE-01 authorization |
| D-07 private ownership parity (sync/async and save path) | Yes — test design and migration plan can be prepared because the product outcome is approved | Product-code changes still require DEC-RELEASE-01; do not loosen ownership/privacy |
| Security negative-test harness | Yes — synthetic fixtures and route matrix can be prepared | Test execution/code changes must follow the separately approved implementation/test authorization and safe environment rules |
| Durable queue implementation | No, not before DEC-JOB-01 and DEC-API-01 are accepted | Accepted ADR, API semantics and DEC-RELEASE-01 |
| YouTube-derived metrics/ranking | No | Exact external policy acceptance and counsel/product scope decision |
| Persisted YouTube snapshots and compliance worker | Only lifecycle planning can proceed | Policy scope, retention/delete implementation and verified worker topology |
| Google consent enforcement | Only approved UX and technical design can proceed | DEC-PRIV-01 |
| Privacy deletion/export fulfilment | Data inventory planning can proceed | DEC-PRIV-02; legal retention and processor rules |
| Skill resolver migrations/automatic alias merges | Benchmark and governance planning only | DEC-SKILL-01 and accepted ADR-003 |
| Gemini schema/prompt migration | Design review only | DEC-GEM-01 and accepted ADR-006 |
| Pilot or production rollout | No | Relevant P0/P1 evidence plus DEC-RELEASE-01 |

This separation is intentional: approval of an unrelated workstream does not release a blocked one.

---

## 5. Resolution process and required record

For every decision:
1. Identify the authorized decision owner by name and role.
2. Attach the evidence listed in the corresponding approval packet.
3. Record Selected option, Approved / Approved with conditions / Rejected / Deferred, rationale, excluded scope and residual risk.
4. Obtain each mandatory reviewer sign-off. An external/provider decision must include the actual provider response or audit record.
5. Update the relevant ADR, implementation backlog and Issue #43 with links to the approval evidence.
6. Re-evaluate dependencies. Only the work explicitly unblocked may move to implementation planning.
7. Obtain a separate DEC-RELEASE-01 authorization before changing application code or runtime behavior.

### Copy-ready resolution record

    Decision ID:
    Decision title:
    Selected option:
    Status: Approved / Approved with conditions / Rejected / Deferred
    Decision owner (name and role):
    Required reviewers:
    Evidence reviewed:
    Rationale:
    Approved scope:
    Explicit exclusions:
    Conditions and acceptance evidence:
    Residual risk and accepted owner:
    Implementation backlog IDs unblocked:
    Backlog items still blocked:
    Decision date:
    Review/expiry trigger:
    Links to approvals:

Do not mark an item approved from a recommendation, an unanswered request, a verbal assumption or a document authoring task.

---

## 6. Task 15 outcome

**Task 15 status:** Complete — decision-resolution assessment and authorization-gate register prepared. Actual approvals remain pending.

**Repository evidence:** Issue #43 was inspected on 2026-11-16; the latest task comments recorded documentation completion through Task 14. No formal decision approvals were present in the issue comments inspected.

**Overall readiness:** **NO-GO** for broad rollout and no general implementation authorization.

**Execution boundary:** documentation-only on docs/build-with-ai-engineering-readiness. No application code, tests, builds, CI, provider calls, staging checks, production settings, database, feature flags, deployment, merge or main-branch changes were made. No legal, provider, architecture or product approval is claimed.
