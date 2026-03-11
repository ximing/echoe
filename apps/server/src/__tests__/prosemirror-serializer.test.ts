import { serializeToHtml, serializeToPlainText } from '../lib/prosemirror-serializer.js';
import type { ProseMirrorJsonDoc } from '../types/note-fields.js';

describe('prosemirror-serializer', () => {
  // Helper to build a simple paragraph doc
  const paragraphDoc = (text: string): ProseMirrorJsonDoc => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  });

  describe('serializeToHtml', () => {
    it('converts a plain text paragraph to HTML', () => {
      const doc = paragraphDoc('Hello, world!');
      const html = serializeToHtml(doc);
      expect(html).toContain('<p>');
      expect(html).toContain('Hello, world!');
    });

    it('converts bold text to <strong> tag', () => {
      const doc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'bold text',
                marks: [{ type: 'bold' }],
              },
            ],
          },
        ],
      };
      const html = serializeToHtml(doc);
      expect(html).toContain('<strong>');
      expect(html).toContain('bold text');
    });

    it('converts italic text to <em> tag', () => {
      const doc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'italic text',
                marks: [{ type: 'italic' }],
              },
            ],
          },
        ],
      };
      const html = serializeToHtml(doc);
      expect(html).toContain('<em>');
      expect(html).toContain('italic text');
    });

    it('converts a bullet list to <ul>', () => {
      const doc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'item one' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'item two' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const html = serializeToHtml(doc);
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>');
      expect(html).toContain('item one');
      expect(html).toContain('item two');
    });

    it('converts an ordered list to <ol>', () => {
      const doc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'first' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const html = serializeToHtml(doc);
      expect(html).toContain('<ol>');
      expect(html).toContain('first');
    });

    it('converts a code block to <pre><code>', () => {
      const doc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            content: [{ type: 'text', text: 'const x = 1;' }],
          },
        ],
      };
      const html = serializeToHtml(doc);
      expect(html).toContain('<pre>');
      expect(html).toContain('<code>');
      expect(html).toContain('const x = 1;');
    });

    it('handles an empty document', () => {
      const doc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [],
      };
      const html = serializeToHtml(doc);
      expect(typeof html).toBe('string');
    });
  });

  describe('serializeToPlainText', () => {
    it('extracts plain text from a paragraph', () => {
      const doc = paragraphDoc('Hello, world!');
      const text = serializeToPlainText(doc);
      expect(text).toContain('Hello, world!');
      expect(text).not.toContain('<');
    });

    it('extracts plain text from bold text (no HTML tags)', () => {
      const doc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'bold text',
                marks: [{ type: 'bold' }],
              },
            ],
          },
        ],
      };
      const text = serializeToPlainText(doc);
      expect(text).toContain('bold text');
      expect(text).not.toContain('<strong>');
      expect(text).not.toContain('<');
    });

    it('extracts plain text from a list', () => {
      const doc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'list item' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const text = serializeToPlainText(doc);
      expect(text).toContain('list item');
      expect(text).not.toContain('<ul>');
    });

    it('returns empty string for empty document', () => {
      const doc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [],
      };
      const text = serializeToPlainText(doc);
      expect(typeof text).toBe('string');
    });
  });
});
