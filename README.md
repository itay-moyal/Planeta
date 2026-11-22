# Planeta 🌿

A multi-user plant care assistant. Take a photo of a plant, confirm which species it is, say where it lives (indoors, on a balcony or in a garden), and keep all your plants in one place.

The app UI is in Hebrew (right to left). Code, comments and docs are in English.

## Status

Built as a portfolio project in phases. See `CLAUDE.md` for the full plan.

| Phase | What | State |
|---|---|---|
| 1 | Photo upload and identification with Pl@ntNet | Done |
| 2 | Accounts, confirm and save plants, plants list, daily limits | Done |
| 3 | Care data and an LLM-written care plan | Not built |
| 4 | Reminders (Telegram, email) | Not built |
| 5 | Weather and watering-interval learning | Not built |
| 6 | Evaluation of identification accuracy, deploy | Not built |

There is no demo mode and no sample data. Everything you see comes from a real account.

## What works today

- Sign up and log in (email and password, httpOnly cookie session).
- A visitor can upload a plant photo and sees only a teaser ("a match was found, 94%"), never the species. After signing up they get the held result without a second identification.
- Identification with [Pl@ntNet](https://plantnet.org): the top 3 candidates with reference photos and confidence. The user always confirms; nothing is accepted automatically. If none fits, they can type a name.
- Placement: indoor (window direction, light level), balcony (sun exposure, pot size) or garden (sun exposure), optionally in a shared planter or garden bed.
- A plants list with edit and delete, and a settings page (city, timezone, reminder channel).
- Daily limits to protect the shared Pl@ntNet quota (see below).

## Tech

- **Client:** React 19, Vite, React Router. Plain CSS, mobile first, RTL.
- **Server:** Node.js, Express 5, Mongoose. Layers: routes, controllers, services, models.
- **Database:** MongoDB (Atlas).
- **Auth:** bcrypt password hashes, JWT in an httpOnly cookie.
- **Tests:** Vitest and supertest (server).

## How a request flows

1. The browser sends the photo to `POST /api/identify`. Vite proxies `/api` to the Express server in development.
2. Express applies rate limits, then multer checks the file (JPG or PNG, size limit) and keeps it in memory. Photos are never written to disk or stored.
3. For a logged-in user, a daily counter is spent, then the server calls Pl@ntNet (the API key stays on the server) and returns the top 3 candidates.
4. For a visitor, the server holds the real result under a random token (30 minutes, single use) and returns only a teaser. The hiding happens on the server, not in the UI.
5. The user picks a candidate, sets the placement, and the plant is saved with `POST /api/plants`. Every query on user data is filtered by the user id taken from the signed login cookie, never from the request body.

## Setup

You need:

- **Node.js 24** (what it is developed on)
- A **MongoDB Atlas** database (the free tier is enough)
- A **Pl@ntNet API key** from [my.plantnet.org](https://my.plantnet.org)

```bash
npm run setup
```

This installs the root, `server/` and `client/` dependencies.

Then create the server config:

```bash
cp server/.env.example server/.env
```

Fill in `server/.env`. Never commit it.

| Variable | Meaning |
|---|---|
| `PLANTNET_API_KEY` | Your Pl@ntNet key |
| `MONGODB_URI` | Atlas connection string for the app database |
| `JWT_SECRET` | A long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `MONGODB_TEST_URI` | A **separate** database for tests. Its name must contain "test" |
| `PORT` | Server port (default 4000) |
| `CLIENT_ORIGIN` | Where the client runs (default `http://localhost:5173`) |
| `MAX_IMAGE_MB` | Largest accepted photo (default 5) |
| `JWT_EXPIRES_DAYS` | Login lifetime in days (default 7) |
| `COOKIE_SECURE` | `true` in production (HTTPS only) |
| `VISITOR_DAILY_LIMIT` | Identifications per IP per day without an account (default 3) |
| `USER_DAILY_IDENTIFY_LIMIT` | Identifications per logged-in user per UTC day (default 10) |
| `IDENTIFY_KILL_SWITCH` | `true` turns identification off for everyone |

## Run

```bash
npm run dev
```

One command starts the server (port 4000) and the client (port 5173), with both outputs in one terminal. Open http://localhost:5173. Press Ctrl+C to stop both.

## Test

```bash
npm test
```

Runs the server tests. Pl@ntNet is mocked, so tests never spend real quota.

**Warning:** the database tests **delete everything** in the database named by `MONGODB_TEST_URI`. They refuse to run unless its name contains "test". Without `MONGODB_TEST_URI`, those tests are skipped and only the tests that need no database run. There are no client tests yet.

## Build

```bash
npm run build
```

Builds the client into `client/dist`.

## Daily limits

The Pl@ntNet free quota is shared by everyone, so:

- Visitors: 3 identifications per IP per day.
- Logged-in users: 10 per day (UTC), counted before the Pl@ntNet call because failed requests may still use credits. The page shows how many are left.
- A kill switch (`IDENTIFY_KILL_SWITCH`) disables identification for everyone.
- Users never see how much of the shared quota remains.

## Known limitations

- Photos are not stored. After sign-up the visitor's photo is gone and only the candidates remain.
- HEIC photos (some iPhones) are rejected; Safari usually converts them to JPEG on upload.
- No password reset and no email verification yet.
- A manually typed plant name is stored as given; it is not matched to a species (Phase 3 will need that).
- No linter is set up yet.

## Attribution

Plant identification by [Pl@ntNet](https://plantnet.org). Before this app is opened to the public, Pl@ntNet's terms for hosted, multi-user apps must be re-read (planned for Phase 6).
