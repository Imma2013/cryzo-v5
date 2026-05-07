const CONNECTED_APP_NAMES =
  'gmail|gmails|email|emails|inbox|slack|notion|calendar|github|linear|jira|google\\s+drive|drive|docs|sheets|vercel|supabase';

const EXTERNAL_APP_PATTERNS = [
  /\bcomposio\b/i,
  new RegExp(`\\b(${CONNECTED_APP_NAMES}|github issue|github repo)\\b`, 'i'),
  new RegExp(
    `\\b(check|read|summari[sz]e|show|open|use|access|connect|sync|fetch|review|list|get|create|update|deploy|redeploy|trigger|push)\\b[\\s\\S]{0,120}\\b(${CONNECTED_APP_NAMES})\\b`,
    'i',
  ),
  /\bwhat(?:'s| is)\b[\s\S]{0,80}\b(my\s+)?(calendar|gmail|gmails|email|emails|inbox|slack|notion|linear|jira|vercel|supabase)\b/i,
  /\bcreate\b[\s\S]{0,60}\bgithub issue\b/i,
  /\bstar\b[\s\S]{0,80}\brepo\b[\s\S]{0,40}\bgithub\b/i,
  /\b(new(est)?|latest|recent)\b[\s\S]{0,40}\b(gmail|gmails|email|emails|message|messages)\b/i,
  /\b(deploy|redeploy|deployment|env|environment variable|project|logs?)\b[\s\S]{0,120}\bvercel\b/i,
  /\b(database|table|row|auth|edge function|storage|project)\b[\s\S]{0,120}\bsupabase\b/i,
];

const BUILD_UI_PATTERNS = [
  /\b(build|create|design|generate|make)\b[\s\S]{0,120}\b(ui|dashboard|landing page|website|app|component|layout)\b/i,
  /\binspired by\b/i,
  /\bhero section\b/i,
  /\bfigma\b/i,
];

export type ExternalAppIntentKind = 'none' | 'external-only' | 'mixed';

function hasExternalAppSignal(input: string) {
  return EXTERNAL_APP_PATTERNS.some((pattern) => pattern.test(input));
}

function hasBuildUiSignal(input: string) {
  return BUILD_UI_PATTERNS.some((pattern) => pattern.test(input));
}

function hasPersonalDataSignal(input: string) {
  return /\b(my|today|this week|recent|latest)\b/i.test(input);
}

function hasExplicitAppActionSignal(input: string) {
  return (
    /\b(connect|use|sync|fetch|pull|push|read|summari[sz]e|check|access|review|authenticate|log\s*in|deploy|redeploy|trigger|list|get|update)\b/i.test(
      input,
    ) || /\bcreate\b[\s\S]{0,60}\bgithub issue\b/i.test(input)
  );
}

export function getExternalAppIntentKind(input: string): ExternalAppIntentKind {
  const normalized = input.trim();

  if (!normalized) {
    return 'none';
  }

  const externalSignal = hasExternalAppSignal(normalized);
  const buildSignal = hasBuildUiSignal(normalized);
  const personalSignal = hasPersonalDataSignal(normalized);
  const explicitAppActionSignal = hasExplicitAppActionSignal(normalized);

  if (/\bcomposio\b/i.test(normalized)) {
    return buildSignal ? 'mixed' : 'external-only';
  }

  if (externalSignal && buildSignal && (personalSignal || explicitAppActionSignal)) {
    return 'mixed';
  }

  if (externalSignal && personalSignal) {
    return 'external-only';
  }

  if (externalSignal && !buildSignal) {
    return 'external-only';
  }

  return 'none';
}

export function isExternalAppToolIntent(input: string) {
  return getExternalAppIntentKind(input) !== 'none';
}

export function isMixedExternalAppToolIntent(input: string) {
  return getExternalAppIntentKind(input) === 'mixed';
}
