# CLAUDE.md

This file provides guidance for AI assistants (Claude and others) working in this repository.

## Repository Status

This repository is currently in its **initial state** — no source files or commits exist yet. This CLAUDE.md should be updated as the project is built out.

- **Remote**: `http://local_proxy@127.0.0.1:35237/git/lkt7291-design/pajuelbum`
- **Organization/Repo**: `lkt7291-design/pajuelbum`

---

## Git & Branch Conventions

### Branch naming
- Feature/task branches follow the pattern: `claude/<descriptor>-<session-id>`
- Example: `claude/claude-md-mml9a0ibzvkcuuud-tLcYv`
- **Never push to `main` or `master` directly** without explicit permission.

### Pushing changes
Always use:
```bash
git push -u origin <branch-name>
```

If a push fails due to a network error, retry with exponential backoff: 2 s → 4 s → 8 s → 16 s (max 4 retries).

### Commit messages
- Use clear, imperative-mood subject lines (e.g. `Add user authentication`, `Fix null pointer in parser`).
- Keep the subject line under 72 characters.
- Add a blank line and a longer body when extra context is needed.

---

## Development Workflow

> **Note**: The sections below are placeholders. Fill them in once the project stack is chosen.

### Prerequisites
<!-- List required runtime versions, tools, or system dependencies here. Example:
- Node.js >= 20
- Python >= 3.11
- Docker >= 24
-->

### Installation
```bash
# Example — replace with actual commands once a package manager is chosen
# npm install
# pip install -r requirements.txt
# cargo build
```

### Running the project
```bash
# Example
# npm run dev
# python -m myapp
```

### Running tests
```bash
# Example
# npm test
# pytest
# cargo test
```

### Linting / formatting
```bash
# Example
# npm run lint
# ruff check . && ruff format .
# cargo clippy
```

---

## Project Structure

> **Note**: Update this section once source files exist.

```
pajuelbum/
├── CLAUDE.md          # This file
└── (project files TBD)
```

---

## Key Conventions

These conventions should be followed as the codebase grows:

1. **Keep changes minimal** — only modify what is directly requested or clearly necessary.
2. **No over-engineering** — avoid adding abstractions, error handling, or features beyond the current task.
3. **Security first** — never introduce SQL injection, XSS, command injection, or other OWASP top-10 vulnerabilities.
4. **No secrets in code** — use environment variables for credentials and API keys; never commit `.env` files.
5. **Test coverage** — write tests for new logic; do not ship untested code.
6. **Comments** — only add comments where the logic is not self-evident.

---

## Environment Variables

> **Note**: Add a `.env.example` file listing all required variables (with placeholder values) once the project has environment-dependent configuration. Never commit real secrets.

---

## CI/CD

> **Note**: Document the CI/CD pipeline here once it is configured (GitHub Actions, GitLab CI, etc.).

---

## Updating This File

Whenever significant project decisions are made — tech stack selection, new tooling, architectural patterns — update the relevant section of this file so future AI sessions start with accurate context.
