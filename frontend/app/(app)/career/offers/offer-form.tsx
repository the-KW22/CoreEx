"use client";

import { useState, useTransition, type ChangeEvent } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { emptyOfferForm, formFromTerms, offerRequestFrom, PAY_PERIODS, type OfferFormValues } from "@/lib/career/offer-form";

import { createOffer, updateOffer } from "./actions";

type Offer = components["schemas"]["OfferResponse"];
const field = "h-9 rounded-lg border border-border bg-surface px-3";

type Props = { label: string; onSaved?: (offer: Offer) => void } & (
  | { mode: "add"; applicationId: string }
  | { mode: "edit"; offer: Offer }
);

// One Offer's terms, for adding or editing. Empty boxes are sent as null. Editing sends the version seen, so a change
// made elsewhere is refused (409) instead of overwritten.
export function OfferForm(props: Props) {
  const [values, setValues] = useState<OfferFormValues>(props.mode === "edit" ? formFromTerms(props.offer.terms) : emptyOfferForm);
  const [version, setVersion] = useState<number | null>(props.mode === "edit" ? props.offer.version : null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const box = (key: keyof OfferFormValues) => ({
    value: values[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  return (
    <form
      aria-label={props.label}
      className="grid max-w-xl gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const built = offerRequestFrom(values, version);
        if ("error" in built) {
          setMessage({ ok: false, text: built.error });
          return;
        }
        start(async () => {
          const result =
            props.mode === "add" ? await createOffer(props.applicationId, built.body) : await updateOffer(props.offer.id, built.body);
          if (!result.ok) {
            setMessage({ ok: false, text: result.message });
            return;
          }
          // Show what was saved: an empty box stays empty.
          setValues(formFromTerms(result.offer.terms));
          setVersion(result.offer.version);
          setMessage({ ok: true, text: "Offer saved." });
          props.onSaved?.(result.offer);
        });
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-sm font-medium">Base pay
          <input type="number" min={0} step="any" {...box("basePay")} className={field} />
        </label>
        <label className="grid gap-1 text-sm font-medium">Currency
          <input maxLength={3} placeholder="GBP" {...box("currency")} className={`${field} w-24 uppercase`} />
        </label>
        <label className="grid gap-1 text-sm font-medium">Pay period
          <select aria-label="Pay period" {...box("payPeriod")} className={field}>
            <option value="">Not set</option>
            {PAY_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">Bonus
        <input maxLength={2000} {...box("bonus")} className={field} />
      </label>
      <label className="grid gap-1 text-sm font-medium">Equity
        <input maxLength={2000} {...box("equity")} className={field} />
      </label>
      <label className="grid gap-1 text-sm font-medium">Benefits
        <textarea maxLength={2000} rows={2} {...box("benefits")} className="rounded-lg border border-border bg-surface px-3 py-2" />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-sm font-medium">Start date
          <input type="date" {...box("startDate")} className={field} />
        </label>
        <label className="grid gap-1 text-sm font-medium">Respond by
          <input type="date" {...box("respondBy")} className={field} />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">Place
        <input maxLength={2000} {...box("place")} className={field} />
      </label>
      <label className="grid gap-1 text-sm font-medium">Office days per week
        <input type="number" min={0} max={5} step={1} {...box("officeDays")} className={field} />
      </label>
      {message && (
        <Alert role={message.ok ? "status" : "alert"} tone={message.ok ? "neutral" : "destructive"}>
          {message.text}
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save Offer"}
      </Button>
    </form>
  );
}
