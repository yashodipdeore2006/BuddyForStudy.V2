# Learning Resource Candidate and Selection Contract

**Status:** Proposed contract — YouTube policy review and owner approval pending  
**Date:** 2026-11-16  
**Scope:** Normal Search and Build with AI resource discovery, selection, persistence and learner presentation  
**Related:** [ADR-004 — YouTube resource data lifecycle](ADR-004-youtube-resource-data-lifecycle.md), [ADR-005 — Curation quality and quota model](ADR-005-curation-quality-and-youtube-quota-model.md), [Build with AI target architecture](BUILD-WITH-AI-TARGET-ARCHITECTURE.md)

## 1. Purpose and hard boundary

Define stable interfaces between curriculum nodes, provider discovery, resource references, provider metadata snapshots, learner selection and first-party learning state.

This contract does not authorize a ranking formula. ADR-004 identifies a policy blocker: YouTube's default policy restricts creating derived metrics from API Data, and the existing engine derives scores and rankings from provider metadata and statistics. Until the precise educational-resource curation use case and proposed selection method are reviewed and accepted, do not ship or persist custom scores, percentiles, fit/quality/coverage metrics or ranking order derived from YouTube API Data. A renamed score is not a workaround.

Provider metadata is not evidence that a video was watched, transcript-checked, factually verified or pedagogically effective.

## 2. Distinct entities and ownership

Keep four concepts separate:

| Concept | Owner | Meaning | Lifecycle |
|---|---|---|---|
| Curriculum resource requirement | BuddyForStudy | What a skill/lesson needs (topics, level, language, duration/content constraints) | Versioned with curriculum/node |
| Provider candidate/reference | YouTube identity + BuddyForStudy relationship | Video/playlist ID and the lesson/node association | Relationship may outlive a replaceable provider snapshot only where policy permits |
| Provider metadata snapshot | YouTube API Data | Fields returned by a specific successful API request | Refresh/delete under ADR-004; never silently made fresh by a course save |
| Learner learning state/feedback | BuddyForStudy | Watched/progress state, learner notes, helpful/outdated feedback, explicit choice | First-party privacy/retention/deletion policy, separate from provider data |

Do not mix first-party progress, notes, feedback or enrollment state into the YouTube metadata snapshot. Deleting provider metadata must not accidentally delete independent first-party learning records; conversely, a user privacy deletion must apply to the relevant first-party records under the platform's own policy.

## 3. Curriculum requirement contract

A resource-bearing node should provide a versioned, bounded requirement:

- `nodeId`, `canonicalSkillId`, curriculum/template version.
- `requiredTopics[]` and bounded search-query hints.
- `learnerLevel` and goal context where relevant.
- `preferredLanguage` and whether it was learner-confirmed or inferred.
- `durationPolicy`: minimum, target and maximum minutes.
- `contentTypePolicy`: video, playlist or either; Shorts policy; playlist lesson-count/runtime requirements.
- `requiredCoverage`: the lesson's stated learning objectives/topics, not a score computed from provider metadata.
- `policyVersion` and selector-contract version.

Gemini may generate curriculum topics and search hints. It must not generate provider IDs/URLs or claim it has verified resource content.

## 4. Candidate discovery DTO

A provider candidate returned from discovery is an untrusted provider record, not a selected resource and not proof of suitability.

Minimum identity fields:
- `provider = youtube`
- `resourceType = video | playlist`
- `providerResourceId`
- canonical provider URL generated/validated by the server
- discovery request ID and retrieval timestamp

Provider-supplied metadata must be grouped under a replaceable `providerSnapshot` with its field provenance, snapshot version, successful `lastVerifiedAt`, expiry/revalidation deadline and eligibility state. Only request and retain fields needed by the product and allowed by the approved policy. Statistics are excluded by default.

Unknown fields remain unknown. Do not infer spoken language from creator location/channel country. `defaultAudioLanguage` is metadata evidence only; it does not prove the actual spoken language. Playlist language cannot be inferred from its title.

## 5. Selection decision contract

A selected-resource decision must be separate from candidate discovery and persist:

- `decisionId`, `nodeId`, provider/resource identity and decision timestamp.
- `decisionStatus`: `selected`, `learner_choice_required`, `no_eligible_candidate`, `policy_hold`, or `superseded`.
- `decisionMethodVersion` and `policyVersion`.
- `languageDecision`: requested language, evidence type, whether it matches, and whether learner confirmation is required.
- `durationEvidence`: actual provider-reported runtime when available; unknown otherwise.
- `contentEvidenceLevel`: `metadata_only`, `human_reviewed`, or `learner_feedback`, with reviewer/feedback provenance and timestamp where applicable.
- A human-readable explanation that states the evidence boundary and does not overclaim content verification.
- Explicit learner-choice record if an alternative language/resource is selected.

**Policy gate:** The fields above describe an auditable decision record; they do not permit the application to calculate or persist an API-derived fit score, confidence score, quality score, coverage metric, percentile or ranking. The allowed candidate ordering/selection method must be separately reviewed against current YouTube API Services policies and approved before implementation. Until then, the system may expose provider results with factual metadata and explicit learner choice, but must not represent an unapproved derived ranking as a verified recommendation.

## 6. Language and learner-choice rules

1. Preserve the learner's requested language and its provenance.
2. A resource whose language is unknown is not a confirmed language match.
3. Do not silently attach a known different-language resource.
4. Other-language resources may be shown as clearly labelled alternatives only where policy and product approval permit.
5. Require an explicit learner action before a different-language alternative becomes the learning-path selection.
6. Record the choice as a first-party learner decision; do not rewrite the provider's language metadata.
7. If no confirmed preferred-language resource is available, retain the node as unresolved/alternative-available rather than claiming a match.

## 7. Evidence and confidence vocabulary

Use categorical evidence labels rather than unapproved numerical scores:

- **Metadata only:** based on provider-returned title, description, duration, language tag, channel/playlist structure or availability. It is not content verification.
- **Human reviewed:** a reviewer inspected the resource through the official YouTube player and recorded a scoped assessment and date. This is not a guarantee that all content remains unchanged.
- **Learner feedback:** a first-party learner signal such as helpful, outdated, wrong level or completed. Show aggregate or individual feedback only under an approved first-party privacy policy; do not combine it with YouTube engagement counts.
- **Unknown:** required evidence is absent or stale. Do not convert missing evidence into a positive match.

Do not use `verified`, `high confidence` or `quality approved` for a resource solely because metadata fields are present.

## 8. Node state and retry contract

The learning node remains authoritative for learner-facing progress:

- `pending`: no discovery decision yet.
- `queued`: discovery/refresh work accepted.
- `ready`: a resource was selected under an approved selection policy and all required gates passed.
- `low_confidence`: reserved only if a policy-approved confidence method exists; do not set from the current unapproved API-derived score.
- `unavailable`: provider confirms the resource is no longer eligible; clear stale provider snapshot.
- `quota_limited`: discovery/refresh could not proceed due to quota; preserve prior valid first-party progress and retry eligibility.
- `failed_retryable`: transient failure with bounded retry.
- `failed_permanent`: non-retryable failure requiring changed input or support.
- `skipped`: node is intentionally not resource-backed under the curriculum policy.

Persist node transitions and selected-resource references. A provider metadata refresh must not erase learner progress or a learner's explicit selection unless the resource becomes unavailable or the selection is otherwise invalid under the approved policy.

## 9. Freshness and deletion integration

Apply ADR-004 to every persisted provider snapshot:

- `lastVerifiedAt` advances only after a successful lookup of that specific resource and required fields.
- A successful video lookup does not refresh playlist metadata or playlist membership.
- Replace the provider snapshot atomically; clear fields the provider no longer returns.
- Mark unavailable and clear provider API metadata when the resource is deleted/private/non-embeddable or otherwise ineligible.
- Refresh before the 30-calendar-day maximum; delete provider metadata by the deadline if refresh cannot succeed.
- A stale/missing timestamp means unknown/due for refresh, never fresh.
- Keep caches containing provider data below the approved maximum and separately enforce durable course-snapshot freshness.

## 10. UI and player contract

- Identify YouTube as the source of each YouTube result and preserve required YouTube attribution/brand features.
- Use the official embedded player; do not download, cache or host audiovisual content.
- Autoplay remains disabled by default.
- Apply the required Made For Kids handling for each embedded video.
- Distinguish curriculum effort from video runtime.
- Display resource language and runtime only when known, with clear unknown states.
- Explain whether the resource is metadata-only or human-reviewed; do not imply transcript or content verification without evidence.
- A learner's explicit alternative selection should be visible and reversible where the product permits.

## 11. Acceptance matrix

| Scenario | Expected result |
|---|---|
| Gemini returns a video URL or claims a resource is verified | Reject provider identity/verification claims from model output |
| Candidate discovered | Stored as candidate, not automatically as selected resource |
| Provider metadata field absent on successful refresh | Old field is cleared/unknown; it is not retained with a new timestamp |
| Provider refresh fails | Timestamp does not advance; bounded retry is scheduled |
| Video is unavailable/private/non-embeddable | Provider snapshot is cleared and resource is no longer recommended/embedded |
| Playlist membership changes | Playlist snapshot and membership are refreshed independently |
| Preferred-language evidence is unknown | Do not claim a confirmed language match |
| Different-language alternative is displayed | It is labelled and not attached until explicit learner choice |
| Metadata exists but no human review | Evidence label remains metadata-only |
| Learner feedback exists | It remains first-party and is not combined with YouTube statistics |
| Provider snapshot expires | It is refreshed or deleted under ADR-004; stale data is not presented as current |
| YouTube API statistics are present in a fixture | Candidate DTO/selection path excludes them by default |
| Unapproved API-derived ranking/score is attempted | Policy gate blocks release/persistence |
| Learner progress exists and provider metadata is deleted | Independent first-party progress is preserved unless separately subject to user deletion |
| Player mounts without user action | Autoplay remains off; attribution and Made For Kids controls are preserved |

## 12. Open approvals and implementation gates

1. Obtain written policy/compliance review of the allowed candidate ordering and selection method for BuddyForStudy's educational-resource use case.
2. Approve the provider snapshot/reference storage model and migration of existing embedded snapshots.
3. Confirm required YouTube fields, Made For Kids handling and attribution across web/mobile.
4. Approve first-party feedback/progress retention and deletion behavior.
5. Approve language evidence semantics and alternative-selection UX.
6. Implement complete video/playlist freshness controls and prove the 30-day delete-or-refresh deadline.
7. Define resource contract compatibility/version migration and add unit/integration tests.

**Approval boundary:** This is a documentation contract only. It does not authorize code changes, provider calls, database migrations, scoring/ranking changes, production flags, Render changes, PR merge or deployment.
