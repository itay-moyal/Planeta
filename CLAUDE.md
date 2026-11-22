# CLAUDE.md — Plant Care Assistant ("Planeta")

> Read this file fully before doing anything. If something here conflicts with a request in chat, stop and ask.
> Also follow the installed `andrej-karpathy-skills` guidelines (think before coding, keep it simple, make surgical changes, work toward verifiable goals). Where this file is stricter, this file wins.

## 1. Who I am working with and why this project exists

- Itay: junior full-stack developer (React, Redux, Node/Express, MongoDB, Socket.io, Vite). Looking for a full-stack job/internship.
- Goal of this project: a portfolio piece that shows real use of LLMs, an agent with tools, and a small machine-learning component, built **with** Claude Code but **fully understood by Itay**. He must be able to explain every part in an interview.
- Real use case: Itay has 4-5 plants at home and will add 6-7 herbs (mint, basil, etc.) to a balcony planter in Israel. He is the first user and the test case, **but the product is multi-user**: anyone should be able to sign up, add their own plants, and get their own reminders. Never hardcode anything specific to Itay (names, location, channel, plants).
- Low friction still matters: sign-up must be quick (email + password, no email verification for now). The app must behave like a real production product: interviewers go through the real flow themselves (upload, sign up, see the plant, save it). There is no demo mode and no sample data.
- Language: all code, comments, commits and docs in English. **User-facing app text is Hebrew (RTL)**.

## 2. Working agreement (most important section)

1. **Small steps.** One feature or one file group at a time. After each step: say what changed, why, and how to check it. No big-bang generation.
2. **Explain-back.** After each phase, ask Itay to explain the main flow in his own words. Add his explanation to `LEARNING.md`. Correct gaps kindly and specifically.
3. **Plan before code.** For any task that touches more than 2 files, write a short plan first (files to touch, files NOT to touch, how to verify) and wait for approval.
4. **Surgical changes.** Do not refactor, rename, reformat or "improve" code outside the task. Mention improvement ideas instead of doing them.
5. **Simplicity first.** Prefer boring, readable code. No new dependency without saying why and asking first. No abstractions until there are two real uses (the one exception is `NotificationChannel`, see 6).
6. **Verify, don't assume.** Run the code, run tests, show real output. Never claim something works without running it. Never invent API endpoints, parameters or response shapes: read the official docs (or fetch them) and tell me the source.
7. **Honest uncertainty.** If you are unsure, say so. Say "I don't know" rather than guessing.
8. **Never touch:** `.env` contents (do not print or commit secrets), the git history (no force-push, no rewriting), and files outside this repo.
9. Commit small and often with clear messages. Ask before pushing.
10. **Multi-user safety:** every query on user data is scoped by the authenticated `userId`, enforced in the service layer (never trust a `userId` sent by the client). Add a test for every endpoint proving user A cannot read or change user B's data. Never log photos, tokens, or personal data.
11. Itay is learning: when a concept is new (service worker, webhook, JWT, embeddings, structured output), give a 3-5 line explanation before using it.

## 3. What the app does (product flow)

0. **Account (from phase 2):** quick sign-up/login (see section 4). On first login the user sets: city (for weather, not exact address), timezone, and preferred reminder channel. A visitor without an account can upload a photo and run identification, but sees only a teaser (a match was found, with its confidence), never the species. The server holds the result for about 30 minutes under a random token and releases it once, when the visitor signs up or logs in and claims it (no second Pl@ntNet call). The hiding is enforced on the server, never only in the UI. Visitors are limited per IP per day.
1. **Add plant:** the user takes/uploads a photo.
2. **Identify:** backend sends the photo to the Pl@ntNet identification API and gets a ranked list of species with confidence scores.
3. **Confirm (mandatory):** UI shows the top 3 candidates with reference photos and confidence. The user picks the right one, or "none of these" (then manual search by name). The app **never auto-accepts** an identification.
4. **Place:** the user marks the location: indoor (window direction, light level), balcony planter (sun exposure, pot size), or garden (sun exposure). Planter-mates are tracked (several plants can share one planter).
5. **Care profile:** backend fetches care data for the species (watering, light, temperature, toxicity), caches it in MongoDB, then asks the LLM **once per plant** to write a personalized care plan in Hebrew, grounded only in the fetched data plus the placement info. If care data is missing, say so; do not fill gaps with invented facts.
6. **Schedule:** a watering schedule is created from the care profile, the season, and (for outdoor plants: balcony and garden) weather.
7. **Remind:** at the scheduled time the app sends a notification (Telegram first; WhatsApp later, see 6).
8. **Feedback loop:** the notification asks "is the soil still moist?" (yes / no / already watered). The answer is logged and adjusts the plant's watering interval (see 5, ML).
9. **Dashboard:** shows all plants, next watering, history, care plan, and any warnings (e.g., plants that should not share a planter, pet toxicity).

## 4. Architecture

- **Frontend:** React + Vite, RTL Hebrew, mobile-first (Itay uses an iPhone). Photo upload via `<input type="file" accept="image/*" capture>`.
- **Backend:** Node.js + Express (REST). Keep the layered structure he already knows: routes → controllers → services → models.
- **Auth:** email + password with hashed passwords (bcrypt) and httpOnly-cookie sessions/JWT, which he already knows from his course. Optional later: Google sign-in. Auth middleware on all user-data routes. Rate limiting on auth and upload routes.
- **DB:** MongoDB Atlas. Collections: `users`, `plants`, `species_cache`, `planters`, `watering_logs`, `reminders`. `species_cache` is shared between users (it holds public species data only); everything else is per user.
- **Deploy:** Render (same as his Meatify project). Env vars for all secrets.
- **Scheduler:** simple cron-style job (e.g., `node-cron`) that checks due reminders. Plain code, **no LLM call in the reminder path**.
- **Agent layer (added in phase 5):** LLM with tools: `identify_plant`, `get_care_data`, `get_weather`, `schedule_reminder`, `log_watering`. Tool calls are validated by backend code; the LLM never writes to the DB directly.

### Data model (draft, confirm in phase 1 before coding)

- `User`: email, passwordHash, city, timezone, language (default `he`), notificationChannel (`telegram` | `whatsapp` | `email`), channelAddress (linked chat id), usage counters (identifications and LLM calls per day), createdAt
- All collections below also carry `userId` (indexed).
- `Plant`: name, species (scientific + common names), identificationConfidence, confirmedByUser, photoUrl, location (`indoor` | `balcony` | `garden`), light notes, planterId?, careProfileRef, intervalDays, lastWateredAt, createdAt
- `Planter`: name, sunExposure, sizeNotes, plantIds
- `SpeciesCache`: scientificName, sourceData (raw), source, fetchedAt
- `WateringLog`: plantId, at, action (`watered` | `skipped_rain` | `still_moist` | `was_dry`), source (`user` | `reminder_reply`)
- `Reminder`: plantId, dueAt, channel, status, sentAt

## 5. External services and AI components

| Need | Service | Rules |
|---|---|---|
| Plant ID from photo | Pl@ntNet API | Free tier is limited per day. Show attribution in the UI. Failed requests may consume credits. Weaker on young plants and grasses. Always show top-k + confidence. |
| Care data | Perenual (primary), Trefle (fallback) | Coverage is incomplete. Cache by species. Handle "no data" explicitly. Respect rate limits. |
| Weather | Open-Meteo (no key) | Used for outdoor plants only (balcony, garden): skip/delay watering after rain, shorten the interval in heat. |
| LLM | Anthropic API (separate billing from the Claude Pro plan) | Called rarely: once per new plant for the care plan, plus agent steps in phase 5. Use structured output (JSON schema). Cache results. Keep prompts in `/server/prompts/`. Log token usage. |

**Verify every endpoint, parameter and limit against the current official docs before coding against it.**

### Shared quotas and cost with many users
- The Pl@ntNet free quota and the Anthropic API budget are shared by **all** users. Add per-user daily limits (identifications, LLM calls), a global kill switch via env var, clear Hebrew messages when a limit is reached, and server-side image size limits.
- Cache aggressively (species data, care plans per species + placement type) so two users with the same plant do not cost two LLM calls where a shared, non-personal result is fine.
- Pl@ntNet is a research service with attribution requirements: before opening the app to the public, re-read their terms of use for hosted/multi-user apps and confirm this use is allowed.

### LLM rules
- Ground every statement in provided data. If data is missing, output "unknown", not a guess.
- Output structured JSON validated on the backend, then rendered in the UI.
- No personal data in prompts beyond what's needed (plant info, placement, city-level region). Never send emails, names, or user ids to the LLM.
- Plant toxicity text must be framed as information, not veterinary advice.

### ML component (keep it small and honest)
- **v1:** the watering interval starts from the care data, then adapts from logged feedback with a simple, explainable rule (e.g., moving average of the interval at which the soil was actually dry). No black box.
- **v2 (optional):** use season and weather as features, compare against v1 on Itay's own logs.
- Do not claim "machine learning" in the README for anything that is a fixed rule. Describe what it really is.

### Evaluation (the portfolio story)
- Build a labeled set of photos (Itay's own plants plus a few friends' plants, with their consent) (several angles/lighting per plant) in `/eval/`.
- Measure top-1 and top-3 accuracy of Pl@ntNet, then of an LLM with vision, then of a combination. Report results honestly, including failures, in the README.
- Never copy accuracy numbers from marketing blogs.

## 6. Notifications

- Define one interface, `NotificationChannel { send(message), parseReply(payload) }`.
- Each user chooses their own channel and links it once. **Linking flow (Telegram):** the app shows a one-time code or deep link, the user opens the bot and sends `/start <code>`, the backend stores that user's chat id. Codes expire and are single-use. A user can unlink and delete their data at any time.
- **First implementation: Telegram bot** (free, no template approval, works well on iPhone). One bot serves all users; the chat id decides who a reply belongs to.
- **Fallback channel: email**, for users who do not want Telegram. Build it early since it is simple.
- **Later, optional: WhatsApp Cloud API.** Proactive messages outside the 24-hour window must be pre-approved templates; a user's reply opens a 24-hour window for free-form messages. Each user must give their number and opt in. Per-message costs and the test-number limit (a few registered recipients) mean this is not suitable for open public use without a paid setup. Do not use unofficial WhatsApp libraries (ban risk).
- Reminders are scheduled in each user's timezone, and batched per user so one person does not get ten separate messages.
- Reminder text is Hebrew, short, with reply buttons.

## 7. Phases (do them in order; do not start the next phase without my approval)

**Phase 1: skeleton (start here)**
- Repo structure, Express server, MongoDB connection, React+Vite app, one page with photo upload, call Pl@ntNet, show top-3 candidates with confidence. No accounts yet and nothing stored about the user; add a simple rate limit and an image size limit from day one.
- Written before coding: short plan, final data model (including `User` and `userId` scoping), list of env vars.
- Done when: uploading a real photo of a plant returns candidates in the UI, errors (bad photo, API failure, quota reached, no network) show a Hebrew message, and Itay can explain the request flow end to end.

**Phase 2: accounts, confirm and save** — sign-up/login, user settings (city, timezone), pick a candidate, save plant + placement per user, plants list page, visitor teaser and claim after sign-up. Includes the cross-user access tests.
**Phase 3: care data and plan** — fetch + cache care data, one LLM call per plant, show the Hebrew care plan, warnings (pet toxicity, planter conflicts).
**Phase 4: reminders** — scheduler (per-user timezone), Telegram channel with the linking flow, email fallback, reply handling, watering log. WhatsApp only if time allows.
**Phase 5: weather and learning** — Open-Meteo, interval adaptation (ML v1), agent with tools.
**Phase 6: evaluation and polish** — eval set, results, README with architecture diagram, deploy to Render (the live URL interviewers use; before it, re-read the Pl@ntNet terms for hosted use). No demo mode.

## 8. Definition of done (every phase)
- Runs locally; one-command start documented in README.
- Tested manually with real data; basic automated tests for services and any logic with branches.
- No secrets in the repo; `.env.example` is updated.
- User-data endpoints are authenticated and scoped by `userId`, with a test showing another user cannot access them.
- `LEARNING.md` updated with Itay's own explanation.
- Short summary of what changed and what is still unknown or risky.

## 9. Project commands (run from the repo root)
- Install: `npm run setup` (root, `server/` and `client/`)
- Dev: `npm run dev` (server on :4000 and client on :5173 together, via `concurrently`)
- Test: `npm test` (server tests; the database tests wipe `MONGODB_TEST_URI`)
- Build: `npm run build` (client)
- Lint: none set up yet

## 10. Open questions to resolve with Itay
- Final project name.
- Photo storage: local/Atlas vs a cloud bucket (decide in phase 1; keep it simple).
- Auth approach details: email+password only, or add Google sign-in.
- Privacy basics for a public app: a short privacy note, account/data deletion, how long photos are kept (default: do not store originals longer than needed).
- Who the first outside users are (friends/family) and how many, to size quotas.
- Telegram bot token setup and how the first reply flow will be tested.
