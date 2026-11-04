# Embeddings come from Supabase's built-in gte-small, in an Edge Function only the API can call

Semantic search (issue #114) needs an embedding of every Chunk of every Note. CoreEx gets them from `gte-small` (384 dimensions, English), the model built into Supabase's Edge Runtime, through one `embed` Edge Function. The first requirement was cost: it must be free. This choice is free on the Supabase plan we already use, and Note text goes to no new third party, since Supabase already stores it. The Spring API stays the only place with rules (ADR 0003): it decides what to embed and when, calls the function, and writes the vectors. The function only turns text into vectors.

The function answers only requests that carry `EMBED_SECRET`, a secret of its own held in Supabase and Render, compared in constant time before the model runs. The default Edge Function check accepts the publishable key, which is public, so anyone could otherwise make the function run the model for them. The secret stops that work. It does not stop someone from calling the function and being refused, and each refused call still counts as one of the 500,000 monthly invocations.

Embedding runs in a scheduled sweep in the API, not in the save request. A Note is re-embedded once it has been unchanged for about two minutes, only its changed Chunks (by text hash) are sent, and each sweep embeds at most about 50 Chunks. The work to do is read from the database, so it survives the free host sleeping. Each Chunk records the model's name, so changing the model re-embeds everything through the same sweep. When the function is unavailable, search falls back to exact-word matches and says so.

## Considered Options

- **Run the model inside the API (Spring AI Transformers, ONNX)**: free and private, but rejected after a local test with the Render free limits (512 MB, 0.15 CPU). The full `all-MiniLM-L6-v2` never started: the heap ran out below 60% of memory, and the container was killed above it. The quantized model started, but the container sat at its 512 MB limit, the first query took 85 s, and each 200-word Chunk took about 1 s.
- **A separate embedding service on Render, or Python on Vercel**: rejected. A second free Render service has the same tiny CPU and adds its own cold start, and Vercel's free plan is for non-commercial use only and its function size limit barely fits a model. Both are a whole service to own, for what the Supabase function already does.
- **Hosted APIs (OpenAI, Voyage, Gemini)**: better models, but not free (OpenAI), a one-time free allowance (Voyage), or a free tier that may use the content to improve Google's products (Gemini). Any of them sends Note text to a new third party.
- **Embed on every save**: rejected. Autosave fires about a second after typing stops, so this would spend invocations and CPU on text that is about to change.
- **Deploy the function from CI**: deferred. It needs a Supabase access token with power over the whole account in GitHub, for a function that rarely changes. It is deployed by hand on release, and the code carries a `shortcut:` note.

## Consequences

- `gte-small` is English-only and reads at most 512 tokens, so Chunks are about 250 words. Notes in other languages are still found by exact words.
- The function, its secret, and its manual deploy step are part of every environment's setup (`docs/DEPLOY.md`).
- Exact-word search stays, and the command palette uses only it.
