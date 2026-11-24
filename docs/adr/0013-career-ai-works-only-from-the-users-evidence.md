# Career AI works only from the User's evidence and never acts for them

Career uses the model for many things: reading a posting into an Application, a Fit check, a match score, interview briefings, practice feedback, debriefs, drafting Cover Letters and Application emails, reading an employer's reply, improving a line of a Resume, importing a PDF or Word resume, and reviewing a Resume's wording. All of it runs on the **Shared key** and draws on the **Daily Chat budget** (ADR 0009), through the backend's one model interface.

Four rules apply to every one of these, taken from Reactive Resume's Career module:

1. **Evidence only.** The model may state the User's experience only from their **Facts**, **Stories** and their own Resumes and Cover Letters. It never invents numbers, dates, ownership or results; what is unknown stays unknown, and missing evidence is said as "your Knowledge doesn't show this yet", never "you lack". A result records which Facts and Stories it used, and the server drops any it cites that it was not given.
2. **Untrusted text is data.** Postings, employer emails and documents go to the model marked as data, never instructions, with quoted email history stripped.
3. **Nothing happens without the User.** The model drafts and proposes; it never sends an email, applies for a job or changes an Application. A proposed change (a new Stage, a follow-up date, an Offer, a Fact remembered from a Chat) is applied only when the User approves it, with Undo, like Chat Proposals.
4. **Say what is sent.** Each AI action shows one line naming what goes to the model ("Sends: the posting, your Resume, your Knowledge to Claude"), built from the same list the server uses to build the prompt.

Each **Career result** stores a fingerprint of its inputs and shows "Out of date" when the posting, the Facts, the Stories or the linked documents have changed since, instead of being rewritten silently.

**One deliberate exception:** an Application also shows a **0–100 match score** between its Resume and its posting, beside the Fit check. Reactive Resume's Career module forbids fit scores because a number looks more certain than the evidence; the owner chose to keep both, so the score is shown as an estimate next to the per-requirement Fit check, never instead of it.

## Considered Options

- **Prompt rules only**, without tracking which Facts a result used: simpler, but a result could cite something it never saw, and forgetting a Fact could not remove it from earlier results.
- **No score at all, only Fit**: recommended in the grilling, overruled by the owner.
- **Sending email from CoreEx** (through the User's mailbox or CoreEx's own address): rejected. It needs mailbox access or a mail provider, and an employer would see an email the User did not press Send on.

## Consequences

- Forgetting a Fact erases its text, keeps a content-free key so no import, retry or AI can bring it back, and removes it from every Career result.
- Background AI (scheduled briefings, automatic job discovery) is out for now, so no AI runs without the User pressing a button.
- Reading a posting from a link is the first time the backend fetches arbitrary URLs: it fetches only public hosts, with few redirects and a size cap, and reads the page's own job data before asking the model.

## Update: tabs hidden for now (#366)

An Application's workspace shows only **Details, Fit, Emails and Interview prep**, the User's own flow from the job description to the interview. **Apply, Messages, Practice, Debrief and Library** are hidden, not removed: their panels, API, data and AI results stay, so the rule above still holds for every result already stored, and a name added to `SHOWN` in `applications/[id]/workspace.tsx` brings a tab back. Mark as applied moved to Details; the employer's form questions and the answer library are hidden with Apply. Nothing in this ADR changes: the AI still works only from the User's evidence and only when a button is pressed.

## Update: the match score is worked out, and the Fit check reads the role (#395 #396 #397 #398)

The Fit check's **score is no longer the model's guess.** Each requirement has a kind (MUST, NICE or GATE, a condition asked of every candidate such as work rights or a language) and a verdict; CoreEx counts SUPPORTED as 1, PARTLY as 0.5 and MISSING as 0, weighs MUST and GATE 2 and NICE 1, and shows the sum next to the score, so the number can be checked line by line. The score is still an estimate shown beside the requirements, never instead of them.

The Fit check also gives what decides the hire, keywords copied from the posting, a plan for each gap (FRAME, CLOSE or DO_NOT_CLAIM) and, for a GATE the evidence does not show, a question for the User. These follow the evidence rule: a question asks and never says the User lacks something.

The User's own agent can run the check (`run_fit_check`) or do the analysis itself and save it (`save_fit_check`, no CoreEx model call and no budget spent). A saved check passes the same parser as the model's answer: only ids the Fit check could see are kept, text is cut to its limits, the score is worked out here and any score sent is ignored, and it goes stale the same way. It is marked as made by the agent.
