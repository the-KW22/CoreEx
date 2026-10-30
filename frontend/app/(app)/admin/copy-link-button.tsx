"use client";

import { CheckIcon, LinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

// The sign-up link is the login page with the invited email filled in; sending it is up to the Admin.
export function CopyLinkButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/login?email=${encodeURIComponent(email)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(`Copied the sign-up link for ${email}`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this sign-up link:", link);
    }
  }

  const Icon = copied ? CheckIcon : LinkIcon;
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`Copy sign-up link for ${email}`}>
      <Icon aria-hidden />
      {copied ? "Copied" : "Copy sign-up link"}
    </Button>
  );
}
