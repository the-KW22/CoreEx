-- The canonical address of an Application's posting link (#238): scheme, host without "www.", path and job-id
-- parameters only, so two links to the same job look the same. Empty when there is no link. Applications made before
-- this have none until their link is next saved.
alter table application_contents add column canonical_url text not null default '';

create index application_contents_by_canonical_url on application_contents (canonical_url) where canonical_url <> '';
