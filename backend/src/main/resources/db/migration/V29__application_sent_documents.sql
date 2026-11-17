create table application_linked_documents (
    application_id uuid not null references items(id) on delete cascade,
    owner_id uuid not null references users(id) on delete cascade,
    kind text not null check (kind in ('RESUME', 'COVER_LETTER')),
    item_id uuid references items(id) on delete set null,
    sent_document jsonb,
    sent_title text,
    sent_version integer,
    check_score integer check (check_score between 0 and 100),
    sent_at timestamptz,
    primary key (application_id, kind)
);
create index application_linked_documents_owner on application_linked_documents (owner_id);
create index application_linked_documents_item on application_linked_documents (item_id) where item_id is not null;
alter table application_linked_documents enable row level security;

create table application_resume_copies (
    owner_id uuid not null references users(id) on delete cascade,
    request_id uuid not null,
    application_id uuid not null references items(id) on delete cascade,
    source_id uuid not null,
    copy_id uuid not null references items(id) on delete cascade,
    primary key (owner_id, request_id)
);
alter table application_resume_copies enable row level security;
