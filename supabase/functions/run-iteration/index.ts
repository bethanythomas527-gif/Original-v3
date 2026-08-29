import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface RunIterationRequest {
  investigationId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { investigationId }: RunIterationRequest = await req.json();

    if (!investigationId) {
      return new Response(JSON.stringify({ error: "Investigation ID required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch investigation
    const { data: investigation, error: invError } = await supabase
      .from("investigations")
      .select("*")
      .eq("id", investigationId)
      .single();

    if (invError || !investigation) {
      throw new Error("Investigation not found");
    }

    if (investigation.status !== "running") {
      return new Response(
        JSON.stringify({ message: "Investigation not running" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 1: Search for sources
    console.log("Running iteration", investigation.iteration_count + 1);
    const searchQuery = investigation.question;

    const searchRes = await fetch(
      `${supabaseUrl}/functions/v1/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      }
    );

    const searchData = await searchRes.json();

    if (!searchData.results || searchData.results.length === 0) {
      console.warn("No search results found");
      return new Response(
        JSON.stringify({ error: "No search results" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Store sources
    const sources = [];
    for (const result of searchData.results.slice(0, 3)) {
      const { data: source } = await supabase
        .from("sources")
        .insert({
          investigation_id: investigationId,
          title: result.title,
          url: result.url,
          excerpt: result.excerpt,
          provider: result.provider,
        })
        .select()
        .single();
      if (source) sources.push(source);
    }

    // Step 2: Generate hypotheses using LLM
    const sourceSummary = searchData.results
      .map((r: any) => `${r.title}: ${r.excerpt}`)
      .join("\n\n");

    const hypothesisPrompt = `Based on these research findings about "${investigation.question}":

${sourceSummary}

Generate 3 novel, specific hypotheses that:
1. Are grounded in the research but extend it in new directions
2. Are testable and falsifiable
3. Address gaps not covered by the existing sources

Format each hypothesis as JSON:
[
  {
    "name": "Hypothesis Name",
    "hypothesis": "Detailed hypothesis description",
    "confidence": 75
  },
  ...
]`;

    const llmRes = await fetch(
      `${supabaseUrl}/functions/v1/llm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: hypothesisPrompt,
          systemPrompt: "You are a research expert generating novel hypotheses.",
          temperature: 0.8,
        }),
      }
    );

    const llmData = await llmRes.json();

    if (!llmData.text) {
      throw new Error("Failed to generate hypotheses");
    }

    let hypotheses = [];
    try {
      // Extract JSON from the response
      const jsonMatch = llmData.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        hypotheses = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse hypotheses:", e);
      // Create a fallback hypothesis
      hypotheses = [
        {
          name: "Research Continuation Hypothesis",
          hypothesis: `Based on the question "${investigation.question}" and available research, further investigation could reveal novel patterns.`,
          confidence: 50,
        },
      ];
    }

    // Step 3: Check originality of each hypothesis
    const acceptedHypotheses = [];
    for (const hyp of hypotheses) {
      const originalityRes = await fetch(
        `${supabaseUrl}/functions/v1/originality-gate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hypothesis: hyp.hypothesis,
            context: investigation.question,
          }),
        }
      );

      const originalityData = await originalityRes.json();
      const noveltyStatus = originalityData.noveltyStatus || "insufficient_evidence";

      // Only accept potentially novel or insufficient evidence hypotheses
      if (
        noveltyStatus === "potentially_novel" ||
        noveltyStatus === "insufficient_evidence"
      ) {
        const { data: savedHyp } = await supabase
          .from("hypotheses")
          .insert({
            investigation_id: investigationId,
            name: hyp.name,
            hypothesis: hyp.hypothesis,
            novelty_status: noveltyStatus,
            confidence: hyp.confidence || 50,
            iteration_created: investigation.iteration_count + 1,
          })
          .select()
          .single();

        if (savedHyp) {
          acceptedHypotheses.push(savedHyp);

          // Step 4: Generate adversarial critique
          const critiquePrompt = `Provide a 1-2 sentence critical evaluation of this hypothesis, highlighting potential weaknesses or challenges:

Hypothesis: ${hyp.hypothesis}

Research context: ${investigation.question}`;

          const critiqueRes = await fetch(
            `${supabaseUrl}/functions/v1/llm`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: critiquePrompt,
                systemPrompt:
                  "You are a critical research evaluator. Identify genuine weaknesses and limitations.",
                temperature: 0.6,
              }),
            }
          );

          const critiqueData = await critiqueRes.json();

          if (critiqueData.text) {
            // Check if critique significantly weakens the hypothesis (contains phrases indicating serious flaws)
            const weakenesPhrases = [
              "cannot",
              "unfounded",
              "lacks",
              "insufficient",
              "contradicts",
              "implausible",
              "failed",
            ];
            const isWeakened = weakenesPhrases.some((phrase) =>
              critiqueData.text.toLowerCase().includes(phrase)
            );

            await supabase.from("critiques").insert({
              hypothesis_id: savedHyp.id,
              critique_text: critiqueData.text,
              weakened: isWeakened,
            });
          }
        }
      } else {
        // Rejected hypothesis - log evidence
        console.log(
          `Rejected hypothesis "${hyp.name}": ${noveltyStatus} - ${originalityData.evidence}`
        );
      }
    }

    // Step 5: Checkpoint state - increment iteration count
    const newIteration = investigation.iteration_count + 1;
    const { data: updatedInvestigation } = await supabase
      .from("investigations")
      .update({
        iteration_count: newIteration,
        updated_at: new Date().toISOString(),
      })
      .eq("id", investigationId)
      .select()
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        iteration: newIteration,
        hypothesesAccepted: acceptedHypotheses.length,
        sourcesFound: sources.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in run-iteration:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
