-- One follow-up reminder per Application: a wall-clock date and an optional time. No zone is stored; a date
-- alone counts as 09:00 in the User's timezone, which the Next step rule applies when it reads the reminder.
alter table application_contents
    add column reminder_on   date,
    add column reminder_time time,
    add constraint application_reminder_time_needs_date check (reminder_time is null or reminder_on is not null);
