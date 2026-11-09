/**
 * Markdown 渲染净化（白名单式）。
 *
 * marked 默认会原样保留正文里的原始 HTML（例如 <script>、<img onerror>、<svg>），
 * 而 MarkdownRenderer 通过 dangerouslySetInnerHTML 注入，因此必须在渲染前净化。
 *
 * 这里不引入额外依赖：用 DOMParser 在惰性文档中解析，再按标签/属性白名单逐层清洗，
 * 最后序列化回字符串。DOMParser 生成的文档不会执行脚本，也不会触发事件属性。
 */

import { NOTE_REF_BADGE_CLASS } from './markdown';

const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'input',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

// 这些标签连同内部文本一起丢弃；其余未知标签只解包、保留其中的文字
const DROP_WITH_CONTENT = new Set([
  'applet',
  'base',
  'button',
  'embed',
  'form',
  'frame',
  'frameset',
  'iframe',
  'link',
  'math',
  'meta',
  'noscript',
  'object',
  'option',
  'script',
  'select',
  'style',
  'svg',
  'template',
  'textarea',
  'title',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  abbr: new Set(['title']),
  img: new Set(['src', 'alt', 'title']),
  input: new Set(['type', 'checked', 'disabled']),
  th: new Set(['align']),
  td: new Set(['align']),
  ol: new Set(['start']),
  code: new Set(['class']),
  span: new Set(['class', 'data-note-id']),
};

const EMPTY_ATTRS = new Set<string>();
const SAFE_SCHEMES_HREF = new Set(['http', 'https', 'mailto', 'tel']);
const SAFE_SCHEMES_SRC = new Set(['http', 'https', 'blob']);
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,/i;
const LANGUAGE_CLASS = /^language-[a-z0-9#+._-]+$/i;
const NOTE_ID = /^[a-zA-Z0-9_-]+$/;

function unwrap(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function isSafeUrl(rawValue: string, kind: 'href' | 'src'): boolean {
  // 去掉空白与控制字符，避免 "java\tscript:" / "java\nscript:" 之类的绕过
  const compact = rawValue.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
  if (!compact) return false;

  // 相对地址 / 锚点 / 协议相对地址
  if (
    compact.startsWith('#') ||
    compact.startsWith('/') ||
    compact.startsWith('./') ||
    compact.startsWith('../') ||
    compact.startsWith('?')
  ) {
    return true;
  }

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/.exec(compact);
  if (!schemeMatch) return true; // 形如 `foo/bar.md` 的相对路径

  const scheme = schemeMatch[1];
  if (kind === 'href') {
    return SAFE_SCHEMES_HREF.has(scheme);
  }
  if (scheme === 'data') {
    // 只允许栅格图；data:image/svg+xml 可能夹带脚本，直接拒绝
    return SAFE_DATA_IMAGE.test(compact);
  }
  return SAFE_SCHEMES_SRC.has(scheme);
}

/**
 * 净化 marked 生成的 HTML。返回值可安全交给 dangerouslySetInnerHTML。
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';

  const doc = new DOMParser().parseFromString(dirty, 'text/html');
  const body = doc.body;
  // 静态列表，从最深层开始处理，保证解包父节点时子节点已经清洗完毕
  const elements = Array.from(body.querySelectorAll('*'));

  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    const tag = element.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      if (DROP_WITH_CONTENT.has(tag)) {
        element.remove();
      } else {
        unwrap(element);
      }
      continue;
    }

    const allowedAttrs = ALLOWED_ATTRS[tag] || EMPTY_ATTRS;
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();

      if (!allowedAttrs.has(name)) {
        element.removeAttribute(attr.name);
        continue;
      }

      if (name === 'href' && !isSafeUrl(attr.value, 'href')) {
        element.removeAttribute(attr.name);
      } else if (name === 'src' && !isSafeUrl(attr.value, 'src')) {
        element.removeAttribute(attr.name);
      }
    }

    if (tag === 'a') {
      if (element.hasAttribute('href')) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    } else if (tag === 'img') {
      // 没有可用 src 的图片直接移除
      if (!element.getAttribute('src')) {
        element.remove();
        continue;
      }
      element.setAttribute('loading', 'lazy');
    } else if (tag === 'input') {
      if ((element.getAttribute('type') || '').toLowerCase() !== 'checkbox') {
        element.remove();
        continue;
      }
      element.setAttribute('type', 'checkbox');
      element.setAttribute('disabled', '');
    } else if (tag === 'th' || tag === 'td') {
      const align = (element.getAttribute('align') || '').toLowerCase();
      if (align && align !== 'left' && align !== 'center' && align !== 'right') {
        element.removeAttribute('align');
      }
    } else if (tag === 'ol') {
      const start = element.getAttribute('start');
      if (start !== null && !/^-?\d+$/.test(start)) {
        element.removeAttribute('start');
      }
    } else if (tag === 'code') {
      const className = element.getAttribute('class');
      if (className && !LANGUAGE_CLASS.test(className)) {
        element.removeAttribute('class');
      }
    } else if (tag === 'span') {
      const noteId = element.getAttribute('data-note-id') || '';
      if (element.classList.contains('note-ref-badge') && NOTE_ID.test(noteId)) {
        // 统一改写成固定的徽章样式，避免便签正文借 class 覆盖界面
        element.setAttribute('class', NOTE_REF_BADGE_CLASS);
      } else {
        unwrap(element);
      }
    }
  }

  return body.innerHTML;
}
