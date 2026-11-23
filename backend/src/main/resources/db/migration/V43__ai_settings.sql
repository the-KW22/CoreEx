-- The Shared key's settings an Admin can change without a redeploy (issue #385). One row. A null model or budget means
-- "the configured default" (coreex.ai.model and coreex.ai.daily-budget-usd), so a fresh database behaves as before:
-- on, Claude Opus 5.5, 0.50 dollars per User per UTC day. The budget is in millionths of a dollar, like ai_usage.
create table ai_settings (
    id                     boolean     primary key default true check (id),
    enabled                boolean     not null default true,
    model                  text        check (model is null or char_length(model) <= 100),
    daily_budget_micro_usd bigint      check (daily_budget_micro_usd is null or daily_budget_micro_usd between 0 and 100000000),
    updated_at             timestamptz not null default now()
);

insert into ai_settings default values;

alter table ai_settings enable row level security;
