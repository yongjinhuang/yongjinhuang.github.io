import { createElement } from 'react';
import type { Translations } from '@/types';

const ASSET_PATHS = [
  '/selfie.png',
  '/logo/school.png',
  '/logo/cognizant.svg',
  '/logo/wilddata.png',
  '/logo/tarro.webp',
  '/logo/shopee.jpg',
  '/logo/huawei.jpeg',
];

async function rasterizeImageToPngDataUrl(
  url: string,
  targetSize = 240
): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(url);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetSize, targetSize);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetSize, targetSize);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = url;
  });
}

async function prepareAssetMap(): Promise<Record<string, string>> {
  const entries = await Promise.all(
    ASSET_PATHS.map(async (p) => {
      const size = p === '/selfie.png' ? 280 : 128;
      const dataUrl = await rasterizeImageToPngDataUrl(p, size);
      return [p, dataUrl] as const;
    })
  );
  return Object.fromEntries(entries);
}

export async function exportResumePdf(
  translations: Translations,
  locale: string,
  schemeName: string
): Promise<void> {
  const [{ pdf }, { ResumePdfDocument, registerResumeFonts }, assetMap] =
    await Promise.all([
      import('@react-pdf/renderer'),
      import('./ResumePdfDocument'),
      prepareAssetMap(),
    ]);

  registerResumeFonts(window.location.origin);

  const docElement = createElement(ResumePdfDocument, {
    translations,
    locale,
    schemeName,
    assetMap,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(docElement as any).toBlob();
  const blobUrl = URL.createObjectURL(blob);

  const filename =
    locale === 'zh'
      ? `黄勇进_简历_${schemeName}.pdf`
      : `Yongjin_Huang_Resume_${schemeName}.pdf`;

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}
