/**
 * High-performance 100% compatible Canvas Note Card Generator
 * Accurately calculates pill dimensions, fonts, paddings, and wraps cleanly.
 * Renders attached note images at their true natural aspect ratio (zero distortion).
 */

interface RenderCardOptions {
  title: string;
  content: string;
  projectName?: string;
  projectColor?: string;
  dateStr: string;
  images?: string[];
}

interface LoadedImageInfo {
  img: HTMLImageElement;
  drawWidth: number;
  drawHeight: number;
}

export async function generateNoteCanvasCard(options: RenderCardOptions): Promise<string> {
  const { title, content, projectName, projectColor = '#10b981', dateStr, images } = options;

  const width = 750; // High resolution 2x
  const padding = 50;
  const contentWidth = width - padding * 2;
  const imageGap = 24;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Cannot get 2d context');
  }

  // Collect all images (from note.images array + any inline base64 markdown images)
  const allImageSources: string[] = [...(images || [])];
  const inlineBase64Regex = /!\[(.*?)\]\((data:image\/[a-zA-Z]+;base64,[^)]+)\)/g;
  let match;
  while ((match = inlineBase64Regex.exec(content)) !== null) {
    if (!allImageSources.includes(match[2])) {
      allImageSources.push(match[2]);
    }
  }

  // Preload attached images and compute their exact proportional dimensions (NO distortion)
  const loadedImages: LoadedImageInfo[] = [];
  for (const src of allImageSources) {
    if (!src) continue;
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const imageEl = new Image();
        imageEl.crossOrigin = 'anonymous';
        imageEl.onload = () => resolve(imageEl);
        imageEl.onerror = () => reject(new Error('Image failed to load'));
        imageEl.src = src;
      });
      const naturalW = img.naturalWidth || img.width || 1;
      const naturalH = img.naturalHeight || img.height || 1;

      // Keep 100% true aspect ratio: scale width to contentWidth and height proportionally
      const drawWidth = contentWidth;
      const drawHeight = Math.round(contentWidth * (naturalH / naturalW));

      loadedImages.push({
        img,
        drawWidth,
        drawHeight,
      });
    } catch {
      // Skip broken image
    }
  }

  // Clean markdown tags for canvas rendering
  const cleanContent = content
    .replace(/\[\[.*?\|(.*?)\]\]/g, '🔗 $1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~`]/g, '');

  const lines: string[] = [];
  const paragraphs = cleanContent.split('\n');

  const contentFont =
    '26px -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.font = contentFont;

  paragraphs.forEach((p) => {
    if (!p.trim()) {
      lines.push('');
      return;
    }

    let currentLine = '';
    for (let i = 0; i < p.length; i++) {
      const testLine = currentLine + p[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > contentWidth && i > 0) {
        lines.push(currentLine);
        currentLine = p[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  });

  // Calculate total height including all proportional images
  const headerHeight = projectName ? 90 : 40;
  const titleHeight = 70;
  const imagesTotalHeight =
    loadedImages.reduce((acc, item) => acc + item.drawHeight + imageGap, 0) +
    (loadedImages.length > 0 ? 12 : 0);
  const lineHeight = 42;
  const contentHeight = lines.length * lineHeight;
  const footerHeight = 90;
  const totalHeight =
    padding + headerHeight + titleHeight + contentHeight + imagesTotalHeight + footerHeight + padding;

  canvas.width = width;
  canvas.height = Math.max(460, totalHeight);

  // 1. Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, canvas.height);

  // Top colored accent bar
  ctx.fillStyle = projectColor;
  ctx.fillRect(0, 0, width, 12);

  let currentY = padding + 15;

  // 2. Project Pill Tag (Accurate measurement with font preset)
  if (projectName) {
    const pillFont =
      'bold 22px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.font = pillFont;
    const textWidth = ctx.measureText(projectName).width;

    const pillPaddingX = 16;
    const dotRadius = 5;
    const dotSpacing = 8;
    const pillHeight = 36;
    const pillWidth = pillPaddingX + dotRadius * 2 + dotSpacing + textWidth + pillPaddingX + 6;
    const pillY = currentY;

    // Draw pill background with generous padding
    ctx.fillStyle = projectColor + '18'; // ~10% opacity tint
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(padding, pillY, pillWidth, pillHeight, pillHeight / 2);
    } else {
      ctx.rect(padding, pillY, pillWidth, pillHeight);
    }
    ctx.fill();

    // Draw color dot inside pill
    const dotX = padding + pillPaddingX + dotRadius;
    const dotY = pillY + pillHeight / 2;
    ctx.fillStyle = projectColor;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw project text cleanly inside pill
    ctx.fillStyle = projectColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(projectName, dotX + dotRadius + dotSpacing, dotY + 1);

    currentY += pillHeight + 24;
  }

  // 3. Title
  ctx.fillStyle = '#0f172a';
  ctx.font =
    'bold 34px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title || '无标题便签', padding, currentY + 30);
  currentY += 46;

  // Divider Line
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, currentY);
  ctx.lineTo(width - padding, currentY);
  ctx.stroke();
  currentY += 36;

  // 4. Content Lines
  ctx.fillStyle = '#334155';
  ctx.font = contentFont;
  ctx.textBaseline = 'alphabetic';

  lines.forEach((line) => {
    if (line) {
      ctx.fillText(line, padding, currentY);
    }
    currentY += lineHeight;
  });

  // 5. Render Attached Images at 100% True Aspect Ratio
  if (loadedImages.length > 0) {
    currentY += 12;
    for (const item of loadedImages) {
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(padding, currentY, item.drawWidth, item.drawHeight, 18);
      } else {
        ctx.rect(padding, currentY, item.drawWidth, item.drawHeight);
      }
      ctx.clip();
      ctx.drawImage(item.img, padding, currentY, item.drawWidth, item.drawHeight);
      ctx.restore();

      // Subtle border around image
      ctx.save();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(padding, currentY, item.drawWidth, item.drawHeight, 18);
      } else {
        ctx.rect(padding, currentY, item.drawWidth, item.drawHeight);
      }
      ctx.stroke();
      ctx.restore();

      currentY += item.drawHeight + imageGap;
    }
  }

  // 6. Footer Line & Watermark
  const footerY = canvas.height - padding;
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding, footerY - 26);
  ctx.lineTo(width - padding, footerY - 26);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '20px -apple-system, BlinkMacSystemFont, "PingFang SC", monospace';
  ctx.fillText('项目便签 App', padding, footerY);
  const dateWidth = ctx.measureText(dateStr).width;
  ctx.fillText(dateStr, width - padding - dateWidth, footerY);

  // Return PNG data URL
  return canvas.toDataURL('image/png');
}
