# DataBayt.AI Studio

DataBayt.AI Studio is a team-based data annotation platform with AI-assisted labeling, project governance, and model management.

## Demo

![DataBayt demo](docs/assets/demo.gif)

## Features

### Annotation and Data Workflow

- Multi-format upload: JSON, CSV, TXT
- Text and image annotation tasks
- AI-assisted labeling with human review (accept, edit, reject)
- Manual labeling and partial-progress states
- Confidence scores and model rating support
- Metadata-aware datasets (raw metadata + display metadata columns)
- Dynamic annotation forms from XML config
- In-app XML editor and default XML template
- Custom upload prompt and prompt interpolation using metadata placeholders (`{{columnName}}`)
- Keyboard shortcuts, list/record views, filtered navigation
- Undo/redo support for annotation edits

### AI Providers and Model Ops

- Provider support: OpenAI, Anthropic, OpenRouter, SambaNova, Local (Ollama)
- Provider proxy routes on backend (`/api/openai/*`, `/api/anthropic/*`, `/api/openrouter/*`, `/api/sambanova/*`)
- Central model management page for:
  - Provider connections (API key, base URL, active state)
  - Model profiles (model, prompt, temperature, max tokens, optional pricing)
  - Project model policies (allowed/default profiles per project)
- Profile test action before production use
- Batch processing scopes: current item, filtered items, all items
- Token estimate and cost-aware workflow support in workspace

### Team Collaboration and Governance

- Role-based access control: `admin`, `manager`, `annotator`
- Project-level manager and annotator assignment
- Invite-link onboarding with token validation, expiry, max-use limits, activate/deactivate
- User management (create/edit/delete users, role updates, admin password reset)
- Audit log entries for key project actions (upload, AI processing, export, assignment)
- Annotation guidelines per project
- Version history snapshots with restore
- Inter-annotator agreement (IAA) configuration:
  - Enable/disable IAA
  - Percent of items to duplicate
  - Annotators per IAA item

### Export and Publishing

- Export annotated datasets to:
  - JSON
  - CSV
  - JSONL
- Export includes content, labels, AI suggestions, ratings, metadata, custom XML fields, annotator fields, status, confidence
- Hugging Face dataset publishing support (private dataset repo flow)

### Backend and Persistence

- Express backend API
- SQLite persistence (`better-sqlite3`)
- WAL mode and indexed tables for common query paths
- Paginated project data API for large datasets
- Granular single-data-point patch updates

## Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Express 5
- SQLite (`better-sqlite3`)
- `js-tiktoken` for token estimation
- `@huggingface/hub` for dataset publishing

## Quick Start

### Prerequisites

- Node.js 18+

### Installation

```bash
npm install
```

### Run frontend + backend

```bash
npm run dev:all
```

Default frontend URL is typically `http://localhost:8080`.

## Project Structure

```text
src/
  components/
    DataLabelingWorkspace.tsx
    VersionHistory.tsx
    GuidelinesDialog.tsx
  pages/
    Dashboard.tsx
    ModelManagement.tsx
    Signup.tsx
  services/
    aiProviders.ts
    exportService.ts
    modelManagementService.ts
    projectService.ts
    huggingFaceService.ts
server/
  index.js
  routes/
    projects.js
    users.js
    models.js
  services/
    database.js
```

## API Key and Provider Setup

You configure providers in **Model Management**:

1. Create a provider connection (provider, API key, optional base URL)
2. Create one or more model profiles on top of that connection
3. Assign allowed/default profiles per project using project model policy

You can then select profiles in project workspace and process data.

## Data Notes

- CSV: All columns are preserved in metadata. You can select which metadata columns are displayed in workspace.
- JSON: Supports flexible payloads, including text/image style records.
- TXT: Each line is treated as a separate text item.
- Image tasks: Supported through provider-specific image handling in AI provider layer.

## Security and Deployment Notes

- API requests are routed through local backend proxy endpoints.
- Provider keys are stored in connection config and used for proxied provider calls.
- For production, deploy both frontend and backend together.
- Review authentication/session strategy before public deployment.

## Troubleshooting

1. Provider/model list not loading

- Confirm backend is running (`npm run dev:all`)
- Verify API key in Model Management connection
- Check provider route responses in browser network tab

2. Upload issues

- Confirm file is valid JSON/CSV/TXT
- For CSV, ensure headers are present

3. AI processing errors

- Verify active model profile + active provider connection
- Verify API key credits/limits
- For local provider, ensure Ollama endpoint is reachable (default `http://localhost:11434`)

4. Access denied in project/model pages

- Confirm user role and project assignment (admin/manager/annotator)

## License

This project is part of the DataBayt.AI suite. Refer to your license agreement for usage terms.
