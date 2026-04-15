const fs = require('node:fs');
const path = require('node:path');

const targets = [
  path.join(__dirname, '..', 'node_modules', '@ai-sdk', 'google', 'dist', 'index.js'),
  path.join(__dirname, '..', 'node_modules', '@ai-sdk', 'google', 'dist', 'index.mjs'),
];

const patches = [
  {
    name: 'assistant tool-call thoughtSignature replay',
    find: `              case "tool-call": {
                return {
                  functionCall: {
                    name: part.toolName,
                    args: part.args
                  }
                };
              }`,
    replace: `              case "tool-call": {
                const thoughtSignature = part.providerMetadata?.google?.thoughtSignature ?? part.experimental_providerMetadata?.google?.thoughtSignature;
                return {
                  functionCall: {
                    name: part.toolName,
                    args: part.args
                  },
                  ...(thoughtSignature ? { thoughtSignature } : {})
                };
              }`,
  },
  {
    name: 'tool-call thoughtSignature extraction',
    find: `  return functionCallParts == null || functionCallParts.length === 0 ? void 0 : functionCallParts.map((part) => ({
    toolCallType: "function",
    toolCallId: generateId2(),
    toolName: part.functionCall.name,
    args: JSON.stringify(part.functionCall.args)
  }));`,
    replace: `  return functionCallParts == null || functionCallParts.length === 0 ? void 0 : functionCallParts.map((part) => ({
    toolCallType: "function",
    toolCallId: generateId2(),
    toolName: part.functionCall.name,
    args: JSON.stringify(part.functionCall.args),
    providerMetadata: part.thoughtSignature == null ? void 0 : {
      google: {
        thoughtSignature: part.thoughtSignature
      }
    }
  }));`,
  },
  {
    name: 'stream tool-call metadata propagation',
    find: `                  controller.enqueue({
                    type: "tool-call-delta",
                    toolCallType: "function",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    argsTextDelta: toolCall.args
                  });
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    args: toolCall.args
                  });`,
    replace: `                  controller.enqueue({
                    type: "tool-call-delta",
                    toolCallType: "function",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    argsTextDelta: toolCall.args,
                    providerMetadata: toolCall.providerMetadata
                  });
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    args: toolCall.args,
                    providerMetadata: toolCall.providerMetadata
                  });`,
  },
];

function hasAllPatchMarkers(source) {
  return patches.every((patch) => source.includes(patch.replace));
}

function getPatchStatus() {
  return targets.map((filePath) => {
    if (!fs.existsSync(filePath)) {
      return { filePath, exists: false, patched: false };
    }

    const source = fs.readFileSync(filePath, 'utf8');

    return {
      filePath,
      exists: true,
      patched: hasAllPatchMarkers(source),
    };
  });
}

function applyPatches(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  let source = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const patch of patches) {
    if (source.includes(patch.replace)) {
      continue;
    }

    if (!source.includes(patch.find)) {
      throw new Error(`Patch "${patch.name}" could not be applied to ${filePath}`);
    }

    source = source.replace(patch.find, patch.replace);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, source, 'utf8');
  }

  return changed;
}

function ensurePatchedGoogleSdk() {
  for (const target of targets) {
    applyPatches(target);
  }

  const status = getPatchStatus();
  const unpatched = status.filter((entry) => entry.exists && !entry.patched);

  if (unpatched.length > 0) {
    const files = unpatched.map((entry) => entry.filePath).join(', ');
    throw new Error(`Google thought-signature patch verification failed for: ${files}`);
  }

  return status;
}

module.exports = {
  ensurePatchedGoogleSdk,
  getPatchStatus,
  patches,
  targets,
};
