/**
 * Canonical flat field storage: maps field name → plain-text or HTML string value.
 * This is the primary storage format for note fields in the database (fields_json column).
 * Keys are field names (e.g., "Front", "Back"); values are the rendered/plain-text content.
 */
export type CanonicalFields = Record<string, string>;

/**
 * Represents a single ProseMirror document node.
 * Mirrors the JSON structure produced by Tiptap/ProseMirror editors.
 * @see https://prosemirror.net/docs/ref/#model.Node
 */
export interface ProseMirrorNode {
  /** Node type name (e.g., "doc", "paragraph", "text", "heading") */
  type: string;
  /** Node attributes (e.g., { level: 1 } for headings) */
  attrs?: Record<string, unknown>;
  /** Child nodes */
  content?: ProseMirrorNode[];
  /** Marks applied to this node (e.g., bold, italic) */
  marks?: ProseMirrorMark[];
  /** Text content (only for text nodes) */
  text?: string;
}

/**
 * Represents a ProseMirror mark (inline formatting).
 * @see https://prosemirror.net/docs/ref/#model.Mark
 */
export interface ProseMirrorMark {
  /** Mark type name (e.g., "bold", "italic", "underline", "link") */
  type: string;
  /** Mark attributes (e.g., { href: "..." } for links) */
  attrs?: Record<string, unknown>;
}

/**
 * A complete ProseMirror JSON document.
 * The root node always has type "doc" and contains block-level child nodes.
 * This is the format produced and consumed by Tiptap editors.
 */
export interface ProseMirrorJsonDoc extends ProseMirrorNode {
  /** Root node type is always "doc" */
  type: 'doc';
  /** Top-level block nodes (paragraphs, headings, lists, etc.) */
  content: ProseMirrorNode[];
}

/**
 * Rich text fields storage: maps field name → ProseMirror JSON document.
 * Used when the frontend submits rich text editor content for server-side HTML conversion.
 * Keys are field names (e.g., "Front", "Back"); values are full ProseMirror JSON docs.
 */
export type RichTextFields = Record<string, ProseMirrorJsonDoc>;

/**
 * Compatibility projection for Anki-compatible note representation.
 * Used when the system needs to expose data in Anki's legacy format.
 * - flds: field values joined by the \x1f separator
 * - sfld: the sort field (first field, plain text, truncated to 191 chars)
 * - csum: Anki-compatible checksum of sfld (parseInt(sha1(sfld).slice(0, 8), 16))
 */
export interface NoteCompatibilityProjection {
  /** Field values joined by \x1f (unit separator) delimiter */
  flds: string;
  /** Sort field: plain text of the first field, max 191 characters */
  sfld: string;
  /** Checksum: parseInt(sha1(sfld).slice(0, 8), 16) for duplicate detection */
  csum: number;
}
