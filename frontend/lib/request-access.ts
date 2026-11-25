// What the Request access form says when the API refuses, and which address to forward (docs/DESIGN.md 6.15).

// A refusal of the email (400) or a rate limit (429) carries a message written for the visitor; anything else is ours.
export function requestAccessError(status: number | undefined, apiMessage?: string): string {
  if (status === undefined) return "Could not reach CoreEx. Check your connection and try again.";
  if (status === 400) return apiMessage || "Enter a valid email address.";
  if (status === 429) return apiMessage || "Too many requests. Please try again later.";
  return "Could not send your request. Try again in a minute.";
}

// The visitor's address from X-Forwarded-For (the first one is the visitor's), or nothing when it is missing or odd.
export function visitorAddress(forwardedFor: string | null): string | undefined {
  const first = forwardedFor?.split(",")[0].trim();
  return first && first.length <= 64 ? first : undefined;
}
