const h1 = "text-3xl font-semibold tracking-tight md:text-4xl";

const TROUBLESHOOTING = [
  {
    problem: "The tool says 401, or “Failed to connect”",
    answer:
      "The token is wrong, expired or revoked. Create a new one and update your tool. Check that the address ends in /mcp.",
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
      "The Note changed after the Agent read it. Nothing was lost: the Agent should read it again with get_item and redo its change.",
  },
  {
    problem: "The first request is slow or times out",
    answer: "A server on a free hosting plan may be asleep. Wait a minute and try again.",
  },
  {
    problem: "A plain GET to the address answers 405 (or 401 without a token)",
    answer:
      "Normal: the server answers only POST requests, and 401 comes first without a token.",
  },
  {
    problem: "Claude Desktop cannot connect",
    answer:
      "Claude Desktop connects from Anthropic’s cloud, so the address must be public. A CoreEx running only on your computer needs Claude Code or Codex instead.",
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
