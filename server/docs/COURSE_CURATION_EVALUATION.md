# Course Curation Decision Engine evaluation

The ranking metric functions in `server/src/services/courseCurationEvaluation.service.js` implement NDCG@K, precision@K, recall@K, hidden-gem recall@K, junk rate@K, and top-result reported coverage.

## Prepare an expert-labelled dataset

Copy `server/data/course-curation-golden-set.example.json` to `server/data/course-curation-golden-set.json`. Replace every placeholder with a real search topic and the **exact** `sourceId` returned for a YouTube video, playlist, or assembled series. Relevance values should be assigned by human reviewers, not inferred from the engine's own score:

- `3`: strongly relevant, suitable learning resource
- `2`: relevant with notable limitations
- `1`: marginally relevant
- omit or use `0`: not relevant
- `hiddenGemResourceIds`: resources expert reviewers judge to have strong quality despite low exposure
- `junkResourceIds`: resources expert reviewers judge misleading, spammy, off-topic, or otherwise unsuitable

Use a diverse, human-reviewed set of roughly 30–50 topics before using aggregate metrics as a launch-quality conclusion. The checked-in example is a schema template, **not** a labelled benchmark.

## Run it

From `server/` with MongoDB configured:

```sh
node src/scripts/evaluateCourseCuration.js data/course-curation-golden-set.json
```

Optional configuration: `CURATION_EVAL_K=10`, `CURATION_EVAL_MAX_JUNK_RATE=0.05`.

The runner uses the live curation service and logs the engine version and per-topic cache state. Results depend on current YouTube resources, configuration, and the quality of the expert labels. It does not automatically retrain weights or claim that a representative benchmark exists.
