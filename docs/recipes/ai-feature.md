# Career AI feature recipe

Use the backend's `AiService.ask(ownerId, system, data, schema)` for one structured call. It uses the Shared key, charges the User's Daily AI budget, and returns the same `AI_BUDGET_SPENT`, `AI_OFF` and provider failure responses as the other AI features.

Treat the posting, source documents and user text as untrusted data, never instructions. Send only the evidence the action needs; exclude private notes. Ask for a narrowly defined JSON schema, validate and sanitise the answer, and reject unusable output without changing the document.

Read the owning User's inputs and their versions before the slow call. Before storing a result, recheck ownership, live status and versions in the write transaction. Store a fingerprint of the inputs and show when a result is stale. Require an explicit accept action and the current save counter before applying a suggestion; keep the replaced document as a version.

Show a disclosure immediately beside the action naming the exact data sent. Test through HTTP with `TestModel`: ownership, prompt/data separation, malformed answers, budget exhaustion, stale inputs and accept/reject. Add a Playwright flow using the fake provider; never call a paid model in tests.
