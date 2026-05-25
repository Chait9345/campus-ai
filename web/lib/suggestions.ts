/**
 * Client-side follow-up chips after an assistant reply (no API change).
 */
export function generateFollowUpSuggestions(
  assistantContent: string,
  lastUserMessage?: string
): string[] {
  const a = assistantContent.toLowerCase();
  const u = (lastUserMessage ?? "").toLowerCase();
  const pool: string[] = [];

  if (/package|lpa|salary|branch|cse|ece|it\b|placement/.test(a + u)) {
    pool.push("Show branch-wise comparison", "Compare CSE vs IT packages", "Placement trends this year?");
  }
  if (/company|recruiter|hire|intern/.test(a + u)) {
    pool.push("Top recruiters?", "Internship opportunities?", "Which companies visit campus?");
  }
  if (/interview|prep|question/.test(a + u)) {
    pool.push("Start interview practice", "Common HR questions?", "Technical interview tips?");
  }
  if (/average|stat|trend|graph|chart/.test(a + u)) {
    pool.push("Show stats as a chart", "Break down by branch", "Year-over-year comparison?");
  }

  const defaults = [
    "Show branch-wise comparison",
    "Top recruiters?",
    "Placement trends?",
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...pool, ...defaults]) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}
