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
