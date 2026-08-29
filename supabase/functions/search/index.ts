import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface SearchRequest {
  query: string;
  includeFull?: boolean;
}

interface SearchResult {
  title: string;
  url: string;
  excerpt: string;
  provider: string;
}

// Tavily search function
async function searchTavily(query: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured");

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5,
      include_answer: true,
    }),
  });

  const data = await response.json();
  return data.results.map((result: any) => ({
    title: result.title,
    url: result.url,
    excerpt: result.snippet || "",
    provider: "tavily",
  }));
}

// Exa search function (fallback)
async function searchExa(query: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get("EXA_API_KEY");
  if (!apiKey) throw new Error("EXA_API_KEY not configured");

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: 5,
      useAutoprompt: true,
      type: "neural",
    }),
  });

  const data = await response.json();
  return data.results.map((result: any) => ({
    title: result.title,
    url: result.url,
    excerpt: result.text || "",
    provider: "exa",
  }));
}

// Firecrawl for full page content (when needed)
async function firecrawlContent(url: string): Promise<string> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  const response = await fetch("https://api.firecrawl.dev/v0/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      pageOptions: {
        onlyMainContent: true,
      },
    }),
  });

  const data = await response.json();
  return data.data?.markdown || data.data?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query, includeFull }: SearchRequest = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: "Query required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let results: SearchResult[] = [];
    let error = null;

    // Try Tavily first
    try {
      results = await searchTavily(query);
    } catch (e) {
      console.error("Tavily failed:", e);
      error = e;

      // Fall back to Exa
      try {
        results = await searchExa(query);
      } catch (e2) {
        console.error("Exa failed:", e2);
        error = e2;
        // If both fail, return error
        return new Response(
          JSON.stringify({
            error: "All search providers failed",
            details: error.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // If includeFull is true, get full content for each result using Firecrawl
    if (includeFull && results.length > 0) {
      try {
        const fullContent = await firecrawlContent(results[0].url);
        results[0].excerpt = fullContent.substring(0, 2000); // Limit to 2000 chars
      } catch (e) {
        console.error("Firecrawl failed:", e);
        // Continue with existing excerpt, don't fail
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
