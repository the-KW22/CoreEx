-- The Graph layout: where a User left each node of a graph. One scope per Folder, and folder_id null for All Items
-- ("nulls not distinct" makes that a single scope too). Deleting an Item or Folder for good drops its positions.
create table graph_positions (
    owner_id  uuid             not null references users (id) on delete cascade,
    folder_id uuid             references folders (id) on delete cascade,
    item_id   uuid             not null references items (id) on delete cascade,
    x         double precision not null,
    y         double precision not null,
    unique nulls not distinct (owner_id, folder_id, item_id)
);

create index graph_positions_by_item on graph_positions (item_id);

create index graph_positions_by_folder on graph_positions (folder_id);

alter table graph_positions enable row level security;
