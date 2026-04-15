type GeneratedImageManifestEntry = {
  exportName: string;
  filePath: string;
  urlPath: string;
};

function toIdentifierPart(value: string) {
  return value
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part, index) => {
      const safe = part.replace(/^[^a-zA-Z_]+/, '');

      if (!safe) {
        return '';
      }

      const lower = safe.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

export function getGeneratedImageExportName(filePath: string) {
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || 'image';
  const identifier = toIdentifierPart(fileName);
  return identifier || 'generatedImage';
}

export function buildGeneratedImageManifestEntries(
  images: Array<{ filePath: string; urlPath: string }>,
): GeneratedImageManifestEntry[] {
  const usedNames = new Set<string>();

  return images.map((image) => {
    const baseName = getGeneratedImageExportName(image.filePath);
    let exportName = baseName;
    let suffix = 2;

    while (usedNames.has(exportName)) {
      exportName = `${baseName}${suffix}`;
      suffix++;
    }

    usedNames.add(exportName);

    return {
      exportName,
      filePath: image.filePath,
      urlPath: image.urlPath,
    };
  });
}

export function buildGeneratedImageManifestSource(images: Array<{ filePath: string; urlPath: string }>) {
  const entries = buildGeneratedImageManifestEntries(images);

  if (entries.length === 0) {
    return `export const generatedImages = {} as const;\n`;
  }

  const lines = entries.map((entry) => `export const ${entry.exportName} = ${JSON.stringify(entry.urlPath)};`);
  const mapEntries = entries.map((entry) => `  ${entry.exportName},`);

  return `${lines.join('\n')}\n\nexport const generatedImages = {\n${mapEntries.join('\n')}\n} as const;\n`;
}
