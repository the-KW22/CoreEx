import { TagBadge } from "@/components/tag-badge";

import { RequestForm } from "./request-form";

const TRUST = [
  { title: "Your data is scoped to you", text: "Every read and write is checked against your account. Even an Admin cannot read your Notes." },
  { title: "Use your own keys", text: "Chat can use your own Anthropic API key, billed by the provider, instead of the shared one." },
  { title: "Markdown in and out", text: "Notes are plain Markdown. Export gives you a zip of everything whenever you want it." },
];

export function Trust() {
  return (
    <section id="trust" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <p className="text-sm font-medium text-link">Trust</p>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">Your notes stay yours.</h2>
      <div className="mt-12 grid gap-10 md:grid-cols-3">
        {TRUST.map((t) => (
          <div key={t.title} className="border-t border-border pt-5">
            <h3 className="font-semibold">{t.title}</h3>
            <p className="mt-2 text-muted-foreground">{t.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CallToAction() {
  return (
    <section id="request-access" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-28 sm:px-6">
      <div className="rounded-[18px] border border-border bg-surface px-6 py-14 text-center sm:px-12">
        <TagBadge name="Early access" colour="yellow" className="mb-4" />
        <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">Ask for an Invite.</h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-pretty text-muted-foreground">CoreEx is invite-only for now. Tell us where to send yours.</p>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          This form is a first version. Your request is saved for the owner to read by hand, and no email is sent automatically yet.
        </p>
        <RequestForm />
      </div>
    </section>
  );
}
