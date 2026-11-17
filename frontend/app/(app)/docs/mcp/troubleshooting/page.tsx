const h1 = "text-3xl font-semibold tracking-tight md:text-4xl";

const TROUBLESHOOTING = [
  {
    problem: "The tool says 401, or “Failed to connect”",
    answer:
      "The Access token is wrong, expired or revoked. Create a new one under Access tokens and put it in your tool again. Check that the address ends in /mcp.",
  },
  {
    problem: "403 USER_DISABLED",
    answer: "Your CoreEx account is disabled. Ask the Admin.",
  },
  {
    problem: "429 RATE_LIMITED",
    answer: "The token made more than 60 calls in a minute. Wait the number of seconds in the Retry-After header, then continue.",
  },
  {
    problem: "“This Note was changed somewhere else”",
    answer:
      "The Note changed after the Agent read it, for example because you edited it. Nothing was lost. The Agent should read the Note again with get_item and redo its change.",
  },
  {
    problem: "The first request is slow or times out",
    answer: "A server on a free hosting plan may be asleep. Wait a minute and try again.",
  },
  {
    problem: "A plain GET to the address answers 405 (or 401 without a token)",
    answer:
      "That is normal. The server is stateless and answers only POST requests, which is what MCP tools send. Without a token you get 401 first.",
  },
  {
    problem: "Claude Desktop cannot connect",
    answer:
      "Claude Desktop reaches servers from Anthropic’s cloud, so the address must be reachable from the internet. An installation running only on your own computer cannot be used from Claude Desktop; use Claude Code or Codex instead.",
  },
];

// The errors people meet most, and what to do about each.
export default function McpTroubleshootingPage() {
  return (
    <>
      <h1 className={h1}>Troubleshooting</h1>
      <div className="grid divide-y divide-border-subtle rounded-[14px] border border-border bg-surface">
        {TROUBLESHOOTING.map((item) => (
          <details key={item.problem} className="group p-4 text-sm">
            <summary className="cursor-pointer font-medium">{item.problem}</summary>
            <p className="mt-2 text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
    </>
  );
}
