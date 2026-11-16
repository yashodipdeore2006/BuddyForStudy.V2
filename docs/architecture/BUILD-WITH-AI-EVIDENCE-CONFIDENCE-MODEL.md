# Build with AI Evidence and Confidence Model

**Status:** Proposed cross-flow contract — owner approval and implementation pending  
**Date:** 2026-11-16  
**Scope:** Intent parsing, learner profile, curriculum generation, skill resolution, syllabus grounding, resource discovery/selection and learning outcomes  
**Related:** [ADR-006 — Versioned Gemini output validation](ADR-006-versioned-gemini-output-validation.md), [ADR-003 — Canonical skill resolution](ADR-003-domain-aware-skill-resolution.md), [Learning Resource Candidate and Selection Contract](LEARNING-RESOURCE-CANDIDATE-SELECTION-CONTRACT.md), [Target Architecture](BUILD-WITH-AI-TARGET-ARCHITECTURE.md)

## 1. Objective

Every important value used to generate or personalize a roadmap must answer:

1. What is the claim/value?
2. Where did it come from?
3. Who or what asserted it?
4. When was it observed or confirmed?
5. How was it transformed or inferred?
6. What evidence supports it?
7. Is it current and permitted for this use?
8. What should the system do if it is unknown, stale, conflicting or low quality?

The system must not collapse these questions into one generic confidence number. A Gemini confidence estimate, a learner-confirmed preference, a source-backed exam heading, a YouTube metadata field, a human review and a learner completion event are different evidence types and must remain distinguishable.

This is a proposed architecture contract. It does not authorize changes to generation behavior or production data.

## 2. Evidence classes and trust boundaries

| Class | Examples | What it can establish | What it cannot establish by itself |
|---|---|---|---|
| Learner-confirmed | Preferred language, level, study time, goal, exam date | The learner explicitly supplied or confirmed that value at a recorded time | Objective skill level or future intent |
| Learner-observed / first-party event | Quiz answer, lesson completion, practice submission, feedback | A platform event occurred under a particular assessment/event definition | Durable mastery unless the assessment is validated |
| Trusted external source | Supplied syllabus text, official exam document, verified organization policy | Claims directly present in the identified source and captured version | Facts not present in the source; future validity without refresh |
| Provider metadata | YouTube title, description, duration, language tag, availability | What the provider API returned at a successful fetch time | Actual spoken language, content quality, transcript accuracy, teaching effectiveness |
| Human-reviewed | Reviewer inspected a resource or adjudicated a skill match | A scoped human assessment by a named/role-based reviewer at a time | Universal or permanent truth; unreviewed portions |
| Model-inferred | Gemini intent, inferred level, suggested topic mapping | A model-generated hypothesis under a specific prompt/model/schema version | Learner confirmation, source verification or objective truth |
| Platform-derived | Deterministic schedule arithmetic, DAG validation, normalized duration | Result of a reproducible platform rule and recorded inputs/version | Validity of the underlying inputs |
| Unknown / conflicting | Missing, stale, ambiguous or contradictory values | That evidence is insufficient or inconsistent | Any positive claim |

Trust is claim-specific, not a single global ranking. For example, learner confirmation is authoritative for the learner's preference, but not for an official syllabus heading; an official syllabus is authoritative for its published wording, but not for the learner's current proficiency.

## 3. Provenance envelope

Every persisted decision-relevant value should be accompanied by a provenance envelope, either inline or through a referenced evidence record.

Proposed logical shape:

```ts
type EvidenceSourceType =
  | "learner_confirmed"
  | "learner_event"
  | "trusted_document"
  | "provider_metadata"
  | "human_review"
  | "model_inference"
  | "platform_rule"
  | "unknown";

type EvidenceStatus =
  | "current"
  | "stale"
  | "superseded"
  | "disputed"
  | "rejected"
  | "unknown";

interface EvidenceProvenance {
  evidenceId: string;
  subjectType: string;
  subjectId: string;
  claimKey: string;
  sourceType: EvidenceSourceType;
  sourceRef?: string;              // controlled document/resource/event reference
  sourceVersion?: string;
  observedAt?: string;             // when source fact/event was observed
  recordedAt: string;              // when platform stored it
  confirmedAt?: string;            // learner/reviewer confirmation time
  actorType: "learner" | "reviewer" | "provider" | "model" | "system";
  actorRef?: string;               // internal ID or approved pseudonymous reference
  model?: { provider: string; name: string; promptVersion: string; contractVersion: string };
  transformation?: { ruleId: string; ruleVersion: string; inputs: string[] };
  status: EvidenceStatus;
  expiresAt?: string;
  limitations: string[];
}
```

This is a logical contract, not an instruction to persist every field on every MongoDB document. Use references and normalized records where appropriate. Avoid duplicating sensitive learner text or raw provider payloads. Evidence records must follow access control, privacy deletion, retention and provider-specific data policies.

## 4. Confidence is typed and scoped

Do not expose a universal `confidence: 0.93` field without a defined claim, method, calibration set and interpretation.

Use a typed assessment only when a real assessment method exists:

```ts
interface ConfidenceAssessment {
  claimKey: string;
  assessmentType:
    | "intent_classification"
    | "skill_identity_match"
    | "syllabus_heading_match"
    | "resource_language_match"
    | "resource_content_review"
    | "learning_mastery";
  value?: number;                  // [0, 1], only for calibrated methods
  band?: "high" | "medium" | "low" | "not_assessed";
  methodId: string;
  methodVersion: string;
  calibrationDatasetVersion?: string;
  evaluatedAt: string;
  evidenceIds: string[];
  limitations: string[];
}
```

Rules:

- A numeric value is allowed only if the method is calibrated for that exact assessment type and target population/domain.
- Model self-reported confidence is not calibrated confidence. Store it as model output/provenance, not as verified probability.
- Thresholds are assessment-specific. Intent classification thresholds cannot be reused for skill matching or learning mastery.
- If no calibration evidence exists, use categorical evidence status or `not_assessed`; do not invent a score.
- Missing evidence is not zero confidence and is not positive evidence. Represent it as unknown/not assessed.
- Confidence must never override a hard policy, ownership, privacy, language-choice or source-validity gate.

## 5. Cross-flow contracts

### 5.1 Intent parsing

For each parsed field, retain:
- raw learner input reference or safely minimized input snapshot;
- normalized value;
- source type (`learner_explicit` or `model_inferred`);
- model/provider, prompt version and contract version for inferred fields;
- model-provided confidence separately from any calibrated platform assessment;
- clarification status and learner confirmation event.

A model inference may guide a clarification question or provisional plan. It must not silently become a learner-confirmed preference. Explicit learner corrections supersede inferred values and preserve an audit trail without retaining unnecessary raw text.

### 5.2 Learner profile and personalization

Each profile attribute has its own provenance and confirmation status. Examples:
- Preferred language: learner-confirmed unless explicitly marked inferred.
- Study time: learner-confirmed value plus confirmation timestamp; schedule calculations record the rule/version and inputs.
- Current skill level: learner self-assessment, diagnostic assessment or model inference must be distinguished.
- Known skills: retain the original learner answer and the canonical resolution decision; an ambiguous skill match is not a confirmed known skill.

A profile update invalidates only dependent personalization artifacts/caches. It must not rewrite generic curriculum templates or unrelated learner history.

### 5.3 Curriculum and Gemini output

Gemini output is an untrusted proposal until validated against the versioned task schema and semantic invariants in ADR-006.

For every material curriculum claim, retain:
- task/contract and prompt versions;
- normalized validated output version;
- whether the claim was learner-provided, source-backed, model-generated or platform-derived;
- any source reference and exact supported text where the task requires source grounding;
- repair/rejection codes and bounded regeneration history.

Do not label generic model-generated topic recommendations as official, syllabus-backed or industry-required unless the relevant source supports that claim. A valid JSON schema does not prove factual correctness.

### 5.4 Skill identity and graph

Skill resolution must preserve:
- learner/model input label;
- resolved canonical ID, if deterministic and unambiguous;
- domain scope and match type;
- benchmarked method/version for fuzzy matching, if later approved;
- candidate set and review status when ambiguous;
- reviewer decision and alias provenance for manual adjudication.

Until the ADR-003 benchmark and owner gates are met, fuzzy candidates remain suggestions. A provisional skill is not equivalent to a canonical confirmed skill. Graph validation is platform-derived evidence about structural invariants, not proof that the curriculum is educationally complete.

### 5.5 Exam and trusted-source grounding

A syllabus-backed claim must point to a source identity/version and the exact source text or heading that supports it. Preserve:
- source title/type/issuer where known;
- URL or controlled source reference;
- retrieval/issue date and document version;
- exact extracted heading/section text;
- extraction method/version and reviewer status if reviewed.

If a generated unit is not literally supported by the source under the approved extraction rule, label it as a suggested study topic, not an official syllabus unit. If the source is missing, inaccessible or outdated, disclose that limitation and request a source or mark the claim unverified.

### 5.6 Resource evidence

Use the evidence levels in the Learning Resource Candidate and Selection Contract:
- metadata only;
- human reviewed;
- learner feedback;
- unknown.

Provider metadata must have a successful fetch timestamp and provider snapshot version. It does not prove video content. Human review must record scope, reviewer, date and review criteria. Learner feedback is a first-party event and must not be merged with YouTube engagement data. The YouTube API-derived ranking/score policy gate in ADR-004 remains controlling.

### 5.7 Learning progress and mastery

Distinguish activity from mastery:
- `started` / `watched`: activity evidence only;
- `completed`: completion under a defined platform rule, not necessarily mastery;
- quiz/practice result: assessment evidence tied to assessment version, rubric, attempt and timestamp;
- demonstrated mastery: only when a validated assessment policy defines the required evidence and threshold;
- learner self-report: self-reported confidence/understanding, not independently verified mastery.

Do not infer mastery solely from video runtime, watch completion, course completion or time spent. Learning analytics must disclose the assessment definition and evidence window.

## 6. Conflict, staleness and supersession

When evidence conflicts, do not average incompatible claims or let the latest timestamp win blindly.

Apply claim-specific precedence:
1. Enforce legal, privacy, safety, ownership and provider-policy constraints first.
2. Prefer the designated authoritative source for that claim (e.g. learner for preference; official syllabus for official wording).
3. Prefer an explicit learner correction over an earlier model inference for learner intent.
4. Prefer a successful current provider lookup over an older provider snapshot for provider metadata.
5. Preserve human adjudication with reviewer provenance; reopen review if material source evidence changes.
6. If two authoritative sources conflict or scope is unclear, mark disputed and ask for clarification or human review.

Stale evidence is not silently promoted to current. Define expiry per source class and policy. Provider metadata follows ADR-004's hard retention boundary. A learner-confirmed preference does not automatically expire, but may be reconfirmed when context changes. Official documents require version/date awareness. Assessment results are immutable historical events; a new attempt supersedes current mastery status without erasing history.

## 7. User-facing disclosure

Use concise, accurate labels:
- **You told us:** learner-confirmed.
- **Suggested from your request:** model-inferred.
- **Based on the supplied syllabus:** source-backed, with source/date available.
- **Provider metadata:** factual fields returned by the provider, not content verification.
- **Human reviewed:** scoped review with date.
- **Based on your activity:** first-party learner events.
- **Not yet verified / needs confirmation:** unknown, stale or disputed.

Do not display internal model confidence as a promise of accuracy. Explanations should identify the strongest supporting evidence and a material limitation, not fabricate a chain of reasoning.

## 8. Privacy, security and retention

- Store the minimum evidence needed to explain and reproduce a decision.
- Do not persist raw prompts, raw provider payloads or sensitive profile data merely to create provenance.
- Use access-controlled source references; never expose internal actor IDs or private source documents to other learners.
- Propagate deletion requests to evidence records and dependent derived records where required.
- Provider metadata retention is governed by ADR-004, not by the generic evidence ledger.
- First-party learner event retention is governed by BuddyForStudy privacy policy and user deletion requirements.
- Logs contain event IDs, versions, outcome categories and safe diagnostics, not secrets or full learner content.

## 9. Acceptance criteria

| Scenario | Expected behavior |
|---|---|
| Gemini infers preferred language | Mark inferred; do not show as learner-confirmed |
| Learner corrects inferred language | Learner confirmation supersedes inference; dependent personalization is invalidated |
| Gemini emits a confidence number | Store as model-reported output, not calibrated probability |
| Intent classifier has no calibration set | Use not-assessed/categorical state; no numeric confidence threshold claim |
| Fuzzy skill match is ambiguous | Preserve candidate set and require review; do not merge |
| Official syllabus heading is generated but absent from source | Do not label it official/source-backed |
| Source document version changes | Old claims remain traceable; affected claims become review/refresh candidates |
| YouTube metadata is current | Evidence remains metadata-only absent human/content review |
| Video is watched to completion | Record activity/completion; do not infer mastery automatically |
| Quiz result is recorded | Bind result to assessment version, rubric and attempt |
| Evidence sources conflict | Mark disputed and invoke claim-specific resolution; do not silently average |
| Evidence expires or becomes stale | Mark stale/unknown and follow source-specific refresh policy |
| User deletion applies | Remove eligible first-party evidence and dependent records under privacy policy |
| Provider data reaches retention deadline | Apply ADR-004 refresh/delete controls independently |

## 10. Open approvals and implementation gates

1. Approve the provenance envelope and decide which evidence is inline versus normalized.
2. Define per-claim authoritative source and conflict-resolution policy.
3. Select calibrated datasets/methods for each numeric confidence assessment; no universal confidence threshold.
4. Approve learner-facing disclosure labels and confirmation UX.
5. Define first-party evidence retention, deletion propagation and access-control rules.
6. Map current API DTOs/models to this contract and identify backward-compatible migrations.
7. Implement in stages with contract tests, privacy tests, source-grounding tests and observability; no implementation begins from this proposal alone.

**Approval boundary:** Documentation only. No prompt, model, API, schema, database, product behavior, feature flag, deployment or `main` branch change is authorized.
