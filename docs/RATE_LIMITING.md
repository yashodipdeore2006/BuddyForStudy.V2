# API rate limiting and multi-instance behavior

Sensitive API limits use the shared MongoDB-backed ApiRateLimit store:

| Namespace | Scope | Window | Limit |
| --- | --- | ---: | ---: |
| auth | Authentication endpoints | 15 minutes | 30 |
| ai-roadmap | Per-user AI roadmap admission endpoint | 10 minutes | 5 |
| payments | Payment API | 15 minutes | 30 |
| webhooks | Provider webhook ingress | 1 minute | 120 |

The store uses an atomic MongoDB upsert and a unique key containing the limiter namespace, fixed-window start, and client key. Separate API instances therefore increment the same counter. A TTL index removes expired counters after the window plus one additional window.

The broad 1,000-request API abuse ceiling remains process-local by design. It is a secondary high threshold, not the security control for authentication, AI generation, payment, or webhook endpoints. Those sensitive limits are shared.

**Failure behavior:** sensitive limiters fail closed if the shared store cannot be updated. This is intentional: when MongoDB is unavailable, authentication, payment, webhook persistence and other database-backed API operations are not safe to continue. The standalone /health liveness route remains outside API routing; readiness checks report MongoDB availability.

**Operations:**
- Ensure the MongoDB application user can read/write the apiRateLimits collection and create its indexes at startup.
- Monitor MongoDB write latency and rate-limit store errors alongside API 5xx metrics.
- Do not manually delete active counters during an incident; allow TTL expiry or use the namespace-specific reset path in a controlled maintenance window.
- The integration test server/test/mongoRateLimitStore.integration.test.js increments the same key concurrently through two independent store instances against the CI MongoDB service.
