Status: ready-for-agent
Blocked by: 04, 09

# 13 — Admin: Users, quotas, disable, overview

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

The admin dashboard gains a Users screen: email, sign-up date, last active, Item count, and storage used compared to Storage Quota. Admins can change one User's quota and disable or re-enable a User; Admins can't disable themselves. An Overview screen shows total Users and total storage used against the configured hosting limit (1 GB on the Supabase free tier). No admin endpoint returns Item content (ADR 0004).

## Acceptance criteria

- [ ] The Users list shows correct counts and storage usage for each User
- [ ] An Admin can change a User's quota, and new uploads respect it
- [ ] Disabling a User immediately blocks their API access (USER_DISABLED), and re-enabling restores it; their data is untouched
- [ ] An Admin disabling themselves is refused
- [ ] The Overview totals are correct
- [ ] A test asserts that no admin endpoint response contains Note bodies, Asset URLs, or other content
- [ ] Non-admins get 403 on all of these endpoints

## Blocked by

`04`, `09`
