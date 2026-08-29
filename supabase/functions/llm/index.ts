import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}

interface LLMResponse {
  text: string;
  provider: string;
}

// Cerebras API call
async function callCerebras(systemPrompt: string, userPrompt: string, temperature: number = 0.7): Promise<LLMResponse> {
  const apiKey = Deno.env.get("CEREBRAS_API_KEY");
  if (!apiKey) throw new Error("CEREBRAS_API_KEY not configured");

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-70b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    if (error.error?.code === "model_not_found") {
      throw new Error("Cerebras model deprecated, trying next provider");
    }
    throw new Error(`Cerebras error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    provider: "cerebras",
  };
}

// OpenRouter API call (fallback)
async function callOpenRouter(systemPrompt: string, userPrompt: string, temperature: number = 0.7): Promise<LLMResponse> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.1-70b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    provider: "openrouter",
  };
}

// Groq API call (backup)
async function callGroq(systemPrompt: string, userPrompt: string, temperature: number = 0.7): Promise<LLMResponse> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mixtral-8x7b-32768",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    if (error.error?.code === "model_not_found") {
      throw new Error("Groq model deprecated");
    }
    throw new Error(`Groq error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    provider: "groq",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt, systemPrompt, temperature }: LLMRequest = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = systemPrompt || "You are a research assistant helping generate novel hypotheses.";
    const temp = temperature ?? 0.7;

    let result: LLMResponse | null = null;
    let lastError = null;

    // Try Cerebras first
    try {
      result = await callCerebras(system, prompt, temp);
    } catch (e) {
      console.error("Cerebras failed:", e);
      lastError = e;

      // Fall back to OpenRouter
      try {
        result = await callOpenRouter(system, prompt, temp);
      } catch (e2) {
        console.error("OpenRouter failed:", e2);
        lastError = e2;

        // Fall back to Groq
        try {
          result = await callGroq(system, prompt, temp);
        } catch (e3) {
          console.error("Groq failed:", e3);
          lastError = e3;
        }
      }
    }

    if (!result) {
      return new Response(
        JSON.stringify({
          error: "All LLM providers failed",
          details: lastError?.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
