const EXTERNAL_APP_PATTERNS = [
  /\bcomposio\b/i,
  /\b(gmail|gmails|email|emails|inbox|slack|notion|calendar|github issue|github repo)\b/i,
  /\b(check|read|summari[sz]e|show|open|use|access|connect|sync|fetch|review)\b[\s\S]{0,120}\b(gmail|gmails|email|emails|inbox|slack|notion|calendar|github)\b/i,
  /\bwhat(?:'s| is)\b[\s\S]{0,80}\b(my\s+)?(calendar|gmail|gmails|email|emails|inbox|slack|notion)\b/i,
  /\bcreate\b[\s\S]{0,60}\bgithub issue\b/i,
  /\bstar\b[\s\S]{0,80}\brepo\b[\s\S]{0,40}\bgithub\b/i,
  /\b(new(est)?|latest|recent)\b[\s\S]{0,40}\b(gmail|gmails|email|emails|message|messages)\b/i,
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
  return /\b(connect|use|sync|fetch|pull|read|summari[sz]e|check|access|review|auth(?:enticate)?|log\s*in)\b/i.test(
    input,
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
