import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { mcpServerAddress } from "@/lib/mcp-server";

const h1 = "text-3xl font-semibold tracking-tight md:text-4xl";
const inline = "text-link underline underline-offset-4";

// Three steps from nothing to a connected tool. The commands for each tool are on the Connect a client page.
export default function McpQuickStartPage() {
  const server = mcpServerAddress();
  return (
    <>
      <div className="grid gap-3">
        <h1 className={h1}>Quick start</h1>
      </div>
      <ol className="grid list-decimal gap-6 pl-5">
        <li className="grid gap-2">
          <p>
            <Link href="/settings/tokens" className={inline}>
              Create an Access token
            </Link>{" "}
            for the tool and copy it. It is shown once.
          </p>
        </li>
        <li className="grid gap-2">
          <p>Use this server address:</p>
          <CodeBlock code={server} label="CoreEx server address" />
        </li>
        <li className="grid gap-2">
          <p>
            Add the address and your token to your tool, with the commands on{" "}
            <Link href="/docs/mcp/connect" className={inline}>
              Connect a client
            </Link>
            .
          </p>
        </li>
      </ol>
    </>
  );
}
