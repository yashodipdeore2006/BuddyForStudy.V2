# TrialCampaign Data Model — V2.2

**Execution branch:** `buddy-for-study-v2.2`  
**Scope:** Task 10/30 — data model and rollout design  
**Collection:** `trial_campaigns`  
**Model:** `TrialCampaign`

## 1. Boundary with existing trial grants

`TrialCampaign` represents a self-serve offer that an authenticated learner may explicitly claim. It is deliberately separate from the existing administrator-granted trial workflow.

The existing `TrialGrant` collection and `/api/admin/trials/grant` flow remain the record of administrator-issued grants. This task does not rename, repurpose, or backfill those records. The campaign model must not be used to silently convert an admin grant into a learner-claimed offer.

A campaign does not itself create a subscription, payment, provider mandate, or entitlement. Those mutations belong to the later claim/lifecycle tasks.

## 2. Model fields

| Field | Type / rule | Purpose |
|---|---|---|
| `internalName` | String, required, 3–120 chars | Admin-only campaign identifier |
| `internalReason` | String, required, 10–500 chars | Business reason retained for audit |
| `offerTitle` | String, required, 3–120 chars | Learner-facing title |
| `offerDescription` | String, required, 10–1,000 chars | Learner-facing offer details |
| `trialPlan` | ObjectId → SubscriptionPlan | Plan supplying trial entitlements |
| `trialDays` | Integer, 1–30 | Trial duration |
| `status` | draft / published / paused / ended | Publication lifecycle |
| `startsAt`, `endsAt` | Date, end optional | Campaign visibility window; end must follow start |
| `maxClaims` | Integer, 1–1,000,000; default 100 | Hard campaign claim cap |
| `claimedCount` | Non-negative integer; default 0 | Counter reserved for atomic claims |
| `eligibility` | Strict boolean subdocument | Active account, verified email, no active subscription, no prior trial |
| `conversionMode` | none / consent_required | Whether a paid conversion option is offered |
| `conversionPlan` | Optional ObjectId → SubscriptionPlan | Paid recurring plan requiring separate learner authorization |
| `createdBy`, `updatedBy`, `publishedBy` | ObjectId → User | Campaign ownership and lifecycle actors |
| `publishedAt`, `pausedAt`, `endedAt` | Date | Lifecycle audit timestamps |

Mongoose timestamps provide `createdAt` and `updatedAt`. Unknown top-level and eligibility properties are rejected with strict schema mode. Schema validation enforces field bounds, valid lifecycle timestamps, start/end ordering, and the conversion-plan/consent relationship.

The model does not trust an ObjectId reference as proof that a plan remains usable. Campaign create/publish services must verify that the trial plan is active and has the intended trial entitlements. A conversion plan must be active, paid, recurring, and distinct from the trial plan. Those cross-document checks belong in the API/service layer.

## 3. Index plan

| Index | Query purpose |
|---|---|
| `{ status, startsAt, endsAt, claimedCount, maxClaims }` | Find currently published campaigns and screen exhausted windows |
| `{ status, updatedAt: -1 }` | Admin campaign list and operational ordering |
| `{ conversionPlan, status }` | Find campaigns affected by conversion-plan lifecycle changes |
| Existing `trialPlan` field index | Find campaigns using a trial entitlement plan |

There is intentionally no TTL index: ended campaign and claim history must remain available for audit and reporting.

## 4. Claim-time invariants for Task 14

The counter is not a read-time guarantee. The claim service must atomically condition its write on all of the following being true at the time of claim:

- The campaign is published.
- Current time is at or after `startsAt` and before `endsAt`, when an end exists.
- The campaign has not exhausted its cap.
- The learner passes current eligibility checks.
- The learner has not already claimed this campaign.
- The learner has no conflicting active subscription or trial.

The campaign capacity update must be a conditional atomic database operation (for example, `findOneAndUpdate` with a server-side `$expr` comparing `claimedCount` and `maxClaims`, while incrementing `claimedCount`). A prior count read followed by an unconditional increment is not safe under concurrent claims.

Task 14 must introduce a unique campaign/learner claim key in the claim ledger. The existing `TrialGrant` unique key is based on administrator `campaignName` and is not a substitute for a stable campaign ObjectId. Claim-ledger insertion, capacity reservation, and subscription mutation must have a transaction or compensating rollback strategy. No over-cap or duplicate success may be returned.

## 5. Conversion and payment safety

`conversionMode: "consent_required"` only advertises an optional paid plan. It is never authorization to create a Razorpay order, provider subscription, mandate, or recurring payment. The learner must explicitly review the exact price, currency, interval, charge timing, and cancellation terms and separately complete the provider authorization flow. Trial expiry without a verified mandate must return the learner to the configured free/default entitlement.

Do not store card details, UPI PINs, mandate secrets, or payment credentials in this model.

## 6. Migration and rollout

- This is a new collection; there is no destructive migration and no backfill from `trial_grants`.
- Mongoose will register `trial_campaigns` when the model is first imported. Before enabling campaign APIs in an environment where automatic index creation is disabled, run the repository's controlled index-initialization process for `TrialCampaign` (equivalent to `await TrialCampaign.init()`) and confirm all named indexes exist.
- Take/verify the normal MongoDB backup before index rollout. Apply and inspect indexes in staging first; do not drop or alter the existing `trial_grants` or `user_subscriptions` indexes as part of this task.
- Keep campaign APIs disabled until Task 11 validates all cross-document plan rules and permissions. A draft campaign is inert and cannot be returned to learners.
- Production rollout requires the separate deployment, backup, monitoring, and rollback evidence in Tasks 29–30.

## 7. Implementation boundary

Implemented in the current V2.2 candidate:
- server/src/models/TrialCampaign.js and server/test/trialCampaignModel.test.js (Task 10)
- campaign CRUD/publish APIs and permission tests (Task 11)
- 7/14/30-day presets and administrator quick-create integration (Task 12; CI verification pending)
- deterministic eligibility engine and database-backed evaluator (Task 13; CI verification pending)
- server/src/models/TrialCampaignClaim.js, transactional reservation service, authenticated claim route, and claim tests (Task 14; CI verification pending)

Not implemented here:
- trial entitlement creation, UserSubscription mutation, and no-payment activation (Task 15)
- learner offer API, popup, and expiry UI (Tasks 16–19)
- admin campaign dashboard redesign (Tasks 20–21)

The Task 14 claim API requires MongoDB transaction support. Before enabling it in an environment with automatic index creation disabled, initialize and verify both TrialCampaign.init() and TrialCampaignClaim.init(). Do not run claims against a standalone MongoDB server that cannot provide multi-document transactions.
