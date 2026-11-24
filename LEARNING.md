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

## Phase 3: care data and care plan (Itay's explanation)

We started by adding the project to a new GitHub repository, after we had a problem caused by not pushing it. Phase 1 and phase 2 were pushed and phase 3 was created.

The flow of phase 3 goes like this: when a user checks for info about a plant he added to his plants (using the build care plan button), the server searches Perenual by scientific name, which goes only for the exact match, and then it fetches the details about the plant, sends the details to the LLM, the LLM checks for cache / LLM limit / LLM kill switch, and if everything is OK it builds an output structure and sends it to the user with the details (watering / poison).

There are 4 outcomes:

1. Found: the data exists.
2. Not found: no such species / no data.
3. Restricted: the plan doesn't include it (need to upgrade to get its data).
4. Temporary failures: network errors, rate limits and so on. They are never cached and the user sees "try again later".

A. If the data exists (found) it is sent to the LLM: the Anthropic SDK gets the prompt, structures an output, and validates the LLM limit and kill switch.
B. Not found and restricted: the user gets a "not found" error. We are being honest about not having details about the plant instead of using AI to find something that is not 100% certain.

### Corrections and gaps

What was right: the exact scientific-name match, the four outcomes (three are cached, the temporary failure is not), and the honesty rule (no data means no plan, not an AI guess). That is the core.

1. **Who does the checking.** The LLM checks nothing. It cannot see a cache, a limit or a switch. Our backend does all of it, in this order, before the model is ever called:
   1. The plant belongs to the logged-in user (someone else's plant is a 404).
   2. A plan that already matches the placement is returned as it is (idempotent, no cost).
   3. Care data: the cache first, Perenual only on a miss.
   4. No data: stop here, no LLM call.
   5. The lock on the plant is taken (one atomic step).
   6. The user's daily LLM allowance is spent (an atomic counter, spent before the call because a failed call can still cost money).
   7. The kill switch is checked, and only then the Anthropic call is made.
2. **The cache comes first, and it is the point of the design.** The server asks the cache (`species_cache`) before Perenual. Even "not found" and "restricted" are cached, because the free Perenual plan allows only 100 requests a day for all users together. A species costs at most one lookup per 30 days. A Hebrew (non-Latin) name makes no request at all, because Perenual only knows Latin names.
3. **The poison warning does not come from the LLM.** Warnings (pet and human toxicity, planter-mates that need very different watering or light) are computed by plain code from the stored data. The LLM writes only the plan text (summary, watering, light, tips, and a list of "unknown" topics). A fact that matters for safety should not depend on a model's wording.
4. **What the LLM receives and returns.** The backend sends an allowlisted set of fields: the species, the care facts and the placement. Never a user id, email, name or city. The model must answer in a fixed JSON schema, and the backend still checks the shape, the lengths and that the text is Hebrew, because the output of a model is input like any other and is not trusted.
5. **"Not found" is a state, not an error.** For `not_found` and `restricted` the request succeeds (HTTP 200) and the plant gets the status `no_data`. The panel shows an honest message. Only the temporary failure is an error (HTTP 503, "try again later"). If an old cached answer exists while Perenual is down, we serve the old answer instead of failing.
6. **`restricted` has a surprising shape (worth knowing for an interview).** Perenual answers a species outside the free plan with HTTP 429, the same code as a real rate limit. Only the plain-text body "Please Upgrade Plan" tells them apart. The code reads the body: "Upgrade" means restricted (cached), anything else is a temporary rate limit (never cached).
7. **The trigger.** The plan is not only built by the button. After a plant is saved, the client fires the request in the background (the button is the fallback, and the way to update). Opening the panel only reads, and never costs anything.
8. **Missing from the explanation, the parts worth knowing:**
   - **Stale:** the plan stores a fingerprint of the placement it was written for. Change the placement and the plan is marked stale. It stays visible, and the user chooses whether to spend a regeneration.
   - **The lock (`generatingSince`):** a short marker, set atomically, so simultaneous requests (a double click) produce one LLM call and not several. It expires after 2 minutes so a crash cannot block a plant.
   - **The bug we found:** the daily counter gave a false "limit reached" when several first-of-the-day requests arrived together. The losers of the race to start the counter fell through to "limit reached". The fix is one retry of the counting step. The lesson: "I did not match any of my cases" does not mean "the limit is reached".
   - **Cross-user safety:** every care endpoint filters by the user id from the login cookie, and tests prove user B gets a 404 on user A's plant.

### The flow in full (for an interview)

1. The plant is saved (`POST /api/plants`), and the client fires `POST /api/plants/:id/care` in the background.
2. The server finds the plant for this user only. A plan that matches the placement is returned as it is.
3. Care data: the cache first (30 days). On a miss, Perenual: search for the exact scientific name, then fetch the details. Outcomes `found`, `not_found` and `restricted` are cached. A temporary failure is not.
4. No data: the plant gets `no_data`, no LLM call.
5. With data: lock, daily limit, kill switch, then one Anthropic call with the allowlisted data and a JSON schema.
6. The backend validates the JSON and stores the plan, the model name, the token counts and the placement fingerprint on the plant.
7. The panel reads `GET /care`: the plan, whether it is stale, and the warnings computed by code.
