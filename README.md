# Discovery Engine

An AI-powered research and hypothesis-generation app. Submit a question, and the app searches the web across multiple providers, generates novel hypotheses, checks them for originality against prior art, critiques them adversarially, and keeps iterating — indefinitely until you stop it.

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Supabase (Postgres, Auth, Storage, Row Level Security)
- **Edge Functions**: Deno-based serverless functions for API integrations
- **Provider Fallbacks**: 
  - LLM: Cerebras → OpenRouter → Groq
  - Search: Tavily → Exa → Firecrawl

## Setup

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works)
- API keys for:
  - CEREBRAS_API_KEY (LLM)
  - OPENROUTER_API_KEY (LLM fallback)
  - GROQ_API_KEY (LLM backup)
  - TAVILY_API_KEY (Search)
  - EXA_API_KEY (Search fallback)
  - FIRECRAWL_API_KEY (Full-page content)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Supabase

```bash
# Create a new Supabase project at https://supabase.com
# Then link it to this workspace:
npx supabase link --project-ref YOUR_PROJECT_REF

# Create .env.local with your Supabase credentials:
cat > .env.local << EOF
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

CEREBRAS_API_KEY=your-cerebras-key
OPENROUTER_API_KEY=your-openrouter-key
GROQ_API_KEY=your-groq-key
TAVILY_API_KEY=your-tavily-key
EXA_API_KEY=your-exa-key
FIRECRAWL_API_KEY=your-firecrawl-key
EOF
```

### 3. Deploy Database Schema
```bash
# Apply the migration
npx supabase migration up
```

Or manually in the Supabase dashboard SQL editor, run:
```sql
-- See supabase/migrations/001_initial_schema.sql
```

### 4. Deploy Edge Functions
```bash
# Deploy all functions
npx supabase functions deploy search
npx supabase functions deploy llm
npx supabase functions deploy originality-gate
npx supabase functions deploy run-iteration

# Set secrets for the functions
npx supabase secrets set CEREBRAS_API_KEY=your-key
npx supabase secrets set OPENROUTER_API_KEY=your-key
npx supabase secrets set GROQ_API_KEY=your-key
npx supabase secrets set TAVILY_API_KEY=your-key
npx supabase secrets set EXA_API_KEY=your-key
npx supabase secrets set FIRECRAWL_API_KEY=your-key
```

### 5. Run Locally
```bash
npm run dev
```

Then:
1. Open http://localhost:5173
2. Sign in with GitHub or email
3. Enter a research question
4. Watch as the engine searches, generates, and critiques hypotheses

## How It Works

### Research Loop (one iteration per call)
1. **Search** - Queries web providers (Tavily → Exa → Firecrawl) for sources
2. **Generate** - LLM generates 3 hypotheses from search results
3. **Gate** - Each hypothesis passes originality check (Exa/Tavily prior art search)
   - Only "potentially_novel" or "insufficient_evidence" are shown
   - Others logged with overlapping work
4. **Critique** - Adversarial critique generated for accepted hypotheses
5. **Checkpoint** - State saved to DB; iteration count incremented

**Key**: Each function invocation does ONE iteration and returns in seconds. A client-side interval (or `pg_cron` for background runs) triggers the next tick.

### Non-Negotiable Behavior
- Loop never stops on its own—runs until you press Stop
- State is checkpointed after every iteration (never held in memory)
- Originality gate runs before any hypothesis is shown
- Provider fallbacks activate automatically on failure
- Confirmed 10+ iterations, fallback testing, and 1+ non-novel hypothesis rejection before ship

## Testing

To verify the build works end-to-end:

```bash
# Run dev server
npm run dev

# In another terminal, you can test Edge Functions locally:
npx supabase functions serve

# Test a search call:
curl -X POST http://localhost:54321/functions/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "novel AI techniques"}'
```

## Project Structure

```
.
├── src/
│   ├── components/           # React components
│   │   ├── InvestigationForm.tsx
│   │   ├── ActivityFeed.tsx
│   │   └── OverviewReport.tsx
│   ├── lib/
│   │   └── supabase.ts       # Supabase client
│   ├── types/
│   │   └── index.ts          # TypeScript types
│   ├── App.tsx               # Main app
│   └── main.tsx              # Entry point
├── supabase/
│   ├── functions/            # Edge Functions
│   │   ├── search/
│   │   ├── llm/
│   │   ├── originality-gate/
│   │   └── run-iteration/
│   └── migrations/           # Database migrations
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Troubleshooting

### "All search providers failed"
- Check TAVILY_API_KEY and EXA_API_KEY in secrets
- Verify API keys are valid and have quota

### "All LLM providers failed"
- Check all three LLM keys (Cerebras, OpenRouter, Groq)
- Verify keys haven't hit rate limits
- Check model names haven't been deprecated

### Investigation stuck at iteration 0
- Verify Edge Functions deployed: `npx supabase functions list`
- Check function logs: `npx supabase functions logs run-iteration`
- Ensure RLS policies aren't blocking writes

### "No search results"
- Question may be too vague—try more specific queries
- Check provider API status pages

## Notes

- Research continues indefinitely until user stops (no fixed cap)
- Supabase Edge Functions have ~150–400s wall-clock limit; this is why we split into single-iteration calls
- Row-level security required on all tables; never use `using (true)`
- Rejected hypotheses are logged with their overlapping prior art, then replaced automatically