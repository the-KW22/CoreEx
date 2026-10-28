Status: ready-for-agent
Blocked by: 06, 07, 08

# 09 — Assets: upload, view, describe, quota

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

Users upload images (PNG, JPG, WebP, GIF) and PDFs as standalone Assets by drag and drop or a file picker. The upload flow is: intent → presigned PUT → confirm. The API enforces type (never SVG), the 5 MB maximum, and the User's Storage Quota (`UNSUPPORTED_TYPE`, `FILE_TOO_LARGE`, `QUOTA_EXCEEDED`), and checks the real object size on confirm. An Asset's title defaults to its filename. Users can rename it, add an optional description, view images and PDFs in the app, download them, put Assets in Folders, Tag them, link to them from Notes, and delete them (soft delete). Users see their storage used against their quota. A scheduled job cleans up uploads still pending after 24 hours. All Storage access goes through the Storage interface, which a fake replaces in tests.

## Acceptance criteria

- [ ] Allowed types upload and render (images inline, PDFs in an in-app viewer); SVG and other types get UNSUPPORTED_TYPE
- [ ] Files over 5 MB get FILE_TOO_LARGE, both at intent and when the confirm-time size check finds a mismatch
- [ ] An upload that would exceed the quota gets QUOTA_EXCEEDED; usage counts READY Assets, including trashed ones
- [ ] View and download use short-lived presigned URLs issued only to the owner
- [ ] Assets work with Folders, Tags, and Links like Notes do
- [ ] The pending-upload cleanup job removes pending Assets older than 24 hours and their objects (tested with a controllable clock)
- [ ] API tests cover every limit, ownership isolation, and confirm-size mismatch, using the in-memory Storage fake

## Blocked by

`06`, `07`, `08`
