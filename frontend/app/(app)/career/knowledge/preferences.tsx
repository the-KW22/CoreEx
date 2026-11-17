"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";

import { savePreferences } from "./actions";

type Prefs = components["schemas"]["PreferencesResponse"];
type PayPeriod = "YEAR" | "MONTH" | "HOUR";
const PLACES = [
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "ONSITE", label: "Onsite" },
] as const;
const CURRENCIES = ["GBP", "USD", "EUR", "CAD", "AUD", "INR", "JPY"];
const field = "h-9 rounded-lg border border-border bg-surface px-3";

// Preferences (one row per User): what Fit and Offers check against. Minimum pay needs its currency and pay period.
export function PreferencesForm({ prefs }: { prefs: Prefs }) {
  const [targetRoles, setTargetRoles] = useState(prefs.targetRoles ?? "");
  const [places, setPlaces] = useState<string[]>(prefs.places ?? []);
  const [minBasePay, setMinBasePay] = useState(prefs.minBasePay == null ? "" : String(prefs.minBasePay));
  const [currency, setCurrency] = useState(prefs.currency ?? "");
  const [payPeriod, setPayPeriod] = useState<PayPeriod | "">((prefs.payPeriod as PayPeriod | null) ?? "");
  const [officeDays, setOfficeDays] = useState(prefs.officeDaysPerWeek == null ? "" : String(prefs.officeDaysPerWeek));
  const [noticePeriod, setNoticePeriod] = useState(prefs.noticePeriod ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-labelledby="prefs-heading" className="grid gap-4">
      <h2 id="prefs-heading" className="text-lg font-semibold">Preferences</h2>
      <form className="grid max-w-xl gap-4" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await savePreferences({
            targetRoles,
            places: places as ("REMOTE" | "HYBRID" | "ONSITE")[],
            minBasePay: minBasePay === "" ? null : Number(minBasePay),
            currency: currency || null,
            payPeriod: payPeriod || null,
            officeDaysPerWeek: officeDays === "" ? null : Number(officeDays),
            noticePeriod,
          });
          setMessage(result.ok ? { ok: true, text: "Preferences saved." } : { ok: false, text: result.message });
        });
      }}>
        <label className="grid gap-1 text-sm font-medium">Target roles
          <input value={targetRoles} maxLength={500} onChange={(e) => setTargetRoles(e.target.value)} className={field} />
        </label>
        <fieldset className="grid gap-2 text-sm font-medium">
          <legend>Places</legend>
          <div className="flex flex-wrap gap-4">
            {PLACES.map((p) => (
              <label key={p.value} className="flex items-center gap-2 font-normal">
                <input type="checkbox" checked={places.includes(p.value)} onChange={(e) => setPlaces(e.target.checked ? [...places, p.value] : places.filter((x) => x !== p.value))} />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm font-medium">Minimum base pay
            <input type="number" min={0} value={minBasePay} onChange={(e) => setMinBasePay(e.target.value)} className={field} />
          </label>
          <label className="grid gap-1 text-sm font-medium">Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
              <option value="">None</option>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Pay period
            <select value={payPeriod} onChange={(e) => setPayPeriod(e.target.value as PayPeriod | "")} className={field}>
              <option value="">None</option><option value="YEAR">Per year</option><option value="MONTH">Per month</option><option value="HOUR">Per hour</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-sm font-medium">Office days per week
          <input type="number" min={0} max={7} value={officeDays} onChange={(e) => setOfficeDays(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1 text-sm font-medium">Notice period
          <input value={noticePeriod} maxLength={100} onChange={(e) => setNoticePeriod(e.target.value)} className={field} />
        </label>
        {message && <Alert role="status" tone={message.ok ? "neutral" : "destructive"}>{message.text}</Alert>}
        <Button type="submit" disabled={pending} className="justify-self-start">{pending ? "Saving…" : "Save Preferences"}</Button>
      </form>
    </section>
  );
}
