-- A Tag may carry one of a fixed set of colour names; null means "automatic" (the UI picks one from the name).
alter table tags add column colour text
    check (colour in ('gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'pink'));
