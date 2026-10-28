# Every record is owned by one User from day one; no sharing in V1

CoreEx is built multi-user from the first commit: every Item, Folder, and Tag belongs to exactly one User, and every query is scoped to that User. We rejected starting single-user because retrofitting ownership onto every table, query, and route later is the classic painful rewrite, and V1.5's MCP access needs a solid notion of "acting on behalf of a User". Sharing, teams/workspaces, public links, and billing are explicitly out of V1 — they can be layered on top of private ownership later.
