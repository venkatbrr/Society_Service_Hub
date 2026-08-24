import React from 'react';

/**
 * WhatsApp glyph — the speech bubble with a handset.
 *
 * Bespoke because `@untitledui/icons` carries no brand marks at all (its
 * closest, `MessageChatCircle`, is a generic chat bubble that would read as
 * "message" rather than "send this on WhatsApp"). Same precedent as
 * `ParentChildIcon` and the hand-drawn glyphs in `NavIcons.tsx`.
 *
 * **Not an emoji.** The repo bans emoji in UI chrome (docs/CLAUDE.md §3), and
 * an emoji would also render differently on every platform — Android, iOS and
 * each desktop browser ship their own WhatsApp glyph, and some ship none. A
 * vector we own is identical everywhere and takes `color` like every other
 * icon here.
 *
 * Unlike the outline icons around it this is drawn as a **filled** path, since
 * that is the mark people recognise; it is the one place a brand shape beats
 * set consistency. `size`/`color` props and DOM SVG output match the Untitled
 * UI contract so it drops into an icon row without special-casing.
 */
export interface WhatsAppIconProps {
  size?: number;
  color?: string;
  [key: string]: any;
}

export function WhatsAppIcon({
  size = 16,
  color = 'currentColor',
  ...rest
}: WhatsAppIconProps) {
  return React.createElement(
    'svg' as any,
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: color,
      'aria-hidden': 'true',
      focusable: 'false',
      ...rest,
    },
    React.createElement('path' as any, {
      key: 'mark',
      d: 'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03 0 1.2.87 2.35.99 2.51.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z',
    })
  );
}

export default WhatsAppIcon;
