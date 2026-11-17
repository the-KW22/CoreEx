import { KeyRoundIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const h1 = "text-3xl font-semibold tracking-tight md:text-4xl";

// The first page of the docs: what they cover and where to start.
export default function DocsIntroPage() {
  return (
    <>
      <h1 className={h1}>CoreEx docs</h1>
      <p className="text-muted-foreground">
        These pages explain how to get more out of CoreEx. To let an AI tool such as Claude Code work with your Notes,
        Assets and Applications, start with the{" "}
        <Link href="/docs/mcp" className="text-link underline underline-offset-4">
          MCP server guide
        </Link>
        .
      </p>
      <div>
        <Button asChild>
          <Link href="/settings/tokens">
            <KeyRoundIcon aria-hidden />
            Create an Access token
          </Link>
        </Button>
      </div>
    </>
  );
}
