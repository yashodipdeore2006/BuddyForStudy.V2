# ADR-004 — YouTube resource data lifecycle, freshness and policy controls

**Status:** Proposed — compliance review and product-owner approval pending  
**Date:** 2026-11-15  
**Scope:** YouTube Data API metadata and resource references used by Normal Search and Build with AI  
**Working branch:** `docs/build-with-ai-engineering-readiness`  
**Related:** ADR-001 (Normal Search), ADR-002 (durable jobs), ADR-003 (canonical skills), readiness issue #43

## 1. Decision to be made

Define how BuddyForStudy stores, refreshes, displays and deletes YouTube resource metadata without allowing stale API data to live indefinitely or treating provider metadata as proof of video content.

This ADR distinguishes:

1. YouTube API Data obtained through public API-key requests (non-authorized data).
2. YouTube audiovisual content, which must remain inside the YouTube player and must not be downloaded, cached or stored.
3. BuddyForStudy-owned data, such as learner feedback, enrollments and platform-generated learning state.
4. Scores or assessments created from YouTube API Data, which require specific policy review because YouTube restricts derived metrics.

This is an engineering and policy-risk assessment, not a YouTube compliance certification or legal opinion.

## 2. Current YouTube policy constraints

The official [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies) were reviewed on 2026-11-15. The relevant current requirements include:

- Public video search does not require user OAuth. Public metadata returned from the Data API in this flow is therefore treated as **Non-Authorized Data** for this design.
- Non-Authorized Data may be temporarily stored only as necessary and for no longer than 30 calendar days. After 30 days it must be deleted or refreshed.
- YouTube also requires reasonable efforts to keep stored API Data consistent with current YouTube data, and user-facing presentations must show the most up-to-date API Data available.
- The policy says API Clients must not use API Data to create new or derived data or metrics. It explicitly gives as a prohibited example a score that factors in likes, total views or other API Data.
- YouTube audiovisual content must not be downloaded, imported, backed up, cached or stored without prior written approval. Use the official embedded player.
- Pages/features that display YouTube content, including search results, videos, channels, playlists, thumbnails and players, must clearly identify YouTube as the source and use YouTube Brand Features as required.
- Each embedded video must have its Made For Kids status looked up and handled in accordance with the policy.

Primary references:
- [Developer Policies — section III.E.1, III.E.4 and III.F.2](https://developers.google.com/youtube/terms/developer-policies)
- [Complying with YouTube's Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide)
- [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)

## 3. Verified repository baseline

The following source files were inspected on `main` on 2026-11-15.

### 3.1 Existing cache lifetimes

| Layer | Source | Current lifetime / behavior | Assessment |
|---|---|---|---|
| Search response in process | `server/src/services/youtube.service.js` | 1 hour | Below 30-day maximum |
| Video details in process | `youtube.service.js` | 24 hours | Below 30-day maximum |
| Channel details in process | `youtube.service.js` | 24 hours | Below 30-day maximum |
| Candidate-search pool in Mongo/Redis/memory | `courseCurationDecisionEngine.service.js` | 24 hours when candidates exist; 5 minutes for empty result | Below 30-day maximum |
| Curated result / metadata evaluation | `courseCurationDecisionEngine.service.js` | 14 days when results exist; 5 minutes for empty result | Below 30-day maximum |
| Node resource cache | `nodeCuration.service.js` | `NODE_CACHE_TTL_DAYS`, default 14, bounded to 25 | Below 30-day maximum when configuration is valid |
| Durable course lesson and generation snapshot | `Course.js` | No TTL on the course document | Requires successful scheduled refresh or deletion |
| Skill-resource feedback/prior | `CourseCurationFeedback.js`, `SkillResourcePrior.js` | Persistent; based on BuddyForStudy feedback and resource IDs | Separate first-party data lifecycle; do not treat as a YouTube metadata cache or mix with YouTube statistics |

The short-lived in-memory, Redis and `CourseCurationCache` entries are generally configured below 30 days. This does not solve the durable `Course` document lifecycle, where resource metadata can remain for the lifetime of the course.

### 3.2 What is stored in courses

`server/src/models/Course.js` stores YouTube-derived fields in lesson video resources and generation snapshots, including:

- video ID, title, description, channel title, publication date and URL;
- thumbnail URL, duration, language, playlist reference and chapter/timestamp data;
- a `fetchedAt` timestamp, availability state and alternatives.

The course sanitizer removes view/like/comment/subscriber statistics before course persistence. It also assigns the current time to `fetchedAt` when a resource object has no timestamp. That default is not evidence that YouTube was actually queried at that time; an old legacy resource can therefore appear newly refreshed after an unrelated course save. A timestamp must represent an actual successful provider check, not a model-save time.

### 3.3 Current stale-refresh worker

`server/src/services/youtubeCompliance.service.js` currently:

- defines `STALE_MS` as 25 days;
- scans course resources and generation snapshots for stale or missing video timestamps;
- scans only `CourseCurationCache` entries with `kind: "node"`;
- requests `videos.list` in batches of up to 50 using `snippet,contentDetails,status`;
- updates title, channel title, thumbnail, duration, publication date and fetched timestamp;
- marks missing/private/non-embeddable video resources unavailable and strips statistics from processed course/cache objects.

Observed gaps:

1. `chooseReplacement` keeps the previous object via `...video`; it does not refresh all stored API-derived fields. In particular, description, default audio language and chapter data can remain from an earlier response. The new `fetchedAt` then makes that old metadata appear current.
2. A missing or ineligible video is marked unavailable but old title, description and thumbnail fields remain in the object. Stale API metadata should not remain user-visible after the provider says the resource is unavailable.
3. The refresher collects video IDs but does not perform a corresponding `playlists.list` / `playlistItems.list` refresh. Playlist title, description, availability and item membership therefore do not have a complete freshness path.
4. Only node cache entries are revalidated by this worker. Other YouTube-related cache categories rely on their shorter TTLs and should remain bounded below the 30-day limit.
5. The course query includes any course with a generation snapshot, which can cause broad scans. The implementation should use indexed freshness work and bounded batches rather than relying on whole-collection scans as course volume grows.

### 3.4 The scheduled refresh is not currently a verified production control

- `server/src/jobs/worker.js` calls `refreshStaleVideos()` only inside `runNightlyCurationJobs`.
- That function returns immediately when `ENABLE_CURATION_COMPLIANCE_WORKERS` is false.
- `render.yaml` defaults `ENABLE_CURATION_COMPLIANCE_WORKERS=false`.
- The readiness record's 2026-11-14 Render dashboard evidence says the separate `buddyforstudy-worker` service was not present. Its actual running state and production environment flag have not been verified.

Therefore, the 25-day stale threshold is only a code-path intention. It does not establish a production guarantee that durable course metadata is refreshed or deleted before day 30.

## 4. High-priority policy risk: derived metrics from YouTube statistics

The current source has more than a data-retention issue:

- `youtube.service.js` requests `statistics` for videos and channels and maps view, like, comment and subscriber counts into candidate objects.
- `courseCurationDecisionEngine.service.js` calculates playlist-level averages of view/like/comment counts; calculates subscriber percentiles; calculates engagement ratios and percentiles from likes, views and comments; uses those values in `engagementFeatures`, `authorityFeatures`, penalty logic and candidate ranking; and returns fields such as engagement scores and a final score.
- `youtubeCompliance.service.js` and the course sanitizer strip the raw statistics before/after durable course persistence, but stripping raw fields does not undo a score already derived from them.
- The selector also requests and carries statistics in short-lived candidate and result caches.

YouTube's current policy section III.E.4.8 says API Clients must not use API Data to create new or derived data or metrics, and gives as a prohibited example a score that factors in likes, total views or other API Data.

**Assessment:** the current engagement/authority scoring path is a strong apparent conflict with the policy wording and is a pre-release compliance blocker. Removing raw statistics from the Course schema alone is insufficient. The safest initial remediation proposal is to stop requesting YouTube statistics and remove all ranking, filtering, output and cache fields/metrics derived from those statistics. Obtain a YouTube API compliance review if the product team wants to retain any custom score or other derived metric based on YouTube metadata.

Do not confuse this with BuddyForStudy's independent learner feedback. Events such as a BuddyForStudy learner marking a resource helpful/outdated, saving it, enrolling in a BuddyForStudy course or completing a platform lesson are first-party platform signals. Keep these explicitly labelled as BuddyForStudy feedback, use no YouTube view/like/subscriber counts in their calculation, and do not present them as YouTube engagement statistics. Their user-level retention and deletion remain governed by BuddyForStudy's own privacy obligations.

## 5. Proposed resource-data lifecycle

### 5.1 Store references separately from provider snapshots

The preferred model separates a resource's use in a course from the latest provider metadata snapshot.

A resource reference can hold the minimum identity needed to attach the resource to a lesson, together with local relationship data such as course/lesson association and the learner's own progress. Provider-derived fields should be grouped as a replaceable snapshot with:

- provider and resource type (video or playlist);
- provider resource ID;
- the exact API fields returned and required by the UI;
- `fetchedAt` / `lastVerifiedAt` set only after a successful provider response;
- an explicit snapshot version and eligibility status;
- an expiry/revalidation deadline.

Do not mix internal learner progress, local lesson notes or BuddyForStudy feedback into the provider snapshot. A data-deletion operation must be able to remove YouTube API Data without deleting independent first-party progress records unless those records themselves are subject to the user's deletion request.

### 5.2 Freshness and retention deadlines

Proposed operating policy:

- **Hard maximum:** no Non-Authorized YouTube API Data is retained past 30 calendar days from its last successful fetch. At that boundary, delete or refresh it.
- **Operational refresh target:** start refresh before day 25, leaving at least a five-day recovery margin. The 25-day value is an operational target, not permission to retain stale data for 25 days when a change/deletion is already known.
- **Freshness timestamp:** only a successful lookup of the specific resource and relevant fields advances `lastVerifiedAt`. A MongoDB save, cache read, worker heartbeat, failed provider request or inferred availability must never advance it.
- **Refresh failure:** retry within a bounded window. If the hard deadline is reached without a successful refresh, remove the stored API metadata snapshot and stop presenting it as current. Do not silently extend the TTL.
- **Deletion/ineligibility:** if YouTube no longer returns the resource, or reports it private/non-embeddable, promptly clear its stored API metadata and remove it from recommendations/learning resources. Keep only the minimum internal status needed to prevent accidental reuse, subject to policy review.
- **Cache policy:** every cache containing YouTube API Data must have an explicit TTL shorter than 30 days. Continue using shorter search and result TTLs. The persistent course snapshot must be revalidated separately; cache TTL does not govern it.
- **Historical display:** if a product requirement genuinely needs historical API Data, the UI must label the date/context accurately and the data must still follow the applicable storage rule. Do not use historical metadata as current availability.

A time-based TTL is a backstop, not a freshness strategy. The operational monitor must verify that the refresh consumer actually runs and that no resource is approaching the day-30 boundary without a successful refresh or deletion.

### 5.3 Refresh the complete provider snapshot

For a video refresh, request the minimum required Data API fields and replace the provider snapshot atomically. Refresh, where used:

- title and description;
- channel identity/title;
- published date;
- duration;
- default audio language;
- thumbnail URL(s);
- public and embeddable status;
- Made For Kids status required for embedded playback;
- any chapter/timestamp data derived from the description (recompute from the new description; do not carry old chapter text forward).

Do not use `|| oldValue` for API metadata when the provider has returned a successful response but the field is empty/absent. Clear the old value or represent it as unknown. Preserve local course/lesson data outside the provider snapshot.

For playlists, refresh playlist metadata and membership using the corresponding YouTube playlist endpoints. Refresh the relevant video details for current playlist items, remove deleted/private/ineligible items, and recalculate only BuddyForStudy-owned structural information that has been cleared for API-policy review. A video refresh must not be treated as proof that the playlist metadata or membership was refreshed.

### 5.4 Statistics and derived-metric policy

- Do not request `statistics` parts for public video/channel discovery unless a separately approved and policy-compliant use case exists.
- Remove view count, like count, comment count and subscriber count from candidate DTOs, caches, course snapshots, logs and user-facing outputs.
- Remove score components, percentile/rate/average features, penalties and ordering decisions that depend on those statistics.
- Do not replace prohibited YouTube-derived metrics with a renamed metric.
- Keep independently collected BuddyForStudy learner feedback separate, identify it as platform feedback, and ensure it is not calculated from YouTube API Data.
- Have the remaining custom metadata scoring/ranking design reviewed against section III.E.4.8 before production rollout. This ADR does not assume every metadata-based quality judgement is automatically permitted.

### 5.5 Player and attribution constraints

- Continue using the YouTube embedded player; do not download or host copies of audiovisual content.
- Keep autoplay disabled by default; the current `YouTubeEmbedPlayer` default is `autoplay=false`.
- Clearly label YouTube as the source of each YouTube video/search-result/playlist card and preserve YouTube attribution/brand features.
- Persist and use the Made For Kids status for each embedded video so the player experience and tracking behavior can be configured according to YouTube's current instructions. Current `Course` video metadata does not define a dedicated Made For Kids field.
- Ensure YouTube player behavior, branding, controls and required attribution are not hidden or modified in ways that violate the embedded-player requirements.

## 6. Operational architecture

The freshness consumer must run as a real, monitored worker, independent from user requests.

Required controls:

1. The deployed worker is verified running and has a recent heartbeat.
2. The compliance-refresh flag is explicitly enabled only after policy and staging checks pass; defaults remain safe until launch approval.
3. A bounded scheduler claims due resource-refresh tasks using persistent state, not only a process-local array.
4. Refresh work is idempotent and processes resources in bounded API batches.
5. Failures are retried with backoff, but the day-30 deletion deadline cannot be postponed indefinitely.
6. Emit operational metrics/alerts for oldest unverified snapshot age, due refresh count, refresh success/failure, resources deleted as unavailable, playlist refresh failures and resources approaching the hard deadline.
7. If the worker is unavailable or the flag is off, raise an explicit operational alert. A silent worker absence is not acceptable for a mandatory data-retention control.
8. Before a release, provide a redacted report that proves no retained non-authorized YouTube API Data is older than 30 days.

Suggested states:

`fresh` → `refresh_due` → `refreshing` → `fresh`

Failure branches:

- `refresh_retry_wait`: retry before the hard deadline.
- `unavailable`: provider confirms resource is unavailable; clear API snapshot.
- `expired_deleted`: hard deadline reached without a successful refresh; provider snapshot removed.
- `policy_hold`: resource is suppressed pending compliance review.

## 7. Required acceptance tests

| Scenario | Expected result |
|---|---|
| A course is saved without a provider request | `lastVerifiedAt` does not change |
| Legacy resource has no fetch timestamp | It is due for verification; it is not marked fresh by schema defaulting |
| Video metadata changes | The complete provider snapshot is replaced with the newly returned fields |
| Video description changes | Description and derived chapter/timestamp fields are updated or removed |
| Video language tag is removed/changed | Old language metadata is not retained as current |
| Video is deleted/private/non-embeddable | Stored API snapshot is cleared and resource is no longer recommended/embedded |
| Playlist title/description changes | Playlist snapshot is refreshed |
| Playlist membership changes | Removed/ineligible items disappear; new eligible items are re-evaluated |
| One API batch fails | Bounded retry is scheduled; timestamp is not advanced |
| Refresh cannot succeed before day 30 | API metadata is deleted by the hard deadline and no longer shown as current |
| Cache TTL is configured | No YouTube API Data cache can outlive the approved maximum |
| Course snapshot exists without worker/flag | Operational alert identifies that the freshness control is not running |
| Provider statistics are requested | Test fails unless an explicitly approved policy exception exists |
| YouTube counts are present in a fixture | No score, percentile, derived engagement feature or ranking penalty uses them |
| BuddyForStudy learner feedback is present | It remains separately labelled and does not depend on YouTube statistics |
| Embedded video is Made For Kids | Correct player privacy/tracking controls are applied |
| YouTube resource cards are rendered | YouTube source attribution remains clear |
| Player component mounts without user action | Autoplay remains disabled by default |

## 8. Release blockers and open decisions

1. Obtain policy/compliance review of the current API-derived score system and approve removal/replacement of statistic-based scoring before production use.
2. Approve the resource snapshot/reference separation and the 25-day refresh target / 30-day hard delete-or-refresh deadline.
3. Decide how to migrate existing course snapshots that have missing or synthetic `fetchedAt` values.
4. Implement complete video and playlist refresh, including description/language/chapter fields and Made For Kids status.
5. Verify the Render worker exists, is healthy and runs the compliance consumer; actual deployment and flag state are currently unverified and the readiness evidence says the worker was not present.
6. Define retention for first-party learner feedback and deletion workflows separately from provider metadata.
7. Review remaining metadata-derived ranking/quality scores with YouTube API Services before enabling the curation engine.
8. Validate YouTube attribution, player behavior and privacy requirements across web/mobile surfaces.

**Approval boundary:** This ADR records current risks and proposes a lifecycle contract. It does not authorize product-code changes, database migrations, production flag changes, new provider requests, Render dashboard changes, PR creation/merge or deployment.
