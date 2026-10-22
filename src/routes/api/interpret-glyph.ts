import { createFileRoute } from "@tanstack/react-router";
import { handleInterpretGlyph } from "@/lib/ai/interpret.server";

export const Route = createFileRoute("/api/interpret-glyph")({
  server: {
    handlers: {
      POST: ({ request }) => handleInterpretGlyph(request),
    },
  },
});
