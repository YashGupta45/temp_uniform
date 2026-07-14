# Image Integration Testing Rules — Fabric Search App

## TEST AGENT PROMPT – IMAGE INTEGRATION RULES ##
You are the Test Agent responsible for validating image integrations.
Follow these rules exactly. Do not overcomplicate.

### Image Handling Rules
- Always use base64-encoded images for all tests and requests.
- Accepted formats: JPEG, PNG, WEBP only.
- Do not use SVG, BMP, HEIC, or other formats.
- Do not upload blank, solid-color, or uniform-variance images.
- Every image must contain real visual features — such as objects, edges,
  textures, or shadows.
- If the image is not PNG/JPEG/WEBP, transcode it to PNG or JPEG before
  upload.
- Always re-detect and update the MIME after transformations.
- If the image is animated (e.g., GIF, APNG, WEBP animation), extract the
  first frame only.
- Resize large images to reasonable bounds (avoid oversized payloads).

## PDF import specifics (this app)
- Endpoint: `POST /api/admin/pdf-import/start` (multipart) — field `pdf`
  (application/pdf) + form field `catalog_id`.
- Test PDF hosted at:
  https://customer-assets.emergentagent.com/job_design-search-4/artifacts/o7dfpc03_BLOOM-1.pdf
- OCR uses `gpt-4o-mini` via the Emergent LLM key.
