"use client";

import { BriefcaseBusinessIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { appliedBefore, createApplication, fillWithAi, readLink } from "./actions";
import { EarlierNotice } from "./earlier-notice";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

// The Applications list's New Application button: give a link and let CoreEx read the page, or paste the posting
// and say who the job is with. Reading a link only fills what is still empty, so typed text is never overwritten.
export function NewApplication({ aiOn }: { aiOn: boolean }) {
  const [state, action, pending] = useActionState(createApplication, undefined);
  const [link, setLink] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [posting, setPosting] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [reading, startReading] = useTransition();
  const [filling, startFilling] = useTransition();
  // The posting came from a link, not from the User's typing, so a cleaned version may take its place.
  const [postingFromLink, setPostingFromLink] = useState(false);
  const [suggestAi, setSuggestAi] = useState(false);
  const [earlier, setEarlier] = useState<{ company: string; items: { id: string; title: string }[] }>({ company: "", items: [] });

  // Asked when the company is left, so typing is never slowed.
  const lookUp = () => {
    const name = company;
    void appliedBefore(name).then((items) => setEarlier({ company: name, items }));
  };

  function read() {
    startReading(async () => {
      const result = await readLink(link.trim());
      if (!result.ok) {
        setNote({ ok: false, text: result.message });
        return;
      }
      const found = result.read;
      const filled: string[] = [];
      if (!company.trim() && found.company) {
        setCompany(found.company);
        filled.push("Company");
      }
      if (!role.trim() && found.role) {
        setRole(found.role);
        filled.push("Role");
      }
      if (!location.trim() && found.location) {
        setLocation(found.location);
        filled.push("Location");
      }
      if (!posting.trim() && found.postingText) {
        setPosting(found.postingText);
        setPostingFromLink(true);
        filled.push("Posting");
      }
      setSuggestAi(aiOn && !found.structured);
      const says = filled.length ? `Filled in ${filled.join(", ")}.` : "Nothing new to fill in.";
      setNote({
        ok: true,
        text: `${says} ${found.structured ? "Check them before saving." : "The page had no job data, so check them carefully."}`,
      });
    });
  }

  function fill() {
    startFilling(async () => {
      const result = await fillWithAi(posting);
      if (!result.ok) {
        setNote({ ok: false, text: result.message });
        return;
      }
      const found = result.fill;
      const filled: string[] = [];
      if (!company.trim() && found.company) {
        setCompany(found.company);
        filled.push("Company");
      }
      if (!role.trim() && found.role) {
        setRole(found.role);
        filled.push("Role");
      }
      if (!location.trim() && found.location) {
        setLocation(found.location);
        filled.push("Location");
      }
      if (postingFromLink && found.postingText) {
        setPosting(found.postingText);
        filled.push("Posting");
      }
      setSuggestAi(false);
      setNote({
        ok: true,
        text: `${filled.length ? `The AI filled in ${filled.join(", ")}.` : "The AI found nothing new to fill in."} Check them before saving.`,
      });
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <BriefcaseBusinessIcon aria-hidden />
          New Application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Application</DialogTitle>
          <DialogDescription>
            Give a link and read the page, or paste the posting and say who the job is with. It starts in Saved.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <div className="grid gap-1 text-sm font-medium">
            <label htmlFor="posting-link">Link to the posting</label>
            <div className="flex gap-2">
              <input
                id="posting-link"
                name="postingUrl"
                type="url"
                inputMode="url"
                maxLength={2000}
                autoComplete="off"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className={input}
              />
              <Button type="button" variant="outline" disabled={reading || !link.trim()} onClick={read}>
                {reading ? "Reading…" : "Read link"}
              </Button>
            </div>
            {note && (
              <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-sm font-normal text-muted-foreground" : "text-sm font-normal text-destructive"}>
                {note.text}
              </p>
            )}
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Company
            <input
              name="company"
              required
              maxLength={90}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              onBlur={lookUp}
              className={input}
            />
          </label>
          {company.trim() === earlier.company.trim() && <EarlierNotice company={earlier.company} items={earlier.items} />}
          <label className="grid gap-1 text-sm font-medium">
            Role
            <input
              name="role"
              required
              maxLength={90}
              autoComplete="off"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Location
            <input
              name="location"
              maxLength={200}
              autoComplete="off"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Posting
            <textarea
              name="postingText"
              rows={6}
              maxLength={100000}
              value={posting}
              onChange={(e) => {
                setPosting(e.target.value);
                setPostingFromLink(false);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            />
          </label>
          <div className="grid gap-2">
            <p id="ai-disclosure" className="text-sm text-muted-foreground">
              {aiOn
                ? "Fill with AI sends the posting text above to Claude, made by Anthropic, and uses part of your daily AI budget. Nothing else of yours is sent."
                : "Fill with AI is coming soon. It switches on once the owner sets up the AI key, and nothing is sent anywhere until then."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={suggestAi ? "default" : "outline"}
                aria-describedby="ai-disclosure"
                disabled={!aiOn || filling || !posting.trim()}
                onClick={fill}
              >
                {filling ? "Filling in…" : aiOn ? "Fill with AI" : "Fill with AI (pending)"}
              </Button>
              {suggestAi && (
                <span className="text-sm text-muted-foreground">The page had no job data. The AI can read it.</span>
              )}
            </div>
          </div>
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
              {state.existing && (
                <>
                  {" "}
                  It is{" "}
                  <Link href={`/career/applications/${state.existing.id}`} className="underline underline-offset-2">
                    {state.existing.title}
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            Add Application
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
