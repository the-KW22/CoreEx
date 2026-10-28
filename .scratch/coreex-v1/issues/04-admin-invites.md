Status: ready-for-agent
Blocked by: 02

# 04 — Admin: manage Invites

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

An Admin opens `/admin` and manages Invites: create an Invite for an email, see all Invites with status (pending, accepted, revoked), revoke a pending one, and copy the sign-up link to send themselves. Non-admins can't reach the page, and the endpoints refuse them with 403 (enforced as `ROLE_ADMIN` in Spring Security, not just hidden in the UI).

## Acceptance criteria

- [ ] An Admin can create, list, and revoke Invites; emails are matched case-insensitively
- [ ] Creating an Invite for an email that already has a User or a pending Invite is refused with a clear error
- [ ] A revoked Invite no longer lets that email sign up
- [ ] Non-admin Users get 403 on every admin endpoint, and the UI hides the admin entry
- [ ] The Admin can copy the sign-up link for a pending Invite

## Blocked by

`02`
