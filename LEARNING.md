# LEARNING.md

## Phase 1: app flow (Itay's explanation, technical)

1. The user is asked to capture/add a photo.
2. Express rate limit and multer check the file (size and type) and keep the photo in memory; it is not saved anywhere.
3. The request is sent to the Planeta API.
4. The service gets the top 3 results.
5. If anything fails, an error appears.

Correction: step 3 is mixed up. The request to our Planeta API (`/api/identify`) comes first, and the rate limit and multer run inside it. Only then does our service call the Pl@ntNet API. The error is a Hebrew message from the server.

## Phase 1: user flow (Itay's earlier explanation)

1. The user uploads or captures a plant photo.
2. The photo is uploaded.
3. The photo appears so the user can see it. (Issue found: the preview cropped the image. Fixed with `object-fit: contain`.)
4. The user gets the 3 species closest to the photo. (Observation: the top match had the highest percentage, but the percentages don't add up to 100%. Open question: how to help the user verify the match.)

### Notes / corrections

The flow above is the user's view. The hidden middle, which you should be able to explain in an interview:

1. Browser: `<input type="file">` -> `FormData` -> `POST /api/identify` (Vite proxies `/api` to Express on :4000).
2. Express: rate limiter (5/min) -> multer (JPG/PNG only, max size, kept in memory, never on disk) -> controller.
3. Controller: checks the kill switch and that a file exists, then calls the service.
4. Service: sends the image to Pl@ntNet with the API key (key stays on the server, never in the browser), maps the top 3 results to a small shape.
5. Any failure becomes an `AppError` with a code, and the error handler returns a Hebrew message. The UI just shows it.

**Why the percentages don't sum to 100%:** `score` is the model's estimated probability per species out of thousands of possible species. We only show the top 3, so the remaining probability sits in species we cut off. That is expected, not a bug.

**Verifying the match (ideas, for later, not built):**
- Compare the user's photo to the reference photos (already shown). This is the main human check and the reason confirmation is mandatory.
- Ask for a second photo of another organ (leaf, flower) and re-identify.
- Show a low-confidence warning when the top score is small (e.g. under 50%; threshold to be decided from real results).
- Phase 6 evaluation will measure how often the top-1 and top-3 are actually right on our own photos.

## Phase 2: accounts, confirm and save (Itay's explanation)

A visitor gets on the website and uploads a photo. They are sent to the /claim page and get a teaser, and need to sign up. After signing up they claim the held result, then pick 1 of the 3 candidates (the one that fits) and set its placement (indoor or balcony). The plant then appears in their plants list, which is per user (each user sees only their own plants). A user may identify up to 10 times a day (it resets every day; credits or memberships may come later). At the limit they get a "come back tomorrow" message.

His own idea while explaining: some people have gardens, so placement should also offer Garden/Outdoor.

### Corrections and gaps

1. **There is no /claim page.** `/api/identify/claim` is a server endpoint, not a screen. The visitor stays on the identify page, sees the teaser, and clicks sign up, which goes to `/login` in sign-up mode. After sign-up the app returns to `/`, and the identify page calls `claim` by itself when it loads for a logged-in user.
2. **Why the result is held on the server (the part worth explaining in an interview).** The server calls Pl@ntNet once, stores the real result under a random token (only a hash of the token is stored, with a 30-minute expiry), and sends the visitor only a teaser: "a match was found, 94%", no species. The token travels in an httpOnly cookie (`planeta_pending`). On sign-up, `claim` reads the result and deletes it in one atomic step, so it works once and costs no second Pl@ntNet call. The hiding happens on the server. If it were only hidden in the UI, anyone could read the species from the network tab.
3. **Visitors have their own limit:** 3 identifications per IP per day. The 10 per day applies to logged-in users.
4. **Confirm has a third option:** besides the 3 candidates there is "none of these", which lets the user type a name. The app never auto-accepts an identification. (The real test showed why: for the pothos photo, Pl@ntNet ranked the wrong species first at 59% and the right one second at 29%.)
5. **What the daily limit really counts:** identifications (calls to Pl@ntNet), not saved plants. Saving has a separate cap of 100 plants per user. The count lives on the user in MongoDB per UTC day, is updated with an atomic conditional update (so simultaneous requests cannot slip past it), and is spent before the Pl@ntNet call because failed requests may still use credits. The UTC day means the reset happens at 02:00 or 03:00 Israel time, not midnight. Switching to the user's own timezone is a possible later change.
6. **The key part missing from the explanation: how "each user sees only their own plants" is enforced.** The user id comes only from the signed httpOnly login cookie (never from anything the client sends). Every plant and planter query includes that `userId` in the service layer. Someone else's plant returns "not found", the same as a plant that does not exist. Automated tests check that user A cannot read, change or delete user B's data.

### The flow in full (for an interview)

1. Visitor uploads a photo -> `POST /api/identify` (rate limits, multer) -> Pl@ntNet -> result held server-side -> teaser to the browser.
2. Sign-up (`POST /api/auth/signup`, bcrypt hash, JWT in an httpOnly cookie, timezone from the browser) -> back to `/`.
3. The page calls `POST /api/identify/claim` -> the candidates appear (and are kept in `sessionStorage` so a refresh does not lose them).
4. The user picks a candidate (or types a name) -> placement form -> `POST /api/plants` (whitelist validation, scoped to the user's id).
5. `GET /api/plants` returns only that user's plants -> the plants list, where they can edit or delete.

### Product idea from the explanation: garden placement (built)

Placement is now `indoor`, `balcony` or `garden`. `garden` is its own value (not merged into one "outdoor") because a garden plant is usually in the ground while a balcony plant is in a pot, which will matter for watering. It takes sun exposure only (no pot size) and may belong to a planter, which works as a garden bed. Adding a value to the allowed list needed no data migration. For the weather logic in phase 5, the rule is "anything that is not `indoor` is outdoor".
