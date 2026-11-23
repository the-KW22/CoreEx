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

## Update: retrieval, switches and cost (2026-11-22)

Decided after comparing Chat with Reactive Resume's AI Assistant. Where this section and the text above differ, this section wins.

- **Strong matches are sent up front.** Before each reply, Semantic search runs on the User's message, and the top 3 Chunks above the search's similarity threshold go to the model as data, before it decides anything. They count as sources. The model can still search (which returns Chunks, not whole Notes) and read a whole Note when it needs one. So Note text can reach the provider without the model asking for it, whenever a message closely matches the User's Notes; the Chat module's privacy note says so.
- **A "Use my Notes" switch** in the message box, on by default and remembered within a Chat, turns that off for a message: nothing is fetched up front and no knowledge tools are offered. Notes quoted earlier stay in the Chat's history and are still sent with later turns.
- **One engine, several scopes.** A Chat has a scope fixed when it is created (`general` first; Career adds `career` and `application`). The engine is the same for every scope; a scope only brings its instructions and the tools it starts from.
- **Long Chats stay affordable** through prompt caching of the instructions and tools, and the provider's own context editing, which clears the oldest tool results once the history passes a size: about 100k tokens on the Shared key, about 300k on a User's own key. The saved Chat keeps everything; only what is re-sent shrinks.
- **Replies are bounded:** one reply at a time per Chat, at most 15 tool steps and 5 minutes per reply, and Stop keeps what was written.
- **Web search** (later) uses the provider's own search and page-reading tools behind a "Use the web" switch, off by default, with at most 5 searches per reply. The page reader only opens links that appear in the conversation. Note text must not be put in search queries; this is an instruction to the model, not something CoreEx can enforce.

## Update: Proposals and questions (2026-11-23)

- **Writes wait for approval, in the API.** The write tools Chat offers are those of `/mcp` from a fixed list (never uploads or Career writes). A call stores a Proposal; it runs, as the Chat agent through the same service method, only when the User approves. An instruction planted in a Note can at worst produce a Proposal the User rejects.
- **A batch is one transaction.** Proposals made in one reply can be approved together; one failure applies none. An edit remembers the Note version it was based on, so a changed Note refuses with `VERSION_CONFLICT`. A newer Proposal for a Note replaces the older pending ones. The User can edit the text before approving; their words are what is saved.
- **The model is told through the history.** The stored result of each proposing call is rewritten to Applied, Rejected or Replaced, so the next turn replays what happened.
- **A question ends the reply.** `ask_user_question` is the one Chat-only tool; the reply stops with the call pending, and the answer is stored as its result and continues the conversation. A card exists only for a stored pending call, never for text.
