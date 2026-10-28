# Admins manage accounts but cannot read User content

The admin dashboard can manage Invites, list Users with their storage use, change a User's Storage Quota, and disable (never delete) Users — but no admin endpoint can read another User's Notes, Assets, Folders, or Tags. This extends ADR 0001's "everything is private" to the operator, so CoreEx can honestly tell future customers that their knowledge base isn't readable by staff. Admin is a role on a normal User (enforced as `ROLE_ADMIN` in Spring Security, not just hidden in the UI); the first Admin is set by email in configuration so the owner can't be locked out.

## Considered Options

- **Admin can view content / impersonate Users** — easier support and debugging; rejected because it breaks the privacy promise and is hard to take back once Users rely on it.
- **Admin can delete Users** — deferred; disable covers V1 needs without risking irreversible data loss.
