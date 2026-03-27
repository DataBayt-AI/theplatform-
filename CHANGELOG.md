# Changelog

All notable changes to **DataBayt AI Studio** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.3.0] — 2026-03-27

### Added
- **Arabic language support** — full UI translation (749 keys) with automatic RTL layout switching across all pages and components
- **Language switcher** — runtime language toggle (English / Arabic) accessible from the user menu
- **NER annotator** — span-based Named Entity Recognition annotator with inline text selection and entity labeling
- **Guidelines sidebar** — collapsible in-workspace panel showing project guidelines as rendered Markdown, stacked above the metadata panel
- **Arabic demo seed script** — pre-built Arabic NLP projects for quick demos (`server/scripts/seed-arabic-projects.js`)

### Changed
- **User menu** — replaced text+badge button with an avatar icon showing the user's initials; username and role shown in a tooltip and dropdown header
- **Workspace header actions** — replaced the ⋮ dropdown with inline icon buttons (History, Model Selection, Keyboard Shortcuts, Tutorial, Notifications) for immediate access
- **Metadata + Guidelines panel** — stacked vertically in a shared collapsible column; header rows are fixed so icons never shift when a panel expands
- **Back navigation** — arrow button now steps through record → list → dashboard instead of jumping directly to the dashboard
- **MetadataSidebar** — refactored into a content-only renderer; layout is controlled by the parent column wrapper

### Fixed
- **RTL arrows** — back button, prev/next navigation, undo/redo icons, comments pagination, and annotation pagination all flip correctly in RTL mode
- **Assignment status badges** — `done`, `in_progress`, and `pending` statuses in Completed Annotations and IAA & Annotation Details are now translated instead of showing raw English values
- **DB path** — seed scripts use the correct `server/data/` path matching the server's runtime location

---

## [1.2.0] — 2026-02-XX

### Added
- **IAA dashboard** — inter-annotator agreement metrics and visualizations per project
- **Task template system** — reusable annotation task templates with a picker modal
- **Annotation form preview** — live preview of the annotation form alongside a visual form builder
- **XML config extensions** — radio button and rating-scale field types added to the XML annotation config schema

### Fixed
- **Audit log** — handle plain-text strings in the `details` field without crashing
- **Database location** — store SQLite database in `process.cwd()/data` instead of inside `node_modules`
- **npm tarball** — exclude `server/data/` and `__tests__/` from the published package

---

## [1.1.0] — 2025-12-XX

### Added
- **Annotation quality dashboard** — per-annotator statistics, accuracy, and throughput metrics
- **JWT authentication** — replaced insecure `x-user-id` header trust with Bearer token auth and `sessionStorage` storage
- **Security hardening** — bcrypt password hashing (rounds=12), Helmet headers, CORS restriction, rate limiting on login endpoint, API key masking
- **Notification system** — in-app notification bell with deep-link navigation to relevant project events
- **Tutorial system** — guided step-by-step onboarding for the dashboard and workspace
- **HuggingFace export** — publish annotated datasets directly to HuggingFace Hub via a Web Worker (non-blocking)
- **Audio annotation** — support for `.mp3`, `.wav`, `.m4a` data points in the labeling workspace
- **Google Gemini support** — Gemini models available alongside OpenAI and local (Ollama) providers
- **Dataset versioning** — snapshot and restore project annotation state at any point
- **User management** — role-based access (admin / manager / annotator), project assignments, invite-based signup
- **Comment system** — per-data-point threaded comments with edit and delete

---

## [1.0.0] — 2025-10-XX

Initial public release.

- Core data labeling workspace with list and record views
- Project management with per-project model policies
- AI-assisted annotation (OpenAI, local Ollama)
- CSV, JSON, and plain-text import
- Export filtered or full annotations to JSON / CSV
- Dark / light theme
