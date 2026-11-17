const h1 = "text-3xl font-semibold tracking-tight md:text-4xl";

const LIMITS = [
  ["Calls", "60 a minute for each token"],
  ["Access tokens", "Up to 10 live ones; 90 days unless you choose otherwise"],
  ["Lists", "50 results per page, with a cursor for the next page"],
  ["Note", "A title up to 200 characters and a text up to 1,000,000 characters"],
  ["Names", "Folders up to 200 characters, Tags up to 50, an Asset description up to 2,000"],
  ["Transport", "Streamable HTTP without sessions: POST requests only"],
];

// The defaults the server uses. The person running CoreEx can change them.
export default function McpLimitsPage() {
  return (
    <>
      <div className="grid gap-3">
        <h1 className={h1}>Limits</h1>
        <p className="text-muted-foreground">These are the defaults; the person running CoreEx can change them.</p>
      </div>
      <dl className="grid divide-y divide-border-subtle rounded-[14px] border border-border bg-surface text-sm">
        {LIMITS.map(([name, value]) => (
          <div key={name} className="grid gap-1 p-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt className="font-medium">{name}</dt>
            <dd className="text-muted-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
