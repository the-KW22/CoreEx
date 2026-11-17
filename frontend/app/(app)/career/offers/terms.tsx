import { formatDate } from "@/lib/applications";
import type { components } from "@/lib/api/schema";
import { checkLabel, payPeriodLabel, type Terms } from "@/lib/career/offer-form";

type Check = components["schemas"]["Check"];

const orNotSet = (text: string | null | undefined) => (text == null || text === "" ? "Not set" : text);

// The terms as label and value pairs, in the order the form asks them. A null term reads Not set, never 0 or blank.
export function termRows(terms: Terms): [string, string][] {
  return [
    ["Base pay", terms.basePay == null ? "Not set" : terms.basePay.toLocaleString("en")],
    ["Currency", orNotSet(terms.currency)],
    ["Pay period", payPeriodLabel(terms.payPeriod)],
    ["Bonus", orNotSet(terms.bonus)],
    ["Equity", orNotSet(terms.equity)],
    ["Benefits", orNotSet(terms.benefits)],
    ["Start date", terms.startDate ? formatDate(terms.startDate) : "Not set"],
    ["Place", orNotSet(terms.place)],
    ["Office days per week", terms.officeDays == null ? "Not set" : `${terms.officeDays}`],
    ["Respond by", terms.respondBy ? formatDate(terms.respondBy) : "Not set"],
  ];
}

export function TermsList({ terms }: { terms: Terms }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {termRows(terms).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The flags against Preferences: a labelled flag, with the API's own sentence beside it.
export function ChecksList({ checks }: { checks: Check[] }) {
  return (
    <ul aria-label="Checks" className="grid gap-1 text-sm">
      {checks.map((check) => (
        <li key={`${check.code}-${check.message}`}>
          <span className="font-medium">{checkLabel(check)}</span>
          {check.message && checkLabel(check) !== check.message && <span className="text-muted-foreground"> {check.message}</span>}
        </li>
      ))}
    </ul>
  );
}
