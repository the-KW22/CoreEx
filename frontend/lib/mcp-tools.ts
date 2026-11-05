// The MCP server's tools as the in-app guide describes them (app/(app)/help/mcp). The backend test McpDocsTest checks
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
    summary: "Find Notes and Assets by words in a title, a Note's text, an Asset's description or a Tag name, and Notes also by meaning (English). Narrow by type, Folder and Tag.",
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
    summary: "Read one Note (its Markdown, version, Tags, Folder and Backlinks) or an Asset's title, description and size. Asset files are never sent.",
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
    name: "list_trash",
    kind: "read",
    summary: "What is in the Trash, with the days left before it is removed for good.",
    useWhen: "Before restoring something.",
  },
  {
    name: "create_note",
    kind: "change",
    summary: "Create a Note, optionally in a Folder and with Tags. Writing [[Exact Title]] links to another Item.",
    useWhen: "You want something new written down.",
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
    summary: "Move a Note or Asset into a Folder, or to the top level.",
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
];
