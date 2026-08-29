# Discovery Engine — Project Instructions

## What this is
An AI-powered research and hypothesis-generation app. A user submits a question;
the app searches the web across multiple providers, generates hypotheses, checks
them for originality against prior art, critiques them adversarially, and keeps
iterating — indefinitely, not to a fixed step count — until the user stops it.

## Stack
- Frontend: React + TypeScript + Vite
- Backend/data: Supabase — Postgres, Auth, Storage, Row Level Security
- Secret-holding logic (anything calling a provider API key): Supabase Edge
  Functions only. Never call a provider directly from frontend code — the key
  would ship in the JS bundle and be visible in DevTools.

## Providers (fallback chains — never fail a step because ONE provider is down)
LLM: Cerebras (primary) → OpenRouter → Groq (backup)
Search: Tavily (primary) → Exa (fallback, also used for originality checks) → Firecrawl (full-page content)

Env vars, unprefixed (never `VITE_` — that exposes them to the browser):
GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY, TAVILY_API_KEY, EXA_API_KEY, FIRECRAWL_API_KEY

Cerebras and Groq have both deprecated model names mid-cycle in 2026. If a
provider call 404s on `model_not_found`, don't guess a replacement — check that
provider's current model list and update the constant, then note the change.

## Non-negotiable behavior
- The research loop never stops on its own. No fixed iteration cap. It runs
  until the user presses Stop.
- Supabase Edge Functions are killed by the platform after a wall-clock limit
  (roughly 150–400s) no matter what the code says. DO NOT implement the loop as
  one function with an internal `while(true)`. Each invocation does exactly ONE
  iteration and returns in a few seconds; something outside the function
  triggers the next one — a client-side interval while the tab is open, or a
  `pg_cron` job for it to keep running even when nobody has the page open.
  State (iteration_count, all findings) is checkpointed to the DB at the end of
  every single invocation, never held in memory across calls.
- Every hypothesis passes an originality gate before it's shown: search its
  core premise via Exa and Tavily for prior art, classify as clearly established
  / similar existing work found / modified version / potentially novel /
  insufficient evidence to determine novelty. Only the last two get shown.
  Rejects are logged with what they overlapped with and replaced automatically
  in the same iteration. Never claim confirmed novelty — only "nothing found yet."
- If one provider hits its rate/token limit, fall back to the next configured
  one rather than stopping. The only ceiling is each provider's own free-tier
  limit — there's no artificial cap in this app's own code.

## Database schema (Supabase, RLS required on every table)
```
investigations (id, user_id, question, status, iteration_count, created_at)
sources         (id, investigation_id, title, url, excerpt, provider, retrieved_at)
evidence        (id, investigation_id, claim, source_id, evidence_type, confidence)
hypotheses      (id, investigation_id, name, hypothesis, novelty_status, confidence, superseded_by)
critiques       (id, hypothesis_id, critique_text, weakened boolean, created_at)
```

Real ownership predicates only — `using (auth.uid() = user_id)`, never `using (true)`.

## How to build
Build and verify the essentials phase completely before adding anything else:
Supabase connected with RLS → search Edge Function with fallback → LLM Edge
Function with fallback → the originality-gate function as its own callable step
→ investigation form with Start/Pause/Stop → the tick-based loop wired end-to-end
→ live activity feed and an Overview report. Confirm a real investigation runs
for at least 10-15 iterations, actually falls back when a provider errors, and
actually rejects at least one non-novel hypothesis before calling it done.
