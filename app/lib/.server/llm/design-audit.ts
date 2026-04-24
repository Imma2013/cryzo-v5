import { stripIndents } from '~/utils/stripIndent';

export interface BuildDesignAuditInput {
  generatedText: string;
  compiledReferenceBrief: string;
  primarySlug: string;
  userPrompt: string;
}

export interface ParsedBuildDesignAudit {
  verdict: 'pass' | 'retry';
  score: number;
  reasons: string[];
  critique: string[];
}

export function buildDesignAuditSystemPrompt() {
  return stripIndents`
    You audit the visual fidelity of generated website build responses.
    Your only job is to decide whether the draft is strong enough to return or should be retried once.

    Rules:
    - Judge reference fidelity, not general niceness.
    - Fail drafts that drift into generic startup, SaaS, hero/features/footer, or polished-but-weak layouts when the selected reference is more specific.
    - Fail drafts that ignore the selected reference's typography behavior, palette dominance, imagery treatment, or section rhythm.
    - Pass drafts only when they feel recognizably native to the selected reference family.
    - Return JSON only. No markdown. No prose outside JSON.

    Required JSON shape:
    {"verdict":"pass"|"retry","score":0-100,"reasons":["..."],"critique":["..."]}
  `;
}

export function buildDesignAuditUserPrompt(input: BuildDesignAuditInput) {
  return stripIndents`
    USER PROMPT:
    ${input.userPrompt}

    SELECTED PRIMARY REFERENCE:
    ${input.primarySlug}

    COMPILED DESIGN EXECUTION BRIEF:
    ${input.compiledReferenceBrief}

    GENERATED DRAFT:
    ${input.generatedText}
  `;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1]?.trim() || trimmed;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return source.slice(start, end + 1);
}

export function parseBuildDesignAudit(text: string): ParsedBuildDesignAudit | null {
  const jsonText = extractJsonObject(text);

  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<ParsedBuildDesignAudit>;
    const verdict = parsed.verdict === 'retry' ? 'retry' : parsed.verdict === 'pass' ? 'pass' : null;

    if (!verdict) {
      return null;
    }

    return {
      verdict,
      score: typeof parsed.score === 'number' ? parsed.score : verdict === 'pass' ? 100 : 0,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.filter((entry): entry is string => typeof entry === 'string') : [],
      critique: Array.isArray(parsed.critique)
        ? parsed.critique.filter((entry): entry is string => typeof entry === 'string')
        : [],
    };
  } catch {
    return null;
  }
}
