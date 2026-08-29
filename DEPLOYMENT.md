# Discovery Engine - Deployment & Testing Guide

This guide walks you through deploying the Discovery Engine to Supabase and verifying all components work end-to-end.

## Prerequisites Checklist

Before starting, you need:
- [ ] Node.js 18+ installed (`node --version`)
- [ ] A Supabase project created (free tier at https://supabase.com)
- [ ] Active API keys from all six providers (regenerated after pasting in chat):
  - [ ] Cerebras API key (https://api.cerebras.ai) — LLM primary
  - [ ] OpenRouter API key (https://openrouter.ai) — LLM fallback
  - [ ] Groq API key (https://console.groq.com) — LLM backup
  - [ ] Tavily API key (https://tavily.com) — Search primary
  - [ ] Exa API key (https://exa.ai) — Search fallback + originality
  - [ ] Firecrawl API key (https://firecrawl.dev) — Full-page content

⚠️ **CRITICAL**: These keys are being stored in Supabase secrets (not the JS bundle). Treat them as credentials—never share or commit them.

## Step 1: Set Up Local Environment

```bash
cd /workspaces/Original-v3

# Create .env.local with Supabase connection info
cat > .env.local << 'EOF'
# Frontend (public, safe)
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE

# Backend (private, secret)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY_HERE

# Provider API keys (will be set as Supabase secrets)
CEREBRAS_API_KEY=your-cerebras-key-here
OPENROUTER_API_KEY=your-openrouter-key-here
GROQ_API_KEY=your-groq-key-here
TAVILY_API_KEY=your-tavily-key-here
EXA_API_KEY=your-exa-key-here
FIRECRAWL_API_KEY=your-firecrawl-key-here
EOF
```

Get `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase dashboard:
Settings → API → Project URL and `anon` key

Get `SUPABASE_SERVICE_ROLE_KEY` from:
Settings → API → `service_role` key (secret, keep safe)

## Step 2: Link Supabase Project

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Link this workspace to your Supabase project
npx supabase link --project-ref your-project-ref

# Verify the link
npx supabase projects list
```

## Step 3: Deploy Database Schema

```bash
# Apply the initial schema migration
npx supabase migration up

# Verify tables were created in Supabase dashboard:
# SQL Editor → Look for: investigations, hypotheses, sources, evidence, critiques
```

Or manually run the migration in Supabase SQL Editor:
1. Go to your Supabase project dashboard
2. SQL Editor → New query
3. Paste contents of `supabase/migrations/001_initial_schema.sql`
4. Run

## Step 4: Deploy Edge Functions

Deploy all four functions:

```bash
# Deploy each function
npx supabase functions deploy search
npx supabase functions deploy llm
npx supabase functions deploy originality-gate
npx supabase functions deploy run-iteration

# Verify deployment
npx supabase functions list
```

You should see all four functions listed with status "Active".

## Step 5: Set Edge Function Secrets

Edge Functions read environment variables from **Supabase Secrets** (not .env).

```bash
# Set all six provider keys as secrets
npx supabase secrets set CEREBRAS_API_KEY=sk-xxxxx
npx supabase secrets set OPENROUTER_API_KEY=sk-xxxxx
npx supabase secrets set GROQ_API_KEY=gsk_xxxxx
npx supabase secrets set TAVILY_API_KEY=tvly-xxxxx
npx supabase secrets set EXA_API_KEY=xxxxx
npx supabase secrets set FIRECRAWL_API_KEY=fc-xxxxx

# Verify they're set
npx supabase secrets list
```

## Step 6: Run Locally

```bash
# Start dev server
npm run dev

# Output should show:
# VITE v5.x.x building for development...
# ➜  Local:   http://localhost:5173/
# ➜  press h to show help
```

Open http://localhost:5173 in your browser.

## Step 7: Test Authentication

1. Click "Sign in with GitHub"
2. Authorize the Supabase app
3. You should see the "Start a New Investigation" form

If auth fails, check:
- Supabase dashboard → Authentication → Providers → GitHub is enabled
- OAuth app is properly configured

## Step 8: Run a Test Investigation

1. Enter a research question, e.g.:
   ```
   What novel approaches could improve long-term memory retention in large language models?
   ```

2. Click "Start Investigation"

3. Watch the UI update:
   - Iteration count should increment (0 → 1 → 2...)
   - Hypotheses appear in "Activity Feed"
   - Overview Report shows statistics
   - Sources are displayed

## Step 9: Verify Provider Fallbacks

To test that fallbacks work, intentionally break the primary provider:

```bash
# 1. Corrupt the Tavily key temporarily
npx supabase secrets set TAVILY_API_KEY=broken-key

# 2. Run an iteration
# Watch the logs:
npx supabase functions logs search

# Should see:
# "Tavily failed: [error]"
# "Exa: [success]"

# 3. Restore the key
npx supabase secrets set TAVILY_API_KEY=<real-key>
```

Same test for LLM providers (break Cerebras first, should fall through to OpenRouter).

## Step 10: Verify Originality Gate

Check that at least one hypothesis is rejected as non-novel:

1. In "Activity Feed", look for hypotheses with status:
   - 🟢 "potentially novel" (shown)
   - 🟠 "insufficient evidence" (shown)
   - 🔴 "similar existing" (rejected, not shown)
   - 🔴 "clearly established" (rejected, not shown)

2. Check function logs for rejection evidence:
   ```bash
   npx supabase functions logs originality-gate
   npx supabase functions logs run-iteration
   ```

3. Look for lines like:
   ```
   Rejected hypothesis "X": similar_existing - Found related work: "Y"
   ```

## Step 11: Run 10+ Iterations

1. Let the investigation run for 2–3 minutes
2. Verify iteration count reaches ≥ 10
3. Verify Pause/Resume/Stop buttons work
4. Check that investigation data persists across page refresh

To manually trigger iterations faster:
```bash
# In another terminal
curl -X POST http://localhost:54321/functions/v1/run-iteration \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"investigationId":"YOUR_INVESTIGATION_ID"}'
```

## Troubleshooting

### "Auth provider not configured"
- Supabase dashboard → Authentication → Providers → GitHub
- Ensure OAuth app credentials are set
- Check redirect URL includes localhost:5173

### "All search providers failed"
- Verify all 3 keys are valid: `npx supabase secrets list`
- Check provider API dashboards for rate limits or quota exceeded
- Try a simpler search query

### "All LLM providers failed"
- Check model names haven't been deprecated (Cerebras/Groq change them mid-cycle)
- Verify keys have quota remaining
- Check Edge Function logs: `npx supabase functions logs llm`

### Investigation stuck at iteration 0
- Check `run-iteration` logs: `npx supabase functions logs run-iteration`
- Verify Edge Functions deployed: `npx supabase functions list`
- Check RLS policies aren't blocking inserts (unlikely, but possible if schema modified)

### UI not updating
- Check browser console for errors
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`
- Check Network tab in DevTools for 401/403 from Supabase

### "Edge Function timed out"
- Single iteration should complete in < 5 seconds
- If it's timing out, a provider call is hanging
- Check logs and verify API keys are correct

## Final Verification Checklist

Before calling this done:

✅ **Build & Deploy**
- [ ] `npm run build` succeeds with no errors
- [ ] All 4 Edge Functions deployed and "Active"
- [ ] Database schema applied (check SQL Editor)
- [ ] All 6 secrets set

✅ **UI & Auth**
- [ ] Can sign in with GitHub
- [ ] Investigation form renders correctly
- [ ] Can submit a research question

✅ **Research Loop**
- [ ] Investigation runs at least 10 iterations
- [ ] Iteration count increments after each cycle
- [ ] New hypotheses appear in Activity Feed
- [ ] Sources appear with titles and URLs

✅ **Provider Fallbacks**
- [ ] At least one primary provider failure triggers fallback
- [ ] Fallback provider succeeds and continues loop
- [ ] Logs show fallback activation

✅ **Originality Gate**
- [ ] At least one hypothesis rejected as non-novel
- [ ] Logs show rejection reason and prior art found
- [ ] Only "potentially_novel" and "insufficient_evidence" shown to user

✅ **UI Interactions**
- [ ] Pause button halts iterations
- [ ] Resume button restarts loop
- [ ] Stop button finalizes investigation
- [ ] Overview Report shows correct stats
- [ ] Can refresh page and data persists

## Next: Production Deployment

Once you've verified locally, to deploy to production:

1. Push code to GitHub (already done: `git push origin main`)
2. Create pull request if using review process
3. Deploy to Vercel, Netlify, or similar for frontend hosting
4. Supabase functions stay in Supabase (no redeployment needed)
5. Set up environment variables on your hosting platform
6. Configure custom domain (optional)

## Support

For issues:
1. Check Edge Function logs: `npx supabase functions logs <function-name>`
2. Check browser DevTools Console and Network tabs
3. Review Supabase documentation: https://supabase.com/docs
4. Check provider API dashboards for status/rate limits
