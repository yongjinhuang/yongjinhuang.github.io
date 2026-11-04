import type { Translations } from '@/types';
import { buildResumeBodyHtml } from './resume-template';

export async function exportResumePdf(
  translations: Translations,
  locale: string,
  schemeName: string
): Promise<void> {
  const html2pdfModule = await import('html2pdf.js');
  const html2pdf = html2pdfModule.default ?? html2pdfModule;

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '730px';
  wrapper.style.background = '#ffffff';
  wrapper.innerHTML = buildResumeBodyHtml(translations, locale, schemeName);
  document.body.appendChild(wrapper);

  try {
    const imgs = Array.from(wrapper.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
      )
    );

    const target =
      wrapper.querySelector<HTMLElement>('.resume-root') ?? wrapper;
    const filename =
      locale === 'zh'
        ? `黄勇进_简历_${schemeName}.pdf`
        : `Yongjin_Huang_Resume_${schemeName}.pdf`;

    await html2pdf()
      .set({
        margin: [6, 7.5, 6, 7.5],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2.5,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: 740,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(target)
      .save();
  } finally {
    document.body.removeChild(wrapper);
  }
}
