"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";

import { runPrep } from "./applications/[id]/interview-actions";
import { prepareForPractice } from "./today-actions";

// The two AI actions under an interview that starts within a day (#288). The disclosure is the server's own "Sends:" line.
export function BriefingActions({ applicationId, interviewSeq, sends }: { applicationId: string; interviewSeq: number; sends: string }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [briefed, setBriefed] = useState(false);
  const [error, setError] = useState("");

  const brief = () =>
    start(async () => {
      const result = await runPrep(applicationId, interviewSeq);
      setBriefed(result.ok);
      setError(result.ok ? "" : result.message);
    });

  const practise = () =>
    start(async () => {
      const result = await prepareForPractice(applicationId, interviewSeq);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/career/applications/${applicationId}?tab=Interview%20prep&interview=${interviewSeq}`);
    });

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={brief} aria-describedby={`${id}-sends`}>
          Generate briefing now
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={practise} aria-describedby={`${id}-sends`}>
          Practice 3 questions
        </Button>
        <p id={`${id}-sends`} className="text-sm text-muted-foreground">{sends}</p>
      </div>
      {briefed && (
        <p role="status" className="text-sm">
          Briefing ready.{" "}
          <Link href={`/career/applications/${applicationId}?tab=Interview%20prep`} className="font-medium underline">
            Open briefing
          </Link>
        </p>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
