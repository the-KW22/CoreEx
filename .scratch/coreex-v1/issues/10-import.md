Status: ready-for-agent
Blocked by: 08

# 10 — Import Markdown and text files as Notes

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

Users import one or more `.md` or `.txt` files (each up to 1 MB, UTF-8). Each becomes a new Note whose title comes from the filename (extension removed) and whose body is the file text. Import goes through the same save path as editing, so `[[Exact Title]]` Links resolve exactly as in ticket 08. Imports land in the current Folder, or at the top level. The original file is not kept.

## Acceptance criteria

- [ ] Several files can be imported in one action; each creates one Note
- [ ] Titles come from filenames, and bodies are stored exactly as the file's Markdown
- [ ] Links in imported text resolve under the same rules as editing
- [ ] Other types, files over 1 MB, or non-UTF-8 files are refused with a clear per-file error, without failing the rest of the batch
- [ ] API tests cover a successful batch, mixed valid and invalid files, and link resolution

## Blocked by

`08`
