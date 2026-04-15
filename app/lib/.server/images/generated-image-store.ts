type StoredGeneratedImage = {
  createdAt: number;
  data: string;
  mimeType: string;
};

const MAX_IMAGE_AGE_MS = 1000 * 60 * 60;
const generatedImages = new Map<string, StoredGeneratedImage>();

function cleanupExpiredImages(now = Date.now()) {
  for (const [id, image] of generatedImages.entries()) {
    if (now - image.createdAt > MAX_IMAGE_AGE_MS) {
      generatedImages.delete(id);
    }
  }
}

export function storeGeneratedImage(id: string, image: { data: string; mimeType: string }) {
  cleanupExpiredImages();
  generatedImages.set(id, {
    createdAt: Date.now(),
    data: image.data,
    mimeType: image.mimeType,
  });
}

export function getGeneratedImage(id: string) {
  cleanupExpiredImages();
  return generatedImages.get(id);
}
