# Code Review FAQ — Known False Positives

This document explains automated code-review findings that have repeatedly
been flagged on this codebase but are **intentional** and **must not be
"fixed"**. Attempting to "correct" these patterns will introduce real bugs
(infinite re-render loops, broken null checks, regressions in pricing logic).

If a new automated review report surfaces one of the items below, ignore it
and reference this document in the response.

---

## 1. Python: `x is None` flagged as "Identity Comparison Antipattern"

**Verdict:** False positive. Keep the code as-is.

**Why the tool flags it:** Some linters lump every `is`/`is not` usage into a
single "identity comparison" rule, even though `None` is a singleton.

**Why it's correct:** [PEP 8](https://peps.python.org/pep-0008/#programming-recommendations)
explicitly states:

> Comparisons to singletons like `None` should always be done with `is` or
> `is not`, never the equality operators.

```python
# ✅ Correct (and what the codebase uses)
if user_id is None:
    ...

# ❌ Wrong — would trigger __eq__, can break for objects overloading it
if user_id == None:
    ...
```

---

## 2. React: useEffect/useCallback "Stale Closure Risk" on stable deps

**Verdict:** False positive. **Do not** add the flagged values to the
dependency array.

**Why the tool flags it:** Static analysers cannot always tell that a value
referenced inside a hook has a stable identity across renders.

**Why it's correct (and dangerous to "fix"):** React guarantees stable
identity for:

- `useState` setters (`setX`)
- `useReducer` dispatch
- `useRef` containers (the ref object itself)
- Module-scope constants and imported functions

Adding these to dependency arrays is harmless at best and **causes infinite
re-render loops** when combined with effects that update state.

```jsx
// ✅ Correct — `setItems` is stable, omitted intentionally
useEffect(() => {
  fetchItems().then(setItems);
}, []); // mount-only

// ❌ Do NOT "fix" to this — same behaviour, but easier to accidentally
//    introduce a non-stable dep next to it later
useEffect(() => {
  fetchItems().then(setItems);
}, [setItems, fetchItems]);
```

Mount-only effects with `[]` are a deliberate pattern and are reviewed
manually before being added.

---

## 3. Python: `except Exception` flagged as "Broad Exception Handling"

**Verdict:** False positive when the handler logs the error and returns a
safe default.

**Why it's correct:** In FastAPI route handlers we *want* to catch any
unexpected error, log it, and return a clean HTTP response rather than leak
a 500 traceback to clients. The pattern in this codebase is consistent:

```python
try:
    ...
except Exception as e:
    logger.error("operation failed: %s", e)
    return {"success": False, "error": str(e)}
```

If you spot a `except Exception` that does **not** log, that *is* a real
finding and should be fixed.

---

## 4. Python: FastAPI `Depends(...)` flagged as "Mutable Default Argument"

**Verdict:** False positive. This is the official FastAPI dependency
injection syntax.

```python
# ✅ Correct — FastAPI convention
@router.get("/me")
def me(current_user=Depends(get_current_user)):
    ...
```

`Depends(...)` is not a mutable default; FastAPI replaces it at request time.

---

## 5. General: Cyclomatic complexity on pricing / quoting logic

**Verdict:** Acceptable. Already refactored as far as makes sense.

Pricing tiers, scale-level decisions, and fallback ladders (Gemini → GPT
text fallback → manual override) are inherently branchy. Earlier rounds of
review extracted helpers (`calculate_ai_price`, `get_weekly_schedule`,
`update_booking_status`, etc.) and the remaining branches are domain rules,
not dead complexity. Further extraction would obscure the business logic.

---

## 6. General: "Magic numbers" in pricing thresholds

**Verdict:** False positive. These are product constants.

Numbers like `50`, `150`, `250`, `10` (max image MB), `50` (initial pre-
compression cap MB), and the cubic-yard tier breakpoints come from product
spec. They are documented in pricing helpers and the AI prompt, and
hoisting them to a constants module added more indirection than clarity.

---

## 7. Long functions in `templates/email_templates.py`

**Verdict:** Acceptable. HTML email bodies are intentionally linear.

Email HTML cannot easily be split without losing readability, and these
templates are pure (no branching) string builders. Already extracted out of
`server.py` for separation of concerns.

---

## 8. `[...Array(N)].map((_, i) => …)` flagged as "index-as-key anti-pattern"

**Verdict:** False positive when the mapped elements are **identical, non-reorderable** repetition.

**Where it applies:**
- `src/components/customer/ReviewsSection.jsx:170` — 5 identical `<svg>` stars

**Why it's correct:** Index-as-key is a bug only when the array is data that can reorder / add / remove. `[...Array(N)]` is pure visual repetition of the same element — the index literally IS the identity.

Real data lists in this codebase (bookings, line items, reviews) DO use stable IDs (`review.id`, `item._uid`, etc.). Do not touch the star / skeleton / spinner repetitions.

---

## 9. `localStorage` on non-sensitive UI state flagged as "insecure storage"

**Verdict:** False positive.

**Where it applies:**
- `src/components/customer/AddToHomeScreenPrompt.js` — boolean "user dismissed banner"
- `src/components/admin/FilterContext.jsx` — admin filter dropdown selections

**Why it's correct:** These values are UI-only preferences. **Nothing sensitive** (no tokens, no PII, no credentials, no auth) is ever stored in `localStorage` in this codebase. Auth uses `httpOnly` secure cookies. Encrypting a boolean or a filter enum adds zero real security.

The tool's rule fires on the presence of the `localStorage` API rather than on the actual data classification — that's a lint smell, not a security bug.

---

## 10. High cyclomatic complexity / long components flagged as "critical"

**Verdict:** Tracked, not fixed inline.

**Where it applies:** `server.py` handlers (`create_quote_from_image`, `analyze_image_for_quote`, `_build_vision_prompt`), `AdminDashboard.js`, `LandingPage.js`, `ImprovedQuoteFlow.js`, and other 300+ line files.

**Why it's not urgent:** These are stable, well-tested branchy state machines (pricing rules, quote validation, dashboard tabs). Refactoring is a separate initiative logged in `ROADMAP.md`. Splitting them mid-feature would inflate diffs, risk regressions, and delay real user value with no runtime benefit.

Refactor only when a specific bug or feature demands it, not because the tool complained.

---

## 11. Empty catch blocks in polling / eventual-consistency loops

**Verdict:** Already fixed everywhere it masked bugs. Remaining catches are intentional retries.

**Where it applies:**
- `src/components/admin/SmsTestModal.jsx:87` — Twilio delivery status poll (already logs at `console.debug`)

**Why it's correct:** Twilio's delivery status API is eventually consistent — a transient 4xx/5xx during the poll is expected and the loop must keep running. The catch logs the error at debug level (not silent), but does not surface it as a toast, because it'd flood the UI on every retry.

Do not "fix" polling retries by escalating their logging without a real user complaint.

---

## How to silence a category permanently

Add the rule key to `.codereviewignore` at the repo root with a one-line
explanation. Anything that does **not** appear there should still be
reviewed normally.

## How to handle a *new* automated report

1. Cross-reference each finding against this FAQ.
2. If it matches one of the categories above, ignore it and note the
   section number in the response.
3. If it's a *new* category, evaluate it on its merits — do **not** assume
   it's a false positive just because the tool has been noisy in the past.

## Report of 2026-06 ("71 hook deps / 8 undefined vars / localStorage")
- **"Python: 8 undefined variables"** — `ruff --select F821` reports **zero** undefined names across `server.py`, `travel_pricing.py`, `object_storage.py`, `templates/*`. Treat as a false positive unless specific lines are cited. (Three unused locals were cleaned up.)
- **`travel_pricing.py:52, 61, 134` "`is` for constants"** — all three are `is None` / `is not None`, which is the *correct* Python idiom. Ignored per `python.identity-comparison-none`.
- **localStorage in `chime.js`, `AddToHomeScreenPrompt.js`, `FilterContext.jsx`** — a mute flag, a "dismissed banner" flag and admin list filters. No credentials or PII. Ignored per `security.localstorage-ui-only-flags`.
- **Hook dependency lists** (PayBookingPage, usePriorityConfig, QuoteAnalyzingProgress, QuoteFlowModal, BookingModal auto-advance) — the "missing" deps are module-level constants (`API`, `INTERVAL_MS`, `STEP_IDS`), imported modules (`axios`) or React state setters, which are stable by definition. Ignored per `react.stale-closure-stable-setters`.
- **Index keys** in `ReviewsSection` star row / `TravelBreakdown` legs — fixed-length static repetition; made keys descriptive anyway.
- **Complexity / file-size refactors** (server.py functions, AdminDashboard, LandingPage, BookingModal, InvoicesModal) — acknowledged backlog; not done as part of a review pass because it carries regression risk without user-visible benefit. Do only with explicit user request and full test coverage.
