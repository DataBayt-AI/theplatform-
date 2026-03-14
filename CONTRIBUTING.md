# Contributing to DataBayt.AI Studio

Thank you for your interest in contributing to DataBayt.AI Studio! We welcome contributions from the community to help make this tool better for everyone.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/DataBayt-AI/theplatform-.git
   cd theplatform-
   ```

3. **Install dependencies**:

   ```bash
   npm install
   ```

4. **Set up environment**:

   ```bash
   cp .env.example .env
   # Edit .env and set JWT_SECRET to any random string for local dev
   ```

5. **Start the development server**:

   ```bash
   npm run dev:all
   ```

   This starts both the Vite frontend (default: `http://localhost:8080`) and the Express backend.

## Project Structure

### Frontend (`src/`)

| Path | Purpose |
| ---- | ------- |
| `components/DataLabelingWorkspace.tsx` | Main annotation workspace (the largest component) |
| `components/UserMenu.tsx` | User dropdown, forced password change dialog |
| `components/NotificationBell.tsx` | In-app notification bell with deep-link navigation |
| `components/Tutorial/` | driver.js guided tour — hook, step definitions, CSS |
| `pages/Dashboard.tsx` | Project list, user management, login form |
| `pages/ModelManagement.tsx` | Provider connections, model profiles, project policies |
| `pages/Signup.tsx` | Invite-link self-registration flow |
| `services/apiClient.ts` | Typed fetch wrapper — attaches Bearer token to every request |
| `services/aiProviders.ts` | AI provider integrations (OpenAI, Anthropic, etc.) |
| `services/xmlConfigService.ts` | XML annotation schema parser |
| `services/exportService.ts` | JSON / CSV / JSONL export logic |
| `contexts/AuthContext.tsx` | JWT auth context — login, logout, user CRUD |
| `types/data.ts` | Shared TypeScript interfaces |

### Backend (`server/`)

| Path | Purpose |
| ---- | ------- |
| `index.js` | Express app setup — helmet, CORS, rate limiting, route registration |
| `middleware/auth.js` | JWT verification (`attachUser`), `requireAuth`, `requireRole`, `generateToken` |
| `routes/users.js` | Auth endpoints (login, signup, `/me`), user CRUD, invite tokens, demo project seed |
| `routes/projects.js` | Project and data point CRUD, snapshots, audit log, comments |
| `routes/models.js` | Provider connections, model profiles, project model policies |
| `services/database.js` | SQLite init, schema creation, migrations, default admin seed |
| `services/notificationService.js` | Notification creation helpers |

## Key Feature Areas

### Authentication and Security

- Auth is JWT-based. `server/middleware/auth.js` exports `generateToken`, `attachUser`, `requireAuth`, and `requireRole`.
- Passwords are hashed with bcrypt (rounds = 12). Plaintext passwords in existing DBs are migrated transparently on first login.
- The frontend stores the JWT in `sessionStorage` and attaches it as `Authorization: Bearer <token>` via `apiClient.ts`.
- `AuthContext.tsx` restores the session on page reload by calling `GET /api/auth/me` with the stored token.
- All AI proxy routes and write endpoints require `requireAuth`. Add it to any new route that accesses user data.

### XML Annotation Config

The annotation interface is dynamic, driven by XML. See `src/services/xmlConfigService.ts` for the parser. The XML format is:

```xml
<annotation-config>
  <field id="label" type="dropdown" required="true">
    <label>Sentiment</label>
    <options>
      <option value="positive">Positive</option>
      <option value="negative">Negative</option>
    </options>
  </field>
</annotation-config>
```

Supported field types: `textarea`, `text`, `dropdown`, `checkbox`.

### Adding a New AI Provider

1. Add proxy route(s) in `server/index.js` under `/api/<provider>/` protected with `requireAuth`.
2. Add the provider integration in `src/services/aiProviders.ts`.
3. Register the provider ID in the Model Management provider list.

### Demo Project Seed

When a new user is created (via admin or invite signup), `createDemoProject()` in `server/routes/users.js` automatically creates a practice sentiment analysis project assigned to that user. Update `DEMO_DATA_POINTS` or `DEMO_XML_CONFIG` in that file to change the demo content.

### Tutorial System

The guided tour uses [driver.js](https://driverjs.com/). Steps are defined in `src/components/Tutorial/tourSteps.ts` (separate step sets for dashboard and workspace). The tour auto-starts on first login (after any forced password change) and is tracked per-user in `localStorage`.

## How to Contribute

1. **Create a new branch** for your feature or bugfix:

   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes**, following the existing code style.
3. **Test manually** — run `npm run dev:all` and verify the feature works end-to-end.
4. **Commit with a descriptive message** following [Conventional Commits](https://www.conventionalcommits.org/):

   ```bash
   git commit -m "feat: add amazing feature"
   git commit -m "fix: correct pagination off-by-one"
   git commit -m "chore: update dependencies"
   ```

5. **Push to your fork** and open a Pull Request against `main`.

## Code Style

- TypeScript for all frontend code — define types in `src/types/data.ts` or inline where appropriate.
- Tailwind CSS for styling; use shadcn/ui components where available.
- Backend is plain ESM JavaScript (Express 5). No TypeScript on the server side.
- Keep components focused. If a component exceeds ~300 lines, consider splitting.

## Reporting Bugs

Open a GitHub issue with:

- A clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots or network logs if applicable

## Environment Variables

See `.env.example` for all supported variables. The only required one for local development is `JWT_SECRET`. Without it the server falls back to an insecure default and logs a warning.

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

By contributing, you agree that your contributions will be licensed under the same AGPL-3.0 license. See the [LICENSE](LICENSE) file for details.
