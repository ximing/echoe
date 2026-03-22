import { useMemo, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { diffStrings } from '../../utils/echoe/diff';

export interface CardRendererProps {
  /** Front template (qfmt) */
  qfmt: string;
  /** Back template (afmt) */
  afmt: string;
  /** Card CSS */
  css: string;
  /** Field values */
  fields: Record<string, string>;
  /** Rich text JSON for fields (keyed by field name) */
  richTextFields?: Record<string, Record<string, unknown>>;
  /** Which side to render */
  side: 'front' | 'back';
  /** Cloze ordinal for cloze cards (1-based) */
  clozeOrdinal?: number;
  /** Typed answer values (for type-in-answer cards) */
  typedAnswers?: Record<string, string>;
  /** Callback when user types in type-in-answer field */
  onTypeAnswer?: (fieldName: string, value: string) => void;
  /** Auto-play audio mode: 'front' | 'back' | 'both' | 'never' */
  autoplay?: string;
  /** TTS speed (0.5 to 2.0) */
  ttsSpeed?: number;
  /** Callback when audio elements are rendered (for auto-play) */
  onAudioReady?: (hasAudio: boolean) => void;
}

// Allowed HTML tags for sanitization
const ALLOWED_TAGS = [
  'div', 'span', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'strike', 's',
  'a', 'img', 'audio', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'blockquote', 'pre', 'code',
  'sub', 'sup', 'center', 'small', 'big', 'input', 'button'
];

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class', 'id', 'width', 'height', 'style', 'controls', 'type', 'placeholder', 'data-field', 'data-text', 'data-lang'];
const EMPTY_TYPED_ANSWERS: Record<string, string> = {};

// Tiptap extensions for rendering (same as RichTextRenderer)
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
function jsonToHtml(json: Record<string, unknown>): string {
  try {
    return generateHTML(json, rendererExtensions);
  } catch (error) {
    console.error('Failed to convert JSON to HTML:', error);
    return '';
  }
}

/**
 * Sanitize HTML for card rendering
 */
function sanitizeForCard(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
  });
}

/**
 * Replace template variables {{FieldName}} with field values
 * Supports rich text rendering if richTextFields is provided
 */
function replaceFieldVariables(
  template: string,
  fields: Record<string, string>,
  richTextFields?: Record<string, Record<string, unknown>>
): string {
  // Match {{FieldName}} patterns
  return template.replace(/\{\{([^#/}]+)\}\}/g, (_match, fieldName) => {
    const trimmedName = fieldName.trim();

    // If rich text JSON exists for this field, convert to HTML
    if (richTextFields && richTextFields[trimmedName]) {
      const html = jsonToHtml(richTextFields[trimmedName]);
      return sanitizeForCard(html);
    }

    // Otherwise use plain text field value
    return fields[trimmedName] ?? '';
  });
}

/**
 * Check if a field has content (either plain text or rich text)
 */
function hasFieldContent(fieldName: string, fields: Record<string, string>, richTextFields?: Record<string, Record<string, unknown>>): boolean {
  const trimmedName = fieldName.trim();

  // Check plain text field
  const plainTextValue = fields[trimmedName];
  if (plainTextValue && plainTextValue.trim() !== '') {
    return true;
  }

  // Check rich text field
  if (richTextFields && richTextFields[trimmedName]) {
    const richTextJson = richTextFields[trimmedName];
    // Check if rich text has actual content (has non-empty text nodes)
    if (richTextJson && Array.isArray(richTextJson.content) && richTextJson.content.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Process Handlebars-style conditionals {{#FieldName}}...{{/FieldName}}
 */
function processConditionals(template: string, fields: Record<string, string>, richTextFields?: Record<string, Record<string, unknown>>): string {
  // Positive conditional: {{#FieldName}}...{{/FieldName}}
  // Show block only if field is non-empty (plain text or rich text)
  let result = template.replace(
    /\{\{#([^{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, fieldName, content) => {
      return hasFieldContent(fieldName, fields, richTextFields) ? content : '';
    }
  );

  // Inverse conditional: {{^FieldName}}...{{/FieldName}}
  // Show block only if field is empty
  result = result.replace(
    /\{\{\^([^{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, fieldName, content) => {
      return !hasFieldContent(fieldName, fields, richTextFields) ? content : '';
    }
  );

  return result;
}

/**
 * Process cloze deletions {{cN::text}} or {{cN::text::hint}}
 * - On front: show [...] for active ordinal, show text for inactive ordinals
 * - On back: show all clozes as plain text
 * - With hint: show [hint] on front for active ordinal
 */
function processCloze(template: string, _fields: Record<string, string>, side: 'front' | 'back', ordinal?: number): string {
  // Default to 1 if no ordinal specified but clozes exist
  const targetOrdinal = ordinal ?? 1;

  // Process each cloze
  return template.replace(/\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g, (_fullMatch, ordStr, text, hint) => {
    const ord = parseInt(ordStr, 10);
    const isActive = ord === targetOrdinal;

    if (side === 'back') {
      // On back: show all clozes as plain text
      return text;
    }

    // On front
    if (isActive) {
      // Active cloze
      if (hint) {
        // Show hint
        return `[${hint}]`;
      }
      // Show placeholder
      return '[...]';
    }

    // Inactive cloze: show text
    return text;
  });
}

/**
 * Process audio tags [sound:filename.mp3] -> hidden <audio> + custom play button
 */
function processAudio(template: string): string {
  let audioIndex = 0;
  return template.replace(/\[sound:([^\]]+)\]/g, (_, filename) => {
    // Reject invalid filenames with path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return ''; // Reject invalid filenames
    }
    // URL encode the filename but keep slashes and colons
    const encodedFilename = encodeURIComponent(filename);
    const audioId = `audio-${Date.now()}-${audioIndex++}`;

    // Extract display name (remove extension)
    const displayName = filename.replace(/\.[^.]+$/, '');

    return `
      <span class="inline-flex items-center gap-2">
        <audio id="${audioId}" class="cards-audio hidden" src="/api/v1/media/${encodedFilename}"></audio>
        <button
          class="audio-play-button inline-flex items-center gap-1 px-2 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
          data-audio-id="${audioId}"
          title="Play audio"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/>
          </svg>
          <span class="audio-filename text-xs">${escapeHtml(displayName)}</span>
        </button>
      </span>
    `;
  });
}

/**
 * Process TTS {{tts en_US:FieldName}} -> <button class="tts-button">
 */
function processTts(template: string, fields: Record<string, string>): string {
  // Match {{tts lang_code:FieldName}} or {{tts:FieldName}}
  return template.replace(/\{\{tts\s+([^:}]+):([^}]+)\}\}/g, (_fullMatch, langCode, fieldName) => {
    const trimmedFieldName = fieldName.trim();
    const text = fields[trimmedFieldName] || '';

    if (!text) return '';

    // Encode the text for the data attribute
    const encodedText = encodeURIComponent(text);
    const encodedLang = encodeURIComponent(langCode.trim());

    return `<button class="tts-button" data-text="${escapeHtml(encodedText)}" data-lang="${escapeHtml(encodedLang)}" title="Listen">🔊</button>`;
  });
}

/**
 * Process LaTeX with KaTeX
 * Inline: \(...\)  Block: \[...\]
 */
function processLatex(template: string): string {
  // Block LaTeX: \[...\] or $$...$$
  let result = template.replace(/\$\$([^$]+)\$\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<span class="latex-error">$$${latex}$$</span>`;
    }
  });

  result = result.replace(/\\\[([^\]]+)\\\]/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<span class="latex-error">\\[${latex}\\]</span>`;
    }
  });

  // Inline LaTeX: \(...\)
  result = result.replace(/\\\(([^)]+)\\\)/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<span class="latex-error">\\(${latex}\\)</span>`;
    }
  });

  return result;
}

/**
 * Process FrontSide variable
 * In Anki, {{FrontSide}} includes the front template content
 */
function processFrontSide(template: string, frontContent: string): string {
  return template.replace(/\{\{\s*FrontSide\s*\}\}/g, () => frontContent);
}

/**
 * Process type-in-answer {{type:FieldName}}
 * - On front: renders as <input> element (already done by backend)
 * - On back: shows diff between typed answer and correct answer
 */
function processTypeAnswer(
  html: string,
  fields: Record<string, string>,
  typedAnswers: Record<string, string> = {},
  side: 'front' | 'back'
): string {
  // Find all type-answer inputs
  const typeAnswerRegex = /<input[^>]*class="type-answer"[^>]*data-field="([^"]+)"[^>]*>/g;

  return html.replace(typeAnswerRegex, (_fullMatch, fieldName) => {
    const fieldValue = fields[fieldName] || '';
    const typedValue = typedAnswers[fieldName] || '';

    if (side === 'back' && typedValue) {
      // Show diff on back
      const segments = diffStrings(typedValue, fieldValue);

      // Build HTML for diff display
      let diffHtml = '<span class="type-answer-diff">';
      for (const segment of segments) {
        let className = '';
        switch (segment.type) {
          case 'equal':
            className = 'diff-equal';
            break;
          case 'insert':
            className = 'diff-insert';
            break;
          case 'delete':
            className = 'diff-delete';
            break;
          case 'missing':
            className = 'diff-missing';
            break;
        }
        diffHtml += `<span class="${className}">${escapeHtml(segment.value)}</span>`;
      }
      diffHtml += '</span>';

      // Also show the typed value for reference
      return `<div class="type-answer-result">${diffHtml}</div>`;
    }

    // On front side, keep the input as-is (already rendered by backend)
    return _fullMatch;
  });
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function isSameTypedAnswers(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => a[key] === b[key]);
}

/**
 * Main render function that processes all template features
 */
function renderTemplate(
  template: string,
  fields: Record<string, string>,
  richTextFields: Record<string, Record<string, unknown>> | undefined,
  side: 'front' | 'back',
  clozeOrdinal?: number,
  frontTemplate?: string,
  _recursionDepth = 0
): string {
  // Prevent infinite recursion from FrontSide processing (max 2 levels)
  if (_recursionDepth > 1) {
    return template;
  }

  let result = template;

  // Process FrontSide only when rendering back side
  if (side === 'back' && /\{\{\s*FrontSide\s*\}\}/.test(template)) {
    const renderedFront = frontTemplate
      ? renderTemplate(frontTemplate, fields, richTextFields, 'front', clozeOrdinal, undefined, _recursionDepth + 1)
      : '';
    result = processFrontSide(result, renderedFront);
  }

  // Process conditionals (now supports rich text fields)
  result = processConditionals(result, fields, richTextFields);

  // Process field variables
  result = replaceFieldVariables(result, fields, richTextFields);

  // Process cloze deletions
  result = processCloze(result, fields, side, clozeOrdinal);

  // Process audio
  result = processAudio(result);

  // Process TTS (before field substitution so we have field values)
  result = processTts(result, fields);

  // Process LaTeX
  result = processLatex(result);

  return result;
}

/**
 * Sanitize HTML to allow only safe tags and attributes
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * CardRenderer - Renders Anki card templates with field substitution, conditionals, cloze, audio, and LaTeX
 */
export function CardRenderer({
  qfmt,
  afmt,
  css,
  fields,
  richTextFields,
  side,
  clozeOrdinal,
  typedAnswers,
  onTypeAnswer,
  autoplay = 'never',
  ttsSpeed = 1,
  onAudioReady,
}: CardRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedTypedAnswers = typedAnswers ?? EMPTY_TYPED_ANSWERS;
  const [localTypedAnswers, setLocalTypedAnswers] = useState<Record<string, string>>(normalizedTypedAnswers);

  // Initialize local typed answers from prop
  useEffect(() => {
    setLocalTypedAnswers((prev) => {
      if (isSameTypedAnswers(prev, normalizedTypedAnswers)) {
        return prev;
      }
      return normalizedTypedAnswers;
    });
  }, [normalizedTypedAnswers]);

  // Process type-answer after sanitization
  const processedContent = useMemo(() => {
    const template = side === 'front' ? qfmt : afmt;
    const rendered = renderTemplate(template, fields, richTextFields, side, clozeOrdinal, qfmt);
    const sanitized = sanitizeHtml(rendered);

    // Process type-answer inputs
    return processTypeAnswer(sanitized, fields, localTypedAnswers, side);
  }, [qfmt, afmt, fields, richTextFields, side, clozeOrdinal, localTypedAnswers]);

  // Attach audio play button click handlers
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const playButtons = container.querySelectorAll<HTMLButtonElement>('button.audio-play-button');

    playButtons.forEach((button) => {
      const audioId = button.getAttribute('data-audio-id');
      if (!audioId) return;

      const audio = document.getElementById(audioId) as HTMLAudioElement;
      if (!audio) return;

      const handlePlay = () => {
        audio.currentTime = 0;
        audio.play().catch(() => {
          // Ignore play errors
        });
      };

      button.addEventListener('click', handlePlay);
      (button as HTMLButtonElement & { _audioHandler?: () => void })._audioHandler = handlePlay;
    });

    return () => {
      playButtons.forEach((button) => {
        const handler = (button as HTMLButtonElement & { _audioHandler?: () => void })._audioHandler;
        if (handler) {
          button.removeEventListener('click', handler);
        }
      });
    };
  }, [processedContent]);

  // Auto-play audio based on autoplay setting and side
  useEffect(() => {
    if (!containerRef.current || autoplay === 'never') return;

    const shouldPlayFront = autoplay === 'front' || autoplay === 'both';
    const shouldPlayBack = autoplay === 'back' || autoplay === 'both';

    if ((side === 'front' && !shouldPlayFront) || (side === 'back' && !shouldPlayBack)) {
      return;
    }

    const container = containerRef.current;
    const audioElements = container.querySelectorAll<HTMLAudioElement>('audio.cards-audio');

    if (audioElements.length > 0) {
      onAudioReady?.(true);
      // Play all audio elements
      const playPromises = Array.from(audioElements).map((audio) => {
        audio.currentTime = 0;
        return audio.play().catch(() => {
          // Ignore play errors (user may have muted)
        });
      });
      Promise.all(playPromises);
    } else {
      onAudioReady?.(false);
    }
  }, [processedContent, side, autoplay, onAudioReady]);

  // Attach TTS button click handlers
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const ttsButtons = container.querySelectorAll<HTMLButtonElement>('button.tts-button');

    const handleTtsClick = (button: HTMLButtonElement) => {
      const text = decodeURIComponent(button.getAttribute('data-text') || '');
      const lang = decodeURIComponent(button.getAttribute('data-lang') || 'en-US');

      if (!text) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = ttsSpeed;

      window.speechSynthesis.speak(utterance);
    };

    ttsButtons.forEach((button) => {
      const handler = () => handleTtsClick(button);
      button.addEventListener('click', handler);

      // Store handler for cleanup
      (button as HTMLButtonElement & { _ttsHandler?: () => void })._ttsHandler = handler;
    });

    return () => {
      ttsButtons.forEach((button) => {
        const handler = (button as HTMLButtonElement & { _ttsHandler?: () => void })._ttsHandler;
        if (handler) {
          button.removeEventListener('click', handler);
        }
      });
    };
  }, [processedContent, ttsSpeed]);

  // Auto-focus first type-input on front side
  useEffect(() => {
    if (side === 'front' && containerRef.current) {
      const input = containerRef.current.querySelector('input.type-answer') as HTMLInputElement | null;
      if (input) {
        input.focus();
      }
    }
  }, [side, processedContent]);

  // Handle input changes
  const handleInputChange = (fieldName: string, value: string) => {
    setLocalTypedAnswers((prev) => ({ ...prev, [fieldName]: value }));
    onTypeAnswer?.(fieldName, value);
  };

  // Attach event listeners for type-input changes after render
  useEffect(() => {
    if (!containerRef.current || side !== 'front') return;

    const container = containerRef.current;
    const inputs = container.querySelectorAll<HTMLInputElement>('input.type-answer');

    inputs.forEach((input) => {
      const fieldName = input.getAttribute('data-field');
      if (!fieldName) return;

      // Set up listener for changes
      const handleChange = () => {
        handleInputChange(fieldName, input.value);
      };

      input.addEventListener('input', handleChange);
      input.addEventListener('change', handleChange);

      // Initialize with existing value if any
      if (localTypedAnswers[fieldName] !== undefined) {
        input.value = localTypedAnswers[fieldName];
      }

      return () => {
        input.removeEventListener('input', handleChange);
        input.removeEventListener('change', handleChange);
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedContent, side, localTypedAnswers]);

  return (
    <div className="cards-card-renderer" ref={containerRef}>
      {/* Card CSS */}
      {css && <style>{css}</style>}

      {/* Card content */}
      <div
        className="card-content"
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
    </div>
  );
}

export default CardRenderer;
