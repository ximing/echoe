import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Image as ImageIcon,
  Undo,
  Redo,
} from 'lucide-react';

export interface RichTextEditorProps {
  /** Editor content (HTML string or JSON) */
  content?: string | Record<string, any>;
  /** Whether the editor is editable */
  editable?: boolean;
  /** Callback when content changes */
  onChange?: (html: string, json: Record<string, any>) => void;
  /** Placeholder text */
  placeholder?: string;
  /** CSS class name */
  className?: string;
  /** Minimum height */
  minHeight?: string;
}

/**
 * Validate URL for security - only allow http/https protocols
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

const MenuBar = ({ editor, editable }: { editor: Editor | null; editable?: boolean }) => {
  if (!editor) {
    return null;
  }

  const addImage = useCallback(() => {
    const url = window.prompt('Enter image URL');
    if (url && isValidUrl(url)) {
      editor.chain().focus().setImage({ src: url }).run();
    } else if (url) {
      alert('Invalid URL. Only HTTP and HTTPS protocols are allowed.');
    }
  }, [editor]);

  const addLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL', previousUrl);
    if (url === null) {
      return;
    }
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!isValidUrl(url)) {
      alert('Invalid URL. Only HTTP and HTTPS protocols are allowed.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editable) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-800 rounded-t-lg">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().toggleBold()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('bold') ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Bold (Ctrl+B)"
        type="button"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().toggleItalic()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('italic') ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Italic (Ctrl+I)"
        type="button"
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().toggleUnderline()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('underline') ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Underline (Ctrl+U)"
        type="button"
      >
        <UnderlineIcon className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().toggleStrike()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('strike') ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Strikethrough"
        type="button"
      >
        <Strikethrough className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        disabled={!editor.can().toggleCode()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('code') ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Code"
        type="button"
      >
        <Code className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('heading', { level: 1 }) ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Heading 1"
        type="button"
      >
        <Heading1 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('heading', { level: 2 }) ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Heading 2"
        type="button"
      >
        <Heading2 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('heading', { level: 3 }) ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Heading 3"
        type="button"
      >
        <Heading3 className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('bulletList') ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Bullet List"
        type="button"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('orderedList') ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Ordered List"
        type="button"
      >
        <ListOrdered className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 ${
          editor.isActive('blockquote') ? 'bg-gray-200 dark:bg-dark-600 text-primary-600' : 'text-gray-600 dark:text-gray-400'
        }`}
        title="Quote"
        type="button"
      >
        <Quote className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      <button onClick={addLink} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 text-gray-600 dark:text-gray-400" title="Add Link" type="button">
        <LinkIcon className="w-4 h-4" />
      </button>
      <button onClick={addImage} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 text-gray-600 dark:text-gray-400" title="Add Image" type="button">
        <ImageIcon className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 text-gray-600 dark:text-gray-400 disabled:opacity-50"
        title="Undo"
        type="button"
      >
        <Undo className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-600 text-gray-600 dark:text-gray-400 disabled:opacity-50"
        title="Redo"
        type="button"
      >
        <Redo className="w-4 h-4" />
      </button>
    </div>
  );
};

export function RichTextEditor({
  content,
  editable = true,
  onChange,
  placeholder = 'Start typing...',
  className = '',
  minHeight = '150px',
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Image.configure({
        inline: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary-600 dark:text-primary-400 underline',
        },
        validate: (href) => {
          try {
            const parsed = new URL(href);
            return ['http:', 'https:'].includes(parsed.protocol);
          } catch {
            return false;
          }
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => {
      if (onChange) {
        const html = editor.getHTML();
        const json = editor.getJSON();
        onChange(html, json);
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose dark:prose-invert max-w-none focus:outline-none',
        style: `min-height: ${minHeight}`,
      },
    },
  });

  // Update content when prop changes
  useEffect(() => {
    if (editor && content !== undefined) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return (
    <div className={`border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 ${className}`}>
      <MenuBar editor={editor} editable={editable} />
      <EditorContent editor={editor} className="p-3" />
    </div>
  );
}
