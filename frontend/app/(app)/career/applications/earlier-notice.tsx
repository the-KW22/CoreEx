import Link from "next/link";

import { cn } from "@/lib/utils";

// "You applied here before and never heard back": the earlier Applications at the same company that were closed with no
// response, each a link. Shown in the New Application dialog and on an Application's page.
export function EarlierNotice({
  company,
  items,
  className,
}: {
  company: string;
  items: { id: string; title: string }[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <p role="note" className={cn("rounded-[10px] border border-border bg-surface px-3 py-2 text-sm", className)}>
      You applied to {company.trim()} before and never heard back:{" "}
      {items.map((item, i) => (
        <span key={item.id}>
          {i > 0 && ", "}
          <Link href={`/career/applications/${item.id}`} className="underline underline-offset-2">
            {item.title}
          </Link>
        </span>
      ))}
      . Think about whether to try again.
    </p>
  );
}
