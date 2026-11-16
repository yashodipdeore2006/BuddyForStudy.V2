# Canonical Skill Resolution — Benchmark and Adjudication Specification

**Status:** Proposed evaluation protocol — dataset and thresholds not yet approved  
**Date:** 2026-11-16  
**Related:** [ADR-003 — Domain-aware canonical skill resolution](ADR-003-domain-aware-skill-resolution.md)

## 1. Purpose and non-goals

This specification defines how to evaluate canonical-skill matching before any fuzzy auto-match behavior is enabled. The benchmark is intended to detect false merges, domain leakage, ambiguity failures and normalization regressions.

It does not select a similarity algorithm, score threshold, top-1/top-2 margin, production rollout percentage or canonical-ID migration. Those decisions require measured benchmark evidence and explicit approval.

## 2. Unit of evaluation

Use a labelled pair of skill mentions, each represented by:

- `mentionId`: stable benchmark-local identifier.
- `text`: original display text, preserved exactly.
- `domain`: trusted domain label or `unknown`.
- `sourceType`: existing registry record, generated curriculum candidate, curated alias, or synthetic test case.
- `sourceRef`: scrubbed source reference; never a learner ID or personal data.
- `expectedConceptId`: benchmark-only adjudicated concept key, or null if the mention is intentionally unresolved.
- `label`: `same_concept`, `different_concept`, or `ambiguous`.
- `hardNegativeGroup`: optional group for related-but-distinct concepts.
- `notes`: short adjudication rationale.

The benchmark concept key is not a production Skill `_id` and must not be copied into application data.

## 3. Required coverage strata

The initial dataset must include separately reported examples for:

1. Exact case, whitespace and punctuation variants.
2. Approved synonyms and common abbreviations.
3. Related-but-distinct hard negatives, including Java/JavaScript, React/React Native, Data Analytics/Data Science, SQL/NoSQL, C/C++, Node.js/Node-RED.
4. Same or near-identical labels in different domains.
5. Ambiguous short labels and context-poor mentions.
6. One-character technical skills such as C and R.
7. Technical punctuation such as C++, C#, .NET and Node.js.
8. Unicode and multilingual labels, including normalization edge cases.
9. Typographical errors and word-order variations.
10. Legacy registry records, including records with only the existing scalar `domain` and records whose domain is `general`.

Report counts per stratum and per domain. A good aggregate score must not conceal a failing hard-negative or language stratum.

## 4. Adjudication protocol

- Two reviewers independently label each pair using the skill meaning and supplied domain/context, not string similarity alone.
- Reviewers choose `same_concept`, `different_concept` or `ambiguous`; they must not force a binary label when context is insufficient.
- Disagreements are resolved by a named adjudicator and a written rationale.
- Maintain a versioned label guide with examples and explicit domain-scope rules.
- Exclude learner identifiers, private profile text and credentials. Keep only the minimum scrubbed context needed to adjudicate meaning.
- Record dataset version, reviewer roles, adjudication date and any label changes.

## 5. Dataset split and leakage control

Split by canonical concept cluster, not by individual pair, so variants of one concept cannot leak across development and holdout sets.

- **Development set:** used to inspect normalization and compare candidate-generation/scoring approaches.
- **Calibration set:** used to choose a candidate threshold and top-two margin after the candidate algorithm is fixed.
- **Holdout set:** sealed until the algorithm and threshold are frozen; used once for the approval evaluation.
- **Regression set:** curated permanent edge cases, including every previously observed false merge. It is not a substitute for the holdout set.

Store split membership in version control. Any change to a label, algorithm, normalization, threshold or margin must increment the evaluation version and document whether the holdout has been consumed.

## 6. Evaluation outputs

For deterministic and fuzzy matching separately, report:

- Precision and false-merge count/rate for automatic reuse.
- Recall of adjudicated equivalent pairs.
- Abstention rate and ambiguity rate.
- Top-1 and top-2 score distributions and their margin.
- Results by domain, source type, label length, Unicode/language stratum and hard-negative group.
- Provisional-candidate rate and reviewer correction rate, when those workflows are available.
- Confusion matrix for same/different/ambiguous decisions.
- A list of every false positive and false negative with adjudication rationale.

Treat false merges as the critical error. A resolver that abstains on a difficult pair is preferable to one that silently assigns a wrong canonical identity.

## 7. Required benchmark gates

Before fuzzy auto-match can be considered:

1. The dataset is versioned, scrubbed, independently labelled and adjudicated.
2. The holdout split is sealed and concept-cluster leakage is checked.
3. The candidate algorithm, normalization version, score threshold and top-two margin are frozen before holdout evaluation.
4. Overall and per-domain results are reported, with hard-negative and Unicode/short-label strata explicitly visible.
5. The product/engineering owner approves the minimum automatic-match precision and acceptable abstention/recall trade-off based on observed results.
6. No threshold is approved if the holdout contains an unexplained false merge in a critical hard-negative stratum.
7. Deterministic exact-name and approved-alias behavior is tested independently from fuzzy matching.
8. Shadow-mode output is compared with the adjudicated benchmark before any write-capable rollout.

**No numerical threshold is prescribed here.** The target must be selected after the dataset is adjudicated and baseline results are available.

## 8. Reproducibility and artifact format

Keep benchmark artifacts under a dedicated documentation/test-data location, with:
- a machine-readable pair dataset using the fields in §2;
- a human-readable label guide;
- a dataset manifest containing version, split counts and checksums;
- an evaluation report with algorithm/normalization versions and metrics;
- an adjudication log containing only scrubbed mention IDs and rationales.

Do not commit raw user-generated curricula or learner profile data. Synthetic examples may be used for edge cases but must be labelled synthetic and reported separately from real scrubbed examples.

## 9. Exit criteria before implementation

- ADR-003's domain-scope and provisional-persistence decisions are approved.
- The benchmark has sufficient adjudicated examples across every required stratum; sample size is justified and documented rather than guessed.
- The holdout is sealed and a baseline report is reviewed.
- Dedicated resolver tests exist for normalization, domain filtering, ambiguity, alias governance, deterministic ordering and ID collision races.
- No legacy canonical IDs are rewritten as part of benchmark or resolver evaluation.

Until these conditions are met, fuzzy resolution remains candidate discovery only; it must not auto-merge records or write aliases.
