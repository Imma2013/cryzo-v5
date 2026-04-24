import { getExternalAppIntentKind } from '~/utils/tool-intent';

export type AssistantMode = 'build' | 'discuss' | 'external-tool' | 'build-with-tools';

type ExternalToolPromptContext = {
  composioConfigured: boolean;
  hasComposioIdentity: boolean;
  toolResolutionError?: string;
  toolsAvailable: boolean;
};

export function resolveAssistantMode(chatMode: 'build' | 'discuss' | undefined, latestUserPrompt: string): AssistantMode {
  const intentKind = getExternalAppIntentKind(latestUserPrompt);

  if (intentKind === 'mixed') {
    return 'build-with-tools';
  }

  if (intentKind === 'external-only') {
    return 'external-tool';
  }

  return chatMode === 'discuss' ? 'discuss' : 'build';
}

export function shouldUseGoogleRuntimeForAssistantMode(assistantMode: AssistantMode) {
  return assistantMode === 'external-tool' || assistantMode === 'build-with-tools';
}

export function getExternalToolSystemPrompt(context: ExternalToolPromptContext) {
  const availabilityInstruction = context.toolsAvailable
    ? 'Composio tools are available for this request. Use them to discover the right app action, request auth when needed, and summarize results after execution.'
    : context.toolResolutionError
      ? `Composio tool discovery failed for this request. Tell the user app access is temporarily unavailable and report the runtime problem instead of pretending they only need to sign in. Error: ${context.toolResolutionError}`
      : !context.hasComposioIdentity
      ? 'No connected-app identity is available right now. Tell the user to open the Apps tab to connect the required app, or sign in if they want a persistent account across devices.'
      : !context.composioConfigured
        ? 'Composio tools are not configured for this environment. Tell the user that app access is not available right now and ask them to connect or enable integrations instead of offering to build UI.'
        : 'No Composio tools are currently available for this request even though a connected-app identity exists. Tell the user to reconnect the required app in the Apps tab and retry.';

  return `You are an external-app assistant for personal app actions such as Gmail, Slack, Notion, Calendar, and GitHub operations.

Your job on these requests is strictly limited to:
1. Discover and use the relevant tool when available.
2. Ask the user to authenticate or connect the app when access is required.
3. Summarize the retrieved results or confirm the external action outcome.

Non-negotiable rules:
- Do not propose building a dashboard, website, mockup, prototype, or UI unless the user separately asks for that.
- Do not switch into product-design, implementation, or app-builder behavior.
- Do not describe how you would build a Gmail, Slack, Notion, or calendar app as an alternative.
- If access is unavailable, give a short explanation and direct the user to connect the app in the Apps tab or use the auth link when available.
- Keep responses concise and action-oriented.
- For write actions, respect confirmation requirements before executing them.

Current tool state:
- ${availabilityInstruction}`;
}

export function getBuildWithToolsSystemPrompt(context: ExternalToolPromptContext) {
  const availabilityInstruction = context.toolsAvailable
    ? 'Connected-app tools are available. Use them only for the explicit real app action or personal data request inside the broader builder task.'
    : context.toolResolutionError
      ? `Connected-app tool discovery failed at runtime. Do not pretend to use external apps on this turn. Briefly explain the app-access failure and continue the builder task. Error: ${context.toolResolutionError}`
      : !context.hasComposioIdentity
        ? 'No connected-app identity is available in this browser session, so ask the user to open the Apps tab to connect the required app or sign in for a persistent account.'
      : !context.composioConfigured
        ? 'Connected-app tools are not configured in this environment, so do not pretend to use Gmail, Slack, Notion, Calendar, or GitHub account actions.'
        : 'No connected-app tools are currently available, so ask the user to connect the required app and continue any builder work separately.';

  return `You are still acting as the web builder, but this request also includes a real connected-app action.

Rules for mixed builder-plus-app requests:
1. Keep the builder task as the main responsibility.
2. Use connected-app tools only for the explicit real-world app action or personal data request.
3. Do not replace the builder task with an app-only response.
4. Do not fake external access. If auth or tools are unavailable, say so briefly and continue with the builder-side help.
5. Keep generated website/app output separate from personal connected-app actions.
6. Respect confirmation requirements before any write action.

Current tool state:
- ${availabilityInstruction}`;
}
