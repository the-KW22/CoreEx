-- What each User has spent of the Shared key today (ADR 0009): money, not tokens, in millionths of a dollar, one row per
-- User and UTC day. The Daily AI budget is read against it, and a day's row is never rewritten once the day is over.
create table ai_usage (
    owner_id  uuid   not null references users (id) on delete cascade,
    day       date   not null,
    micro_usd bigint not null default 0 check (micro_usd >= 0),
    primary key (owner_id, day)
);

alter table ai_usage enable row level security;
