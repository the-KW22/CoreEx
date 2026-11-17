// The MCP server's tools as the in-app guide describes them (app/(app)/docs/mcp). The backend test McpDocsTest checks
// that this list has exactly the tools the server has, so change both together. Each entry's name is written as
// `name: "..."` on purpose: that is what the test looks for.
export type McpTool = {
  name: string;
  kind: "read" | "change";
  summary: string;
  useWhen: string;
};

export const MCP_TOOLS: McpTool[] = [
  {
    name: "search",
    kind: "read",
    summary: "Find Notes, Assets and Applications by words in a title, a Note's text, an Asset's description, an Application's company, role, posting or notes, or a Tag name, and Notes and Applications also by meaning (English). Narrow by type, Folder and Tag.",
    useWhen: "You know what you are looking for.",
  },
  {
    name: "list_items",
    kind: "read",
    summary: "List Notes and Assets, newest first, 50 per page, in a Folder, with a Tag, or of one type.",
    useWhen: "You want to browse.",
  },
  {
    name: "get_item",
    kind: "read",
    summary: "Read one Note (its Markdown, version, Tags, Folder and Backlinks), an Asset's title, description and size, or an Application's short summary and version. An Asset's file is not sent: get_asset_url gives a link to it.",
    useWhen: "Before editing a Note: it gives the version the edit needs.",
  },
  {
    name: "get_graph",
    kind: "read",
    summary: "How Items link to each other: every Note and Asset with its number of Links, and every Link between them, for a Folder or everything, or around one Item up to 2 Links away. Also lists the groups of Items that never connect. At most 500 Items and 1000 Links, the most-linked.",
    useWhen: "You want orphans, hubs or groups that never connect, or what one Note connects to, without reading every Note.",
  },
  {
    name: "suggest_links",
    kind: "read",
    summary: "Pairs of Notes that are close in meaning but not linked, closest first, for a Folder or everything. Suggestions only, and empty until Notes are embedded.",
    useWhen: "You want the Links worth making, as well as the ones already there.",
  },
  {
    name: "list_facts",
    kind: "read",
    summary: "List the User's Career Facts that are switched on, newest first, with where each came from. Switched-off Facts are never shown. Optionally one category.",
    useWhen: "Before writing about the User's career, so only what they have confirmed is used.",
  },
  {
    name: "get_fact",
    kind: "read",
    summary: "Read one Career Fact by id. A switched-off Fact is treated as not found.",
    useWhen: "You have a Fact's id and want its text and source.",
  },
  {
    name: "get_application_results",
    kind: "read",
    summary: "List what the Career AI made for one Application (a Fit check, answers, prep, emails and so on), newest first, with its resolution and whether it is out of date.",
    useWhen: "You want the Fit check or other work already done for an Application.",
  },
  {
    name: "list_folders",
    kind: "read",
    summary: "Every Folder with its full path and how many Items it holds.",
    useWhen: "To learn how things are organised, or to get a Folder id.",
  },
  {
    name: "list_tags",
    kind: "read",
    summary: "Every Tag with its colour and how many Items have it.",
    useWhen: "To get a Tag id for search or list_items.",
  },
  {
    name: "get_application",
    kind: "read",
    summary: "Read one Application in full: its fields, the posting, its Stage, what it needs from the User now and its whole timeline.",
    useWhen: "Before changing an Application: it gives the version a change can name.",
  },
  {
    name: "list_applications",
    kind: "read",
    summary: "List the Applications grouped by Stage, the ones that need the User now first. One Stage or only those that need the User, 50 per page.",
    useWhen: "You want to know where the job search stands.",
  },
  {
    name: "list_resumes",
    kind: "read",
    summary: "List the Resumes, most recently changed first, 50 per page.",
    useWhen: "You want to find a Resume before reading or editing it.",
  },
  {
    name: "get_resume",
    kind: "read",
    summary: "Read one Resume: its Markdown view, its JSON document (contents and design) and its version, the save counter a patch needs.",
    useWhen: "Before editing a Resume: it gives the version patch_resume needs.",
  },
  {
    name: "patch_resume",
    kind: "change",
    summary: "Change a Resume with a JSON Patch (add, replace, remove or test) on its document. The result is cleaned like any save (HTML is sanitised) and checked; an invalid patch, a stale version or a locked Resume changes nothing. A change keeps the previous version.",
    useWhen: "Editing a Resume's contents or design. Send the version from get_resume.",
  },
  {
    name: "create_resume",
    kind: "change",
    summary: "Start a new, blank Resume with a title. A client-made id makes a retry safe.",
    useWhen: "You are asked to write a Resume from scratch: create it, then fill it with patch_resume.",
  },
  {
    name: "list_cover_letters",
    kind: "read",
    summary: "List the Cover Letters, most recently changed first: id, title, linked Resume and Folder.",
    useWhen: "You want to find a Cover Letter before reading or editing it.",
  },
  {
    name: "get_cover_letter",
    kind: "read",
    summary: "Read one Cover Letter: its Markdown view, its JSON document and its version, the save counter an edit needs.",
    useWhen: "Before editing a Cover Letter: it gives the version edit_cover_letter needs.",
  },
  {
    name: "create_cover_letter",
    kind: "change",
    summary: "Start a new, empty Cover Letter with a title, optionally linked to a Resume so its sender and look follow that Resume.",
    useWhen: "You are asked to write a Cover Letter: create it, then write it with edit_cover_letter.",
  },
  {
    name: "edit_cover_letter",
    kind: "change",
    summary: "Set a Cover Letter's title, recipient, date, greeting, body (HTML, sanitised) or sign-off; fields you leave out stay. A stale version changes nothing. Each edit keeps the previous version.",
    useWhen: "Writing or changing a Cover Letter. Send the version from get_cover_letter.",
  },
  {
    name: "get_asset_url",
    kind: "read",
    summary: "A link to download an Asset's file (an image or PDF), valid for a few minutes. Anyone who has the link can download the file until it expires.",
    useWhen: "The Agent can fetch a link (curl, a web request) and should read the file itself.",
  },
  {
    name: "list_trash",
    kind: "read",
    summary: "What is in the Trash, with the days left before it is removed for good.",
    useWhen: "Before restoring something.",
  },
  {
    name: "create_note",
    kind: "change",
    summary: "Create a Note, optionally in a Folder and with Tags. Writing [[Exact Title]] links to another Item. Pass an id you make up (a UUID) and a retried call returns the same Note instead of making another.",
    useWhen: "You want something new written down.",
  },
  {
    name: "create_application",
    kind: "change",
    summary: "Track a new job as an Application in Saved, from its company and role, with an optional location, link and posting text. Pass an id you make up (a UUID) and a retried call returns the same Application instead of making another.",
    useWhen: "A job is worth keeping track of.",
  },
  {
    name: "update_application",
    kind: "change",
    summary: "Change an Application's company, role, location, posting link or posting text. A version from get_application is optional: with it, a change from an old version is refused.",
    useWhen: "A detail of the job changed or was wrong.",
  },
  {
    name: "move_application_stage",
    kind: "change",
    summary: "Move an Application to a Stage. It writes a line on the timeline, dated today or a past day; Closed needs a reason.",
    useWhen: "The job moved on: applied, a screen, an interview, an offer, closed.",
  },
  {
    name: "add_application_note",
    kind: "change",
    summary: "Add a note to an Application's timeline, dated today or a past day.",
    useWhen: "Something happened that is worth remembering: a call, an email.",
  },
  {
    name: "update_note",
    kind: "change",
    summary: "Replace a Note's whole text. Needs the version from get_item, and is refused if the Note changed since.",
    useWhen: "Rewriting most of a Note.",
  },
  {
    name: "edit_note",
    kind: "change",
    summary: "Replace exact pieces of a Note's text, in order. Each piece must appear exactly once, or nothing is changed. Needs the version from get_item.",
    useWhen: "A small change: it cannot touch anything it did not name.",
  },
  {
    name: "add_fact",
    kind: "change",
    summary: "Add a Career Fact the User gave, or pull one from a Resume or Note with the exact quote from it. A line already pulled, or one the User forgot, is refused.",
    useWhen: "The User states something about their career, or confirms a line from a Resume or Note that belongs in Knowledge.",
  },
  {
    name: "create_folder",
    kind: "change",
    summary: "Create a Folder, at the top level or inside another Folder.",
    useWhen: "You want a new place to group Items.",
  },
  {
    name: "rename_folder",
    kind: "change",
    summary: "Rename a Folder.",
    useWhen: "A Folder's name no longer fits.",
  },
  {
    name: "move_folder",
    kind: "change",
    summary: "Move a Folder, with everything in it, into another Folder or to the top level. It cannot go inside itself.",
    useWhen: "Reorganising.",
  },
  {
    name: "trash_folder",
    kind: "change",
    summary: "Move a Folder, its subfolders and the Items in them to the Trash for 30 days.",
    useWhen: "A whole Folder is no longer needed. restore brings it back.",
  },
  {
    name: "create_tag",
    kind: "change",
    summary: "Create a Tag, optionally with a colour.",
    useWhen: "Rarely: create_note and set_tags create missing Tags for you.",
  },
  {
    name: "rename_tag",
    kind: "change",
    summary: "Rename a Tag everywhere it is used.",
    useWhen: "A Tag's name no longer fits.",
  },
  {
    name: "set_tag_colour",
    kind: "change",
    summary: "Set a Tag's colour: gray, red, orange, yellow, green, teal, blue or pink, or automatic.",
    useWhen: "You want a Tag to stand out.",
  },
  {
    name: "set_tags",
    kind: "change",
    summary: "Make an Item's Tags exactly the list given: missing Tags are added (and created), others are taken off. The Tags themselves are kept.",
    useWhen: "Tagging an Item. Send the full list you want.",
  },
  {
    name: "move_item",
    kind: "change",
    summary: "Move a Note, Asset, Application or Resume into a Folder, or to the top level.",
    useWhen: "Filing an Item.",
  },
  {
    name: "trash_item",
    kind: "change",
    summary: "Move a Note or Asset to the Trash for 30 days.",
    useWhen: "An Item is no longer needed. restore brings it back.",
  },
  {
    name: "restore",
    kind: "change",
    summary: "Bring a Note, Asset or Folder back from the Trash. A Folder returns with what was deleted with it.",
    useWhen: "Something was trashed by mistake. Get the id from list_trash.",
  },
  {
    name: "update_asset",
    kind: "change",
    summary: "Change an Asset's title or description. The file itself cannot be changed.",
    useWhen: "An Asset needs a better name or a note about it.",
  },
  {
    name: "start_upload",
    kind: "change",
    summary: "Step 1 of adding a file: checks its type (PNG, JPEG, WebP, GIF or PDF), size (5 MB at most) and your storage quota, and gives a link to PUT the file to.",
    useWhen: "The Agent has a file on its own machine that belongs in CoreEx. It must be able to run a command or make a web request.",
  },
  {
    name: "confirm_upload",
    kind: "change",
    summary: "Step 3, after the file has been PUT to the link: checks what was really stored and creates the Asset, with an optional title and description.",
    useWhen: "Right after sending the file. Until then no Asset exists.",
  },
];
