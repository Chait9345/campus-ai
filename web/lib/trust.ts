export type TrustConfidence = "high" | "medium" | "low";
export type TrustSource = "campus" | "general" | "hybrid";

export interface ParsedTrust {
  confidence: TrustConfidence;
  source: TrustSource;
  sourceLabel: string;
  cleanedContent: string;
}

/** Infer trust from assistant message prefixes (no API schema change). */
export function parseAssistantTrust(raw: string): ParsedTrust {
  let content = raw;
  const hybrid =
    /^Based on campus data and general knowledge:/i.test(content) ||
    /^Based on campus data and general knowledge\s*\n/i.test(content);

  const campus = /^From campus data:|^Campus Data:/i.test(content);
  const general = /^General knowledge[^:]*:|^General Knowledge:/i.test(content);

  content = content.replace(/^From campus data:\s*|^Campus Data:\s*/i, "");
  content = content.replace(/^General knowledge[^:]*:\s*|^General Knowledge:\s*/i, "");
  content = content.replace(/^Based on campus data and general knowledge:\s*/i, "");
  content = content.replace(/\n\nCitation:\s*[^\n]+$/i, "").trim();

  if (hybrid) {
    return {
      confidence: "medium",
      source: "hybrid",
      sourceLabel: "Campus + General",
      cleanedContent: content,
    };
  }
  if (campus) {
    return {
      confidence: "high",
      source: "campus",
      sourceLabel: "Campus Data",
      cleanedContent: content,
    };
  }
  if (general) {
    return {
      confidence: "low",
      source: "general",
      sourceLabel: "General AI",
      cleanedContent: content,
    };
  }

  return {
    confidence: "medium",
    source: "general",
    sourceLabel: "Assistant",
    cleanedContent: raw,
  };
}
