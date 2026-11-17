"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { CodeBlock } from "@/components/code-block";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "other", label: "Other client" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inline = "text-link underline underline-offset-4";

// One tab per kind of client. Arrow keys, Home and End move between the tabs, as in the application workspace.
export function ConnectTabs({ server, token }: { server: string; token: string }) {
  const [tab, setTab] = useState<TabId>("claude-code");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (next === -1) return;
    event.preventDefault();
    setTab(TABS[next].id);
    buttons.current[next]?.focus();
  }

  return (
    <div className="grid gap-6">
      <CodeBlock code={server} label="CoreEx server address" />

      <div role="tablist" aria-label="Client" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t, index) => (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "-mb-px h-10 border-b-2 px-4 text-sm font-medium",
              tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-claude-code" aria-labelledby="tab-claude-code" hidden={tab !== "claude-code"} className="grid gap-4">
        <CodeBlock
          label="Claude Code command"
          code={`claude mcp add --transport http coreex ${server} \\\n  --header "Authorization: Bearer ${token}"`}
        />
        <p className="text-sm">
          Then run <code className="font-mono">claude mcp list</code>: CoreEx should show as connected. Add{" "}
          <code className="font-mono">--scope user</code> to have it in every project. Claude Code does not check the token when
          you add it, so a wrong one shows up as a failed connection.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Keep the token out of a shared file</summary>
          <div className="mt-2 grid gap-2">
            <p>
              In a project’s <code className="font-mono">.mcp.json</code>, read the token from an environment variable named{" "}
              <code className="font-mono">COREEX_TOKEN</code>:
            </p>
            <CodeBlock
              label=".mcp.json"
              code={`{\n  "mcpServers": {\n    "coreex": {\n      "type": "http",\n      "url": "${server}",\n      "headers": { "Authorization": "Bearer \${COREEX_TOKEN}" }\n    }\n  }\n}`}
            />
          </div>
        </details>
      </div>

      <div role="tabpanel" id="panel-codex" aria-labelledby="tab-codex" hidden={tab !== "codex"} className="grid gap-4">
        <p className="text-sm">
          Add this to <code className="font-mono">~/.codex/config.toml</code>:
        </p>
        <CodeBlock label="~/.codex/config.toml" code={`[mcp_servers.coreex]\nurl = "${server}"\nbearer_token_env_var = "COREEX_TOKEN"`} />
        <p className="text-sm">
          Then set <code className="font-mono">COREEX_TOKEN</code> to your token before starting Codex, and restart it:
        </p>
        <CodeBlock label="Set the token on macOS or Linux" code={`export COREEX_TOKEN=${token}`} />
        <CodeBlock label="Set the token on Windows" code={`setx COREEX_TOKEN ${token}`} />
      </div>

      <div
        role="tabpanel"
        id="panel-claude-desktop"
        aria-labelledby="tab-claude-desktop"
        hidden={tab !== "claude-desktop"}
        className="grid gap-4"
      >
        <ol className="grid list-decimal gap-2 pl-5 text-sm">
          <li>
            Open <strong>Customize</strong>, then <strong>Connectors</strong>, click <strong>+ Add</strong> and choose{" "}
            <strong>Add custom connector</strong>.
          </li>
          <li>Name it CoreEx and paste the server address above. Continue.</li>
          <li>
            Set <strong>Authentication</strong> to <strong>No sign in</strong>: CoreEx uses your token, not OAuth.
          </li>
          <li>
            Under <strong>Request headers</strong>, add <code className="font-mono">Authorization: Bearer {token}</code>. If the
            form has separate boxes, the name is <code className="font-mono">Authorization</code> and the value is{" "}
            <code className="font-mono">Bearer {token}</code>.
          </li>
          <li>
            Click <strong>Add</strong>. In a chat, use the <strong>+</strong> button, then <strong>Connectors</strong>, and
            switch CoreEx on.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          Claude Desktop connects from Anthropic’s cloud, so the address must be reachable from the internet. An installation
          running only on your own computer cannot be used from Claude Desktop; use Claude Code or Codex instead.
        </p>
      </div>

      <div role="tabpanel" id="panel-other" aria-labelledby="tab-other" hidden={tab !== "other"} className="grid gap-4">
        <p className="text-sm">
          CoreEx speaks standard MCP over Streamable HTTP, without sessions. Send your token as a bearer token in the{" "}
          <code className="font-mono">Authorization</code> header. To test it without any tool:
        </p>
        <CodeBlock
          label="curl test"
          code={`curl -s -X POST ${server} \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
        />
        <p className="text-sm">
          Errors are listed on the{" "}
          <Link href="/docs/mcp/troubleshooting" className={inline}>
            troubleshooting page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
