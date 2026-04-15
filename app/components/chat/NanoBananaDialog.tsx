import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Button } from '~/components/ui/Button';

const IMAGE_MODELS = [
  {
    id: 'gemini-2.5-flash-image',
    label: 'Nano Banana',
    description: 'Fastest path for quick image generation and variation.',
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    description: 'Best for polished assets and harder art direction.',
  },
] as const;

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '3:2', '2:3'] as const;

type NanoBananaDialogProps = {
  apiKeys: Record<string, string>;
  defaultPrompt: string;
  imageDataList: string[];
  onGenerated: (generatedImages: string[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

type GenerateImageResponse = {
  ok: boolean;
  text?: string;
  images?: Array<{
    mimeType: string;
    data: string;
  }>;
  message?: string;
};

export function NanoBananaDialog({
  apiKeys,
  defaultPrompt,
  imageDataList,
  onGenerated,
  onOpenChange,
  open,
}: NanoBananaDialogProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [selectedModel, setSelectedModel] = useState<(typeof IMAGE_MODELS)[number]['id']>('gemini-2.5-flash-image');
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>('1:1');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setPrompt(defaultPrompt.trim());
    }
  }, [defaultPrompt, open]);

  const hasGoogleKey = useMemo(() => Boolean(apiKeys.Google), [apiKeys.Google]);
  const hasReferenceImages = imageDataList.length > 0;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Add a prompt first.');
      return;
    }

    if (!hasGoogleKey) {
      toast.error('Set your Google API key first.');
      return;
    }

    setPending(true);

    try {
      const response = await fetch('/api/image-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: selectedModel,
          references: imageDataList.map((dataUrl) => ({ dataUrl })),
          aspectRatio,
          imageSize: selectedModel === 'gemini-2.5-flash-image' ? undefined : '2K',
        }),
      });

      const result = (await response.json()) as GenerateImageResponse;

      if (!response.ok || !result.ok || !result.images?.length) {
        throw new Error(result.message || 'Nano Banana failed to generate an image.');
      }

      const generatedImages = result.images.map((image) => `data:${image.mimeType};base64,${image.data}`);
      onGenerated(generatedImages);
      toast.success(hasReferenceImages ? 'Image edit generated.' : 'Image generated.');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nano Banana failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog className="w-[min(94vw,42rem)]">
        <div className="p-6 space-y-5">
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-semibold">Nano Banana</DialogTitle>
            <DialogDescription>
              Generate custom images with Google Gemini image models. Attached images are used as edit references.
            </DialogDescription>
          </div>

          {!hasGoogleKey && (
            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
              Add a Google API key in Cloud Providers first. Nano Banana uses the existing Google provider key.
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-bolt-elements-textPrimary">Prompt</label>
            <textarea
              className="min-h-32 w-full rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the image you want Nano Banana to create or edit..."
              value={prompt}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-bolt-elements-textPrimary">Model</span>
            <div className="grid gap-2">
              {IMAGE_MODELS.map((model) => (
                <button
                  key={model.id}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                    selectedModel === model.id
                      ? 'border-white bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                      : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary'
                  }`}
                  onClick={() => setSelectedModel(model.id)}
                  type="button"
                >
                  <div className="text-sm font-medium">{model.label}</div>
                  <div className="mt-1 text-xs opacity-80">{model.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-bolt-elements-textPrimary">Aspect Ratio</span>
            <div className="flex flex-wrap gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    aspectRatio === ratio
                      ? 'border-white bg-white text-black'
                      : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary'
                  }`}
                  onClick={() => setAspectRatio(ratio)}
                  type="button"
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
            {hasReferenceImages
              ? `${imageDataList.length} attached image${imageDataList.length === 1 ? '' : 's'} will be used as reference input.`
              : 'No reference images attached. This will run as text-to-image generation.'}
          </div>

          <div className="flex justify-end gap-3">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-white text-black hover:bg-neutral-200"
              disabled={pending || !hasGoogleKey}
              onClick={handleGenerate}
              type="button"
              variant="outline"
            >
              {pending ? 'Generating...' : hasReferenceImages ? 'Generate Edit' : 'Generate Image'}
            </Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
