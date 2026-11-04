// The `embed` Edge Function's logic (ADR 0008), apart from the model so `deno test` can run it with a fake one.
// POST {"texts": [...]} answers {"vectors": [[...], ...]}: one vector per text, in order. Only the API may call it.

/**
 * Most texts in one call. Measured on the local Edge Runtime (2026-11-04): about 0.3 s for a 220-word Chunk and 0.45 s
 * for one that fills the model's 512 tokens; 6 of the longest failed the 2 s CPU limit (HTTP 546), 4 took 1.7 s. Three
 * leaves room for a slower host. Keep it equal to the API's `coreex.embeddings.batch-size`.
 */
export const MAX_BATCH = 3;
/**
 * The model reads only its first 512 tokens (about 2,000 characters) of any text, so what is past this cap is cut,
 * not refused: one long code block must not make the whole batch fail, and the same batch fail again every minute.
 */
export const MAX_TEXT_CHARS = 8000;

export type Embed = (text: string) => Promise<number[]>;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const digest = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

/** Hashing both sides first makes them the same length, so the byte loop takes the same time for any guess. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function handle(request: Request, secret: string, embed: Embed): Promise<Response> {
  // Checked before the body is read or the model runs. An unset secret refuses everyone.
  if (!secret || !(await sameSecret(request.headers.get("x-embed-secret") ?? "", secret))) {
    return json({ code: "UNAUTHORIZED" }, 401);
  }
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);

  const body = await request.json().catch(() => null);
  const texts = body?.texts;
  if (
    !Array.isArray(texts) || texts.length < 1 || texts.length > MAX_BATCH ||
    !texts.every((t) => typeof t === "string" && t.length > 0)
  ) {
    return json({ code: "BAD_REQUEST" }, 400);
  }

  try {
    // One at a time: the CPU limit is per request, and a failure stops the rest.
    const vectors: number[][] = [];
    for (const text of texts) vectors.push(await embed(text.slice(0, MAX_TEXT_CHARS)));
    return json({ vectors }, 200);
  } catch (e) {
    console.error("embed failed:", e instanceof Error ? e.name : "unknown"); // never the text
    return json({ code: "EMBED_FAILED" }, 500);
  }
}
