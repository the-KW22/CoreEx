"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

// A command or setting to copy. `label` says what it is, for the Copy button and for people using a screen reader. The
// text scrolls sideways on a narrow screen, and can be reached with the keyboard to do so.
export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`Copied: ${label}`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(`Copy this (${label}):`, code);
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;
  return (
    <div role="group" aria-label={label} className="relative">
      <pre
        tabIndex={0}
        className="overflow-x-auto rounded-[10px] border border-border bg-surface p-3 pr-24 font-mono text-sm leading-relaxed"
      >
        <code>{code}</code>
      </pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-label={`${copied ? "Copied" : "Copy"} ${label}`}
        className="absolute right-2 top-2"
      >
        <Icon aria-hidden />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
