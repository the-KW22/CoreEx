-- The PDFs sent for an Application (#242): each is an Asset (so it shows in Assets, counts against the quota and can
-- be downloaded as any Asset), attached to the Application with a label. Detaching deletes only this row. Trashing
-- an Application leaves its Assets alone; deleting either for good removes the row through the foreign keys.
create table application_documents (
    application_id uuid        not null references items (id) on delete cascade,
    asset_id       uuid        not null references items (id) on delete cascade,
    label          text        not null check (label in ('RESUME', 'COVER_LETTER', 'OTHER')),
    attached_at    timestamptz not null default now(),
    primary key (application_id, asset_id)
);

create index application_documents_by_asset on application_documents (asset_id);

alter table application_documents enable row level security;
