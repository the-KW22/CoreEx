import Link from "next/link";

import { getApi } from "@/lib/api/server";

import { CreateToken } from "./create-token";
import { TokensTable } from "./tokens-table";

// Access tokens (docs/DESIGN.md section 6.10): how a User lets an Agent work with their knowledge base.
export default async function TokensPage() {
  const api = await getApi();
  const result = await api.GET("/api/access-tokens").catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!result.data) {
    return <p role="alert">Could not load your Access tokens. Try again.</p>;
  }
  const tokens = result.data.items;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Access tokens</h1>
          <p className="text-sm text-muted-foreground">
            An Access token lets an Agent such as Claude Code or Codex work with your knowledge base as you.{" "}
            <Link href="/help/mcp" className="text-link underline underline-offset-4">
              How to connect an Agent
            </Link>
          </p>
        </div>
        <CreateToken />
      </header>

      {tokens.length === 0 ? (
        <div className="grid justify-items-center gap-1 rounded-[14px] border border-dashed border-border p-10 text-center">
          <p className="font-medium">No Access tokens yet</p>
          <p className="text-sm text-muted-foreground">Create one to connect an Agent.</p>
        </div>
      ) : (
        <TokensTable tokens={tokens} />
      )}
    </div>
  );
}
