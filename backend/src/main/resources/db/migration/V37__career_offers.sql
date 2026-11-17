-- Career Offers (#285, #286): an Offer belongs to an Application's Item and records its terms honestly. Every term is
-- optional and null means unknown, never 0 or an empty string. An edit copies the terms it replaces into offer_versions.
create table offers (
    id          uuid           primary key,
    item_id     uuid           not null references items (id) on delete cascade,
    owner_id    uuid           not null references users (id) on delete cascade,
    base_pay    numeric(14, 2) check (base_pay is null or base_pay >= 0),
    currency    text           check (currency is null or char_length(currency) = 3),
    pay_period  text           check (pay_period is null or pay_period in ('YEAR', 'MONTH', 'HOUR')),
    bonus       text           check (char_length(bonus) <= 2000),
    equity      text           check (char_length(equity) <= 2000),
    benefits    text           check (char_length(benefits) <= 2000),
    start_date  date,
    place       text           check (char_length(place) <= 2000),
    office_days integer        check (office_days between 0 and 5),
    respond_by  date,
    version     integer        not null default 1,
    created_at  timestamptz    not null default now(),
    updated_at  timestamptz    not null default now()
);
create index offers_owner_id_idx on offers (owner_id);
create index offers_item_id_idx on offers (item_id);
alter table offers enable row level security;

create table offer_versions (
    offer_id    uuid           not null references offers (id) on delete cascade,
    version     integer        not null,
    owner_id    uuid           not null references users (id) on delete cascade,
    base_pay    numeric(14, 2) check (base_pay is null or base_pay >= 0),
    currency    text           check (currency is null or char_length(currency) = 3),
    pay_period  text           check (pay_period is null or pay_period in ('YEAR', 'MONTH', 'HOUR')),
    bonus       text           check (char_length(bonus) <= 2000),
    equity      text           check (char_length(equity) <= 2000),
    benefits    text           check (char_length(benefits) <= 2000),
    start_date  date,
    place       text           check (char_length(place) <= 2000),
    office_days integer        check (office_days between 0 and 5),
    respond_by  date,
    saved_at    timestamptz    not null default now(),
    primary key (offer_id, version)
);
alter table offer_versions enable row level security;
