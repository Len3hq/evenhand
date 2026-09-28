# Image uploads: re-encoded by the portal, visible exactly like their project

- Status: accepted
- Date: 2026-09-28 · Owner: A

## Context

T1's reference field set includes a thumbnail and an image gallery. The `submission_images` table and the `uploads` volume existed, but nothing wrote to them. Image uploads are the first place the portal stores files from strangers. A file can hide a script after the picture, carry the GPS position where a photo was taken, or be a "decompression bomb": a small file that decodes to a picture too large for memory. The portal must also stay within the hackathon's rules: `docker compose up` with no network at runtime, and nothing fetched from elsewhere.

## Decision

- **Re-encode every upload with sharp (libvips).** The decoded format must be JPEG, PNG or WebP (read from the bytes, never the file name; SVG, GIF and HTML are refused with 400 `unsupported_image`). The header is read first, and anything over 40 megapixels is refused with 413 before it is decoded. The pixels are then encoded afresh as WebP: a copy that fits in 1600 × 1600 and a 640 × 400 thumbnail. Only the pixels survive; EXIF (camera, GPS), ICC, XMP and any bytes after the image are gone. The e2e suite checks each of these on the stored files.
- **Why sharp, and why it keeps the offline rule.** Before building, sharp 0.35.4 (already in the lockfile through Next.js) was installed in the pinned `node:24-bookworm-slim` image with the network on, then run with `--network none` on arm64 and emulated amd64: it re-encoded, stripped metadata and refused the bad inputs identically on both. Its libvips is a prebuilt binary installed by `npm ci` during the image build, like every other dependency; nothing is compiled (decision 45) or downloaded at runtime. The offline drill confirms it in the real stack: the browser uploads an image with every network cut.
- **Deny first, before the upload is read.** Nest runs guards before interceptors, and the multipart parser is an interceptor, so `EditableSubmissionGuard` checks the team, the deadline and the duplicate state first; a stranger or a late team is refused without a byte being accepted. The upload is held in memory, capped at 8 MB (413 beyond it), and never written as received.
- **Writes** follow the service order: the image is processed, its two files are written (each under its final name only once complete), then the row and its audit entry commit together under a lock on the submission, with the deadline checked again. If the transaction fails, the files are removed. At most 6 images (409 `too_many_images`); the first is the cover, and the order can be changed. Removing an image deletes its files after the removal commits.
- **Visibility follows the project.** `GET /api/images/:id[/thumb]` serves an image publicly exactly when its project is in the public gallery. Otherwise it is for the team, the event's organisers and admins, and judges assigned to the project: 401 for a visitor, 403 for anyone else, and 404 when there is no such image. Unlike other routes, the answer depends on the project, so the image is looked up first; ids are random UUIDs.
- **Response headers:** `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin`, and `Cache-Control: public, max-age=300` for public images, `private, no-store` for the others. The web app's CSP already limits images to the portal's own origin.
- **Rate limits.** Uploads have their own limit (`RATE_LIMIT_UPLOAD_PER_MIN`, 30), since each one costs CPU. Image downloads have their own, larger limit (`RATE_LIMIT_IMAGE_PER_MIN`, 3000) instead of the default: one gallery page loads many thumbnails, and a venue's visitors share one address behind its NAT.
- The gallery's `thumbnailUrl` (unused until now) is the cover's thumbnail; the old `thumbnail_url` column is no longer read.

## Consequences (including what we gave up)

- Re-encoding is slightly lossy (WebP quality 82), and animated images are not accepted.
- sharp adds about 19 MB to the api image. Its libvips is LGPL-3.0-or-later, used unmodified as a separate library; the README credits it.
- Images are not part of the event export (the fixtures.json shape has no field for them). Back up the `uploads` volume with the database.
- If the server stops between writing the files and committing, the files stay without a row. They are never served, since serving starts from the row.
