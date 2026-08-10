export type MarkupToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'link'; text: string; url: string };

/**
 * Parses inline markdown-subset tokens (**bold** and [text](url)).
 */
export function parseInlineMarkup(text: string): MarkupToken[] {
  const tokens: MarkupToken[] = [];
  const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    if (match[1] !== undefined) {
      tokens.push({
        type: 'bold',
        content: match[1],
      });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      tokens.push({
        type: 'link',
        text: match[2],
        url: match[3],
      });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return tokens;
}

/**
 * Escapes HTML special characters.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts a string with **bold** and [text](url) markup to safe HTML string.
 */
export function renderMarkupToHtml(text: string): string {
  const tokens = parseInlineMarkup(text);
  return tokens
    .map((token) => {
      switch (token.type) {
        case 'text':
          return escapeHtml(token.content);
        case 'bold':
          return `<strong>${escapeHtml(token.content)}</strong>`;
        case 'link':
          return `<a href="${escapeHtml(token.url)}">${escapeHtml(token.text)}</a>`;
      }
    })
    .join('');
}
