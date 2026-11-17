import type { components } from "@/lib/api/schema";
import { closeReasonLabel, formatDate, stageLabel, type CloseReason, type Stage } from "@/lib/applications";

type Change = components["schemas"]["Change"];

const PERIODS: Record<string, string> = { YEAR: "per year", MONTH: "per month", HOUR: "per hour" };

// A plain sentence for one proposed change, as the User reads it before they Apply it.
export function describeChange(change: Change): string {
  if (change.type === "STAGE") {
    const move = `Move to ${stageLabel(change.stage as Stage)}`;
    return change.closeReason ? `${move}: ${closeReasonLabel(change.closeReason as CloseReason)}` : move;
  }
  if (change.type === "FOLLOW_UP") {
    const when = change.date ? ` for ${formatDate(change.date)}` : "";
    return `Set a follow-up reminder${when}${change.time ? ` at ${change.time}` : ""}`;
  }
  if (change.type === "OFFER") {
    const offer = change.offer ?? {};
    const pay =
      offer.basePay != null
        ? [Number(offer.basePay).toLocaleString("en-US"), offer.currency, PERIODS[String(offer.payPeriod)]].filter(Boolean).join(" ")
        : "";
    const respond = offer.respondBy ? `reply by ${formatDate(String(offer.respondBy))}` : "";
    const parts = [pay, respond].filter(Boolean);
    return parts.length > 0 ? `Save Offer terms: ${parts.join(", ")}` : "Save Offer terms";
  }
  return "Review this change";
}
