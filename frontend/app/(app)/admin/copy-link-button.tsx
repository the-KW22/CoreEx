"use client";

import { useState } from "react";

// The sign-up link is the login page with the invited email filled in; sending it is up to the Admin.
export function CopyLinkButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/login?email=${encodeURIComponent(email)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this sign-up link:", link);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy sign-up link for ${email}`}
      aria-live="polite"
    >
      {copied ? "Copied" : "Copy sign-up link"}
    </button>
  );
}
