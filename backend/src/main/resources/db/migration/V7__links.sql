-- The Link index: one row per distinct target a Note links to, rebuilt from the Note's Markdown on every save.
-- target_id has no foreign key on purpose: a Link may point at an Item that is gone, trashed or not the
-- User's, and it then simply never resolves (and resolves again if the Item is restored).
-- The title is not stored here as a name to show: Links always show the target's current title.
create table links (
    source_id uuid not null references items (id) on delete cascade,
    target_id uuid not null,
    text      text not null default '' check (char_length(text) <= 200),
    primary key (source_id, target_id)
);

create index links_by_target on links (target_id);

alter table links enable row level security;
