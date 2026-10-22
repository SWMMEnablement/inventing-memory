import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

type InterpretRequest = {
  label: string;
  rows: string[]; // ASCII art, top row first, "#" = inside the conduit
  nearestShape: string;
  hammingDist: number;
  gridSize: number;
  drift: number;
};

const INSTRUCTIONS = [
  "You are annotating hallucinated conduit cross-sections invented by a decaying Hopfield memory network",
  "that was originally taught the standard SWMM5 hydraulic cross-section shapes.",
  "Given the ASCII rendering of one invented shape, write 2-3 short plain-language sentences:",
  "what the shape resembles, how far it has drifted from the stored cross-sections,",
  "and whether it would behave hydraulically like any real conduit.",
  "Be concrete and specific about the geometry you see. No jargon, no headers, no lists, no markdown.",
].join(" ");

function safeMessage(err: unknown): { status: number; message: string } {
  const anyErr = err as { status?: number; statusCode?: number; message?: string } | null;
  const status =
    typeof anyErr?.status === "number"
      ? anyErr.status
      : typeof anyErr?.statusCode === "number"
        ? anyErr.statusCode
        : 500;
  const message =
    typeof anyErr?.message === "string" && anyErr.message.length > 0 && anyErr.message.length < 400
      ? anyErr.message
      : "The AI annotation request failed.";
  return { status, message };
}

export async function handleInterpretGlyph(request: Request): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return Response.json({ error: "AI is not configured for this app yet." }, { status: 500 });
  }

  let body: InterpretRequest;
  try {
    body = (await request.json()) as InterpretRequest;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || !Array.isArray(body.rows) || body.rows.length === 0) {
    return Response.json({ error: "Missing glyph rows." }, { status: 400 });
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const userPrompt = [
    `Invented cross-section "${body.label}" (${body.gridSize}x${body.gridSize} grid, # = inside the conduit, . = wall/outside, top row is the crown):`,
    "",
    ...body.rows,
    "",
    `Nearest stored SWMM5 cross-section: ${body.nearestShape} (Hamming distance ${body.hammingDist} of ${body.gridSize * body.gridSize} cells).`,
    `Network weight drift so far: ${body.drift.toFixed(4)}.`,
  ].join("\n");

  const messages: ModelMessage[] = [{ role: "user", content: userPrompt }];

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      instructions: INSTRUCTIONS,
      messages,
      abortSignal: request.signal,
      maxRetries: 0,
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const stream = result.textStream.pipeThrough(new TextEncoderStream());
    const response = new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
    return await withLovableAiGatewayRunIdHeader(response, runIdFetch);
  } catch (err) {
    const { status, message } = safeMessage(err);
    return Response.json({ error: message }, { status });
  }
}
