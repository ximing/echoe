/**
 * Server-side ProseMirror JSON → HTML serialization module.
 * Uses @tiptap/core's generateHTML and generateText to convert ProseMirror JSON
 * documents to HTML or plain text in a Node.js environment.
 *
 * Because prosemirror-model's DOMSerializer requires a DOM, this module
 * sets up a minimal jsdom environment before invoking generateHTML.
 */

import { JSDOM } from 'jsdom';
import { generateHTML, generateText } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Blockquote from '@tiptap/extension-blockquote';
import BulletList from '@tiptap/extension-bullet-list';
import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Heading from '@tiptap/extension-heading';
import Image from '@tiptap/extension-image';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import ListItem from '@tiptap/extension-list-item';
import OrderedList from '@tiptap/extension-ordered-list';
import Paragraph from '@tiptap/extension-paragraph';
import Strike from '@tiptap/extension-strike';
import Text from '@tiptap/extension-text';
import Underline from '@tiptap/extension-underline';
import type { ProseMirrorJsonDoc } from '../types/note-fields.js';

// Polyfill DOM globals required by prosemirror-model's DOMSerializer in Node.js.
// This is a one-time setup that makes generateHTML work without a browser.
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const g = globalThis as Record<string, unknown>;
if (typeof g['window'] === 'undefined') {
  g['window'] = dom.window;
  g['document'] = dom.window.document;
  g['DocumentFragment'] = dom.window.DocumentFragment;
  g['Element'] = dom.window.Element;
  g['HTMLElement'] = dom.window.HTMLElement;
  g['Node'] = dom.window.Node;
}

/**
 * The set of Tiptap extensions used for serialization.
 * Covers node/mark types emitted by the web rich-text editor:
 * paragraph, text, bold, italic, underline, strike, code, link,
 * image, heading, bulletList, orderedList, listItem, codeBlock,
 * blockquote, hardBreak
 */
const SERIALIZER_EXTENSIONS = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  Underline,
  Strike,
  Code,
  Link,
  Heading,
  BulletList,
  OrderedList,
  ListItem,
  CodeBlock,
  Blockquote,
  HardBreak,
  Image,
];

/**
 * Converts a ProseMirror JSON document to an HTML string.
 * Runs in Node.js using a jsdom polyfill for the DOM APIs required by
 * prosemirror-model's DOMSerializer.
 *
 * @param doc - A ProseMirror JSON document with type "doc"
 * @returns HTML string representation of the document
 */
export function serializeToHtml(doc: ProseMirrorJsonDoc): string {
  return generateHTML(doc, SERIALIZER_EXTENSIONS);
}

/**
 * Converts a ProseMirror JSON document to a plain-text string.
 * Strips all HTML markup; suitable for use as the sort field (sfld).
 *
 * @param doc - A ProseMirror JSON document with type "doc"
 * @returns Plain-text string representation of the document
 */
export function serializeToPlainText(doc: ProseMirrorJsonDoc): string {
  return generateText(doc, SERIALIZER_EXTENSIONS);
}
