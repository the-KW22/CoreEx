# Narrator checklist

Narrator (the Windows screen reader) cannot be driven from a test, so a person runs this list. Run it before a release and after any change to the shell, the palette, dialogs or the Note screen. The automated axe scans and keyboard tests already cover contrast, names, roles and focus; this list covers what is *announced*.

**Setup:** start the local stack, sign in, press `Win` + `Ctrl` + `Enter` to turn Narrator on. Use Chrome or Edge. `Caps Lock` is the Narrator key. Note anything that is silent, wrong, announced twice, or announced in a confusing order.

Mark each line **Pass**, **Fail** (say what you heard) or **N/A**.

## Landmarks and navigation

| # | Steps | You should hear | Result |
|---|---|---|---|
| 1 | `Caps Lock` + `Space` to list landmarks (or `D` in scan mode) | Main navigation, the Knowledge Base panel (complementary), and main | |
| 2 | Tab through the rail | Each entry's name (Home, Knowledge Base, Trash, Admin for Admins), and "current page" on the open one | |
| 3 | Open a Folder, then the breadcrumb | "Breadcrumb navigation", each level as a link, the last one as the current page | |

## Command palette

| # | Steps | You should hear | Result |
|---|---|---|---|
| 4 | `Ctrl` + `K` | "Command palette" dialog, and focus in the search box | |
| 5 | Type part of a Note title | The result count or the first result is announced as it changes | |
| 6 | `Down` arrow through results | Each result's name and type, and its position | |
| 7 | `Esc` | The dialog closes and focus returns to where it was | |

## Notes, saving and Links

| # | Steps | You should hear | Result |
|---|---|---|---|
| 8 | Open a Note, type a line | "Unsaved changes", then "Saved at ..." once (not on every key) | |
| 9 | Type `[[` and a Note title | The suggestions list, and the chosen one when you arrow | |
| 10 | Put the caret inside a Link | "Link to Note ...", with the target's first line | |
| 11 | Open Details | The panel is named "Details"; Title, Folder, Tags and Backlinks are headings or labelled fields | |
| 12 | Add a Tag with "+ Tag", then remove it with its x button | The button names ("Remove the Tag ..."), and the pill appearing or going | |

## Dialogs, menus and toasts

| # | Steps | You should hear | Result |
|---|---|---|---|
| 13 | Row menu "..." on All Items, then "Move to Folder..." | The menu items, then the dialog's title and description; focus returns to the "..." button on close | |
| 14 | Tags page: Delete on a Tag | "Alert dialog", the title ("Delete ...?") and the description before the buttons | |
| 15 | Trash: Restore an Item | The toast text ("Restored ...") is announced without moving focus | |
| 16 | Move an Item to the Trash | The toast with its Undo action is announced | |
| 17 | Tags page: rename to a name you already have | The error under the field is announced | |

## Uploads

| # | Steps | You should hear | Result |
|---|---|---|---|
| 18 | Upload a file | "Upload files" dialog; each file's progress bar by name; "Added" or "Failed" when done; the toast | |
| 19 | Drag a file over the window (sighted helper) | The overlay is decorative and is not announced; the dialog is, once it opens | |

## Admin and sign-in

| # | Steps | You should hear | Result |
|---|---|---|---|
| 20 | Admin tabs | The three tabs as links, "current page" on the open one | |
| 21 | Overview chart | One summary line for the bar, and the legend as a list with each size | |
| 22 | Sign out, sign in with a wrong password | The error is announced; focus stays usable | |
| 23 | Press `Enter` in the Password field | You sign in (no reset email is sent) | |
| 24 | Visit a missing page | "Page not found" as the heading, then "Go Home" | |

Record the date, the Windows and browser versions, and any failures below, then paste the table into the PR.
