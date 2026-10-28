Status: ready-for-agent
Blocked by: 01

# 02 — Sign-in, the owner Admin, and the Invite gate

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

Sign-in works end to end. A person can sign in with email/password or Google (Supabase Auth on the frontend), and the frontend sends the access token to the API. The backend validates the Supabase JWT, and on the first request provisions a CoreEx User **only if** they are the configured owner email (who becomes `ADMIN`) or have a `PENDING` Invite (which becomes `ACCEPTED`). Everyone else gets `NOT_INVITED`, and the frontend shows an "invite-only" screen. A "me" endpoint returns the current User. Disabled Users get `USER_DISABLED` and see a "your account is disabled" screen. Signed-in Users see an empty app shell with a sidebar and log-out. Invites can only be created directly in the database for now; the Admin UI comes in 04.

## Acceptance criteria

- [ ] The owner email signs in and is provisioned as ADMIN with no Invite
- [ ] An email with a PENDING Invite signs in, is provisioned as USER, and the Invite becomes ACCEPTED
- [ ] An email with no Invite (or a REVOKED one) gets NOT_INVITED and sees the invite-only screen
- [ ] A Disabled User gets USER_DISABLED on every API call and sees the disabled screen
- [ ] Requests without a valid token get 401
- [ ] Last-active is updated, throttled to at most once every few minutes
- [ ] The API test harness can mint test JWTs for any User, Admin, Disabled User, or non-invited person; tests cover each case above

## Blocked by

`01`
