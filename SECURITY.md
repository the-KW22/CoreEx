# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue. Use GitHub's **Report a vulnerability** button on this repository's [Security tab](https://github.com/the-KW22/CoreEx/security/advisories/new).

Include what you found, the steps to reproduce it, and what an attacker could do with it. I aim to reply within a week.

## Scope

The code in this repository and the live deployment at <https://core-ex.vercel.app> and its API. Please do not run automated scanners or load tests against the live deployment, and do not access data that is not yours.

## How CoreEx protects data

The design is in the ADRs: every request is scoped to the signed-in User ([ADR 0001](docs/adr/0001-private-per-user-data-from-day-one.md)), Admins cannot read User content ([ADR 0004](docs/adr/0004-admins-cannot-read-user-content.md)), and every table has row level security ([ADR 0005](docs/adr/0005-tables-live-in-a-dedicated-schema-with-rls.md)).
