export type ContextAnnotation =
  | {
      type: 'codeContext';
      files: string[];
    }
  | {
      type: 'chatSummary';
      summary: string;
      chatId: string;
    }
  | {
      type: 'designRouting';
      primarySlug?: string;
      selectionSource?: 'canonical' | 'fallback';
      supportingSlugs: string[];
      matchedCategories: string[];
      matchedSignals: string[];
      ranked: Array<{
        slug: string;
        score: number;
        reasons: string[];
      }>;
    };

export type ProgressAnnotation = {
  type: 'progress';
  label: string;
  status: 'in-progress' | 'complete';
  order: number;
  message: string;
};

export type GoogleToolCallMetadataAnnotation = {
  type: 'googleToolCallMetadata';
  toolCallId: string;
  providerMetadata: Record<string, any>;
};

export type GeneratedImageAssetData = {
  type: 'generatedImageAsset';
  id: string;
  filePath: string;
  mimeType: string;
  data: string;
};
