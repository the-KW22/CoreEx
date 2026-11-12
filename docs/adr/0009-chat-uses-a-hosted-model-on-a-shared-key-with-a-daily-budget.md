# Chat uses a hosted model on a Shared key, with a Daily Chat budget per User

Chat (issue #113) is a general assistant that can also read the User's knowledge base, not a question box over search results. It gets its model from a hosted API, Anthropic's Claude to begin with, paid for with the owner's **Shared key**. The model works through tools, the same way an Agent does on `/mcp`: it searches and reads Items when it decides they help, and sources shown to the User are the Notes it actually read. The Spring API stays the only place with rules (ADR 0003). It runs the tool loop, the tools call the same services as the REST API and the MCP tools (ADR 0007), and it talks to the model through one small interface, so another provider is a new class behind that interface, not a rebuild. The key lives only on the backend, like the other secrets in `docs/DEPLOY.md`.

This is the first place where Note text goes to a company other than Supabase, which ADR 0008 avoided for embeddings. The question, the conversation, and whatever Items the model reads go to the provider, and only when a User chats. The provider must not train on API data, and the Chat module tells Users where their text goes. ADR 0004 still holds: an Admin can never read a User's Chats, and Admin endpoints never return them.

Every turn costs money and the rest of CoreEx runs on free plans, so each User has a **Daily Chat budget**, set by an Admin in dollars and counted in money, not tokens: each turn subtracts the tokens the provider reports times that model's price. A plain token count was rejected because prices differ by up to 40 times between models, so the same count would mean very different bills. This follows where AI products have moved: they meter real cost underneath and show Users a simple bar. The budget applies to every User, Admins included. A turn that crosses it may finish, and the next one is refused. The Admin page also has an off switch for the Shared key and picks its one model, both taking effect at once. The owner's real ceiling is the provider's prepaid credit with auto-reload off, and when it runs out Chat says so plainly.

The first version only reads. A Note can contain text written to look like instructions, and a model can be fooled by that, so the model gets no tool that changes anything until changes go through approval (a later issue). The User keeps a reply by choosing Save as Note themselves.

## Considered Options

- **Answer only from the User's Notes** (a strict search-and-answer box): rejected. The owner wants a general assistant that can also write plans and documents; the knowledge base is a tool it uses, not the only thing it knows.
- **A local open-weight model, or training our own**: rejected. A local model works only while the owner's machine is on and sends Users' text to the operator's machine (against ADR 0004); training or fine-tuning on Notes would mix Users' content in one set of weights (against ADR 0001).
- **Count usage in requests or plain tokens**: rejected, see above.
- **Users bring their own key from day one**: deferred, not rejected. It means storing other people's secrets and is planned as a later issue: keys encrypted by the API with a secret held only in Render, write-only, checked on save, and always used in place of the Shared key when present.

## Consequences

- Chat has a running cost, the one paid item in the project. Its limits are Admin settings, not code.
- The price of each model lives in configuration next to the model list and must be updated when the provider changes prices.
- `/mcp` and Search keep working when the provider is down or out of credit, because only the Chat module depends on it.
- A saved Chat keeps text it quoted from a Note after that Note leaves the Trash for good, with the source marked as removed (`CONTEXT.md`, Trash). Text already sent to the provider is covered by its retention terms, not by CoreEx.
