# WEFT · AI — AI Fabric Design Search Mobile App

## Product overview
Mobile-first tool for uniform / textile business owners who need to identify
the exact design number of a cloth sample by photographing it. Works like
Google Lens, but only over the business's private catalog database.

## Users & roles
- **Admin** — full access: users, catalogs, designs, embeddings, duplicates.
- **Manager** — manages catalogs & designs, sees stats/duplicates.
- **Employee** — searches, browses, favorites (read-only).

## MVP feature set (shipped)
1. JWT auth (bcrypt, seeded admin/manager/employee) with 3-role RBAC.
2. Catalog CRUD (name, brand, manufacturer, year, season, cover image).
3. Design CRUD with image upload (base64, auto-embedded on save).
4. **AI similarity search** — photo → Top 20 matches with % score.
   - Custom textile-focused embedding: HSV histogram + perceptual hash +
     HOG-lite gradient orientation + LBP-style texture + patch color stats.
   - Query-side augmentation: blur/rotate/autocontrast variants averaged.
   - Fabric-region isolation (center 85% crop) to ignore cluttered
     backgrounds.
5. Text search: design number, tags, catalog, brand, pattern, color filters.
6. Design detail with related-designs (visually similar shortlist).
7. Favorites (pin) & Recent searches per user.
8. Admin dashboard: users, catalogs, designs, 7-day searches, storage MB,
   duplicate estimate.
9. Duplicate detection (>=94% sim) with side-by-side compare + delete.
10. Regenerate all embeddings (admin) after algorithm change.
11. User management (admin) with role assignment.

## Tech
- Backend: FastAPI + MongoDB (Motor). All routes under `/api`.
- Similarity: numpy + Pillow + imagehash. Vectors stored in-doc; ranked with
  numpy dot-product (<200ms for tens of thousands of designs).
- Frontend: Expo Router (React Native + web) — light-mode-first Industrial
  Editorial theme with Signal Red scanner accent + Klein Blue CTAs.
- Storage: `@/src/utils/storage` (SecureStore for auth token).

## Deferred (v2)
Offline sync, PDF/ZIP bulk import, barcode/QR scan, voice search, cloud
backup, CI/CD scaffolding, push notifications.

## Business enhancement idea
Add a shareable "match report" (PDF) generated from a scan, so employees
can text the customer a branded proof (design #, catalog, price on file).
This directly increases quote-to-order conversion for the uniform business.
