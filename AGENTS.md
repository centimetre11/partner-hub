<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Partner Hub is a single Next.js 16 (App Router) app using Prisma + a local SQLite file (`prisma/dev.db`). There is no external database/service — everything runs in one process.

- Run the dev server with `npm run dev` (http://localhost:3000). Standard scripts live in `package.json` (`dev`/`build`/`start`/`lint`).
- A `.env` is required. If missing, `cp .env.example .env` and set a real `SESSION_SECRET` (e.g. `openssl rand -hex 32`); cookie sessions fail without it.
- Database setup is one-time and persists in the workspace: if `prisma/dev.db` is absent, run `npx prisma db push` then `npx tsx prisma/seed.ts` (seeds 67 candidate partners + initial todos). Re-running the seed re-inserts data, so only run it on a fresh DB.
- First run: the `/login` page shows a "create admin account" form (no pre-seeded users). Create an admin there to access the app.
- AI features (assistant, intake, agents) need `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` in `.env`; without a key the rest of the app works and AI just reports "not configured". Web search optionally uses `TAVILY_API_KEY`.
- `npm run lint` currently reports pre-existing `react-hooks/rules-of-hooks` errors on the non-hook function `useKimiBuiltinSearch` (in `src/lib/agent-runner.ts` and `src/app/api/ai/assistant/route.ts`). These are existing code issues, not environment problems.
