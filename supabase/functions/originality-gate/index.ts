import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface OriginalityCheckRequest {
  hypothesis: string;
  context?: string;
}

interface OriginalityCheckResult {
  noveltyStatus:
    | "clearly_established"
    | "similar_existing"
    | "modified_version"
    | "potentially_novel"
    | "insufficient_evidence";
  confidence: number;
  evidence: string;
}

// Tavily search for prior art
async function searchTavilyForPriorArt(query: string): Promise<any> {
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

  return response.json();
}

// Exa search for prior art (fallback)
async function searchExaForPriorArt(query: string): Promise<any> {
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

  return response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { hypothesis, context }: OriginalityCheckRequest = await req.json();

    if (!hypothesis) {
      return new Response(JSON.stringify({ error: "Hypothesis required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Search for prior art using both Tavily and Exa
    let searchResults = [];
    let error = null;

    try {
      const data = await searchTavilyForPriorArt(hypothesis);
      searchResults = data.results || [];
    } catch (e) {
      console.error("Tavily search failed:", e);
      error = e;

      try {
        const data = await searchExaForPriorArt(hypothesis);
        searchResults = data.results || [];
      } catch (e2) {
        console.error("Exa search failed:", e2);
        error = e2;
      }
    }

    // If no results found, it's potentially novel
    if (!searchResults || searchResults.length === 0) {
      const result: OriginalityCheckResult = {
        noveltyStatus: "insufficient_evidence",
        confidence: 35,
        evidence: "No prior art found in search results.",
      };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Analyze search results for similarity
    const firstResultTitle = searchResults[0]?.title || "";
    const firstResultSnippet = searchResults[0]?.snippet || "";

    const similarity = calculateSimilarity(hypothesis, firstResultTitle + " " + firstResultSnippet);

    let noveltyStatus: OriginalityCheckResult["noveltyStatus"];
    let confidence: number;
    let evidence: string;

    if (similarity > 0.85) {
      // Very similar to existing work
      noveltyStatus = "clearly_established";
      confidence = 90;
      evidence = `Found very similar work: "${firstResultTitle}"`;
    } else if (similarity > 0.65) {
      // Similar existing work
      noveltyStatus = "similar_existing";
      confidence = 80;
      evidence = `Found related work: "${firstResultTitle}"`;
    } else if (similarity > 0.45) {
      // Modified version of existing work
      noveltyStatus = "modified_version";
      confidence = 70;
      evidence = `Found somewhat related work: "${firstResultTitle}"`;
    } else {
      // Potentially novel
      noveltyStatus = "potentially_novel";
      confidence = 50;
      evidence = `Found tangentially related work: "${firstResultTitle}"`;
    }

    const result: OriginalityCheckResult = {
      noveltyStatus,
      confidence,
      evidence,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Simple similarity score based on word overlap
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(
    text1
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );
  const words2 = new Set(
    text2
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter((w) => words2.has(w));
  const union = new Set([...words1, ...words2]);

  return intersection.length / union.size;
}
