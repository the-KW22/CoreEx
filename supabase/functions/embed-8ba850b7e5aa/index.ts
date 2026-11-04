// Supabase Edge Function `embed`: turns texts into 384-number `gte-small` vectors for Semantic search (ADR 0008).
// shortcut: deployed by hand (`supabase functions deploy embed-8ba850b7e5aa`), move to CI when the function changes more than rarely.
import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import { handle } from "./handler.ts";

const model = new Supabase.ai.Session("gte-small");
const secret = Deno.env.get("EMBED_SECRET") ?? "";
if (!secret) console.error("EMBED_SECRET is not set: every request will be refused");

Deno.serve((request) =>
  handle(request, secret, async (text) => Array.from(await model.run(text, { mean_pool: true, normalize: true })))
);
