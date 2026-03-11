import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import DOMPurify from 'dompurify';

export interface RichTextRendererProps {
  /** Content to render (JSON or HTML string) */
  content?: string | Record<string, any>;
  /** CSS class name */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
}

// Extensions used by both editor and renderer
const rendererExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
  }),
  Image.configure({
    inline: true,
    // Disable base64 for security - only allow remote URLs
    allowBase64: false,
  }),
  Link.configure({
    openOnClick: false,
  }),
  Underline,
  Placeholder.configure({
    placeholder: '',
  }),
];

/**
 * Convert Tiptap JSON to HTML string
 */
function jsonToHtml(json: Record<string, any>): string {
  try {
    const html = generateHTML(json, rendererExtensions);
    return html;
  } catch (error) {
    console.error('Failed to convert JSON to HTML:', error);
    return '';
  }
}

/**
 * RichTextRenderer - renders Tiptap JSON or HTML content safely
 */
export function RichTextRenderer({ content, className = '', style }: RichTextRendererProps) {
  if (!content) {
    return null;
  }

  let html: string;

  if (typeof content === 'string') {
    // If it looks like JSON, parse it first
    if (content.trim().startsWith('{')) {
      try {
        const json = JSON.parse(content);
        html = jsonToHtml(json);
      } catch {
        // If parsing fails, treat as HTML
        html = content;
      }
    } else {
      // Treat as HTML string
      html = content;
    }
  } else {
    // It's a Tiptap JSON object
    html = jsonToHtml(content);
  }

  // Sanitize HTML to prevent XSS
  const sanitizedHtml = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
  });

  return (
    <div
      className={`prose prose-sm sm:prose dark:prose-invert max-w-none ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
