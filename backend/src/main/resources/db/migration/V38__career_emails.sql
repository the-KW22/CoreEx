-- Career emails (#282): an Application email (the email that sends the Resume and Cover Letter, a follow-up, a thank-you)
-- is a Career result. Its text is edited in place in the result's data; the rest of the table is unchanged. REPLY is
-- allowed now for the reply ticket, which adds no schema.
alter table career_results drop constraint career_results_kind_check;
alter table career_results add constraint career_results_kind_check
    check (kind in ('FIT', 'DRAFT', 'TIGHTEN', 'PREP', 'PRACTICE', 'DEBRIEF', 'EMAIL', 'FOLLOW_UP', 'THANK_YOU', 'REPLY'));
