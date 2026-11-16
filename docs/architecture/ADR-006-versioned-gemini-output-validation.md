# ADR-006 — Versioned Gemini output validation and prompt compatibility

**Status:** Proposed — requires product/engineering approval  
**Date:** 2026-11-16  
**Scope:** Build with AI structured-output boundaries  
**Related:** [Build with AI target architecture](BUILD-WITH-AI-TARGET-ARCHITECTURE.md), readiness plan Task 04

## 1. Context

Gemini response schemas constrain provider output but do not replace server-side validation. The current curriculum path parses JSON and performs only a minimal non-empty-skills check before normalization and graph repair. Intent parsing already uses a server-owned Zod schema, but all model tasks need a consistent, versioned compatibility contract.

A malformed or semantically incompatible model response must never enter the shared template cache or course persistence layer.

## 2. Decision proposed

Adopt immutable, explicitly versioned contracts for each model task:

- `IntentParseV1`
- `RoadmapTemplateV1`
- `ExamSyllabusExtractV1`

Each contract version is paired with an immutable prompt version, a server-owned strict validator, semantic validation, and a bounded compatibility policy. Provider response-schema configuration is an output-shaping aid only; the server validator is authoritative.

## 3. Validation pipeline

1. Select an explicitly configured task contract and prompt version.
2. Build the provider request from an allowlisted input DTO; exclude user identifiers, credentials and unnecessary private profile data from shared-template generation.
3. Parse the provider response as JSON under bounded response-size and timeout limits.
4. Validate the exact contract with a strict server-owned Zod schema. Reject unknown keys, invalid enums, malformed values and out-of-range arrays/strings.
5. Run task-specific semantic validation:
   - Intent: confidence values are finite and within 0–1; profile fields and question options are bounded; inferred/default values retain provenance.
   - Roadmap template: 3–14 meaningful skills, unique IDs, valid prerequisite references, no self-edges/duplicate edges/cycles, bounded project and quiz fields, and ordered positive duration limits.
   - Exam syllabus: extracted headings must be literal substrings of the supplied syllabus text.
6. Apply only deterministic, explicitly enumerated repairs. Record each repair. If a repair would invent topic coverage, alter meaning, or conceal invalid graph structure, reject instead.
7. Persist/cache only the validated normalized object together with contract version, prompt version, model identifier and provenance.
8. Return typed, sanitized errors for invalid output; never cache malformed output.

## 4. Version and compatibility rules

- Contract versions are immutable. A breaking field, enum, semantic invariant or interpretation change requires a new contract version.
- Prompt versions are independently identified. A prompt-only change may retain the same contract version only when output semantics and validation remain compatible.
- Cache identity must include task name, contract version, prompt version, model/provider identity where behaviorally relevant, and every generation-affecting input (including course depth for roadmap templates).
- A cache entry is readable only by a consumer that explicitly supports its contract version. No silent coercion of unknown versions.
- Store the active contract/prompt pair in server configuration. Rollback changes the active pair to a previously validated pair; it does not mutate historical versions or reinterpret already persisted output.
- During a migration, support an explicit allowlist of old and new versions. New writes use one active version; reads use version-specific validators/adapters. Remove an old reader only after its cache and persisted-data compatibility window has expired or data has been migrated.
- Never rely on a provider's JSON schema version label as proof that server validation occurred.

## 5. Retry and fallback policy

- Invalid JSON, unknown fields, schema violations and semantic failures are not transient provider errors. Permit at most one explicitly configured corrective regeneration only if the task policy allows it; validate the second response from the beginning. Otherwise return a typed invalid-output error.
- Network timeouts, transient provider 5xx and rate limits may use bounded retry with exponential backoff and jitter.
- Quota exhaustion returns a typed retryable/deferred result; it must not trigger a tight retry loop.
- Intent parsing may use its deterministic static question fallback, clearly marked as fallback.
- Curriculum generation may use only a compatible, already validated cached template or an explicitly approved deterministic fallback. It must not silently switch to an unrelated curriculum.
- Exam extraction failure must leave syllabus-backed coverage empty rather than fabricate official units.

## 6. Observability and privacy

Record task, contract version, prompt version, model/provider, latency, token/cost metadata when available, validation outcome, repair codes and sanitized error category. Do not log API keys, raw provider payloads, or unnecessary learner profile/syllabus text. Any retained diagnostic sample must be redacted, access-controlled and governed by the data-retention policy.

## 7. Acceptance criteria

| Scenario | Required result |
|---|---|
| Valid response for active version | Passes strict and semantic validation and can be cached |
| Unknown field or invalid enum | Rejected; not cached |
| Duplicate skill ID or cyclic prerequisite graph | Rejected or deterministically repaired only under an explicit safe rule, with repair recorded |
| Duration bounds are unordered or unbounded | Rejected |
| Model returns a video URL | Rejected; model does not select provider resources |
| Exam heading is not present in source text | Not labelled syllabus-backed |
| Prompt version changes | Cache identity changes |
| Contract version changes | Old cache is not read without an explicit compatible reader |
| Rollback to previous prompt/contract pair | Previous validated pair can be activated without rewriting historical records |
| Provider quota/network failure | Bounded typed retry/deferred behavior; no malformed cache write |
| Invalid output | Sanitized telemetry; no raw private payload in logs |

## 8. Open approval points

1. Approve immutable contract versions and strict server-owned validators as the required boundary.
2. Approve the compatibility window for old cached templates and persisted records.
3. Decide whether a single corrective regeneration is permitted for invalid curriculum JSON, or whether invalid output should fail immediately.

**Approval boundary:** This ADR is a documentation proposal. It does not authorize code changes, prompt changes, feature-flag changes, deployment changes or edits to `main`.
