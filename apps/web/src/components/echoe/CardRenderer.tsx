import { useMemo, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import katex from 'katex';
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

/**
 * Replace template variables {{FieldName}} with field values
 */
function replaceFieldVariables(template: string, fields: Record<string, string>): string {
  // Match {{FieldName}} patterns
  return template.replace(/\{\{([^#/}]+)\}\}/g, (_match, fieldName) => {
    const trimmedName = fieldName.trim();
    return fields[trimmedName] ?? '';
  });
}

/**
 * Process Handlebars-style conditionals {{#FieldName}}...{{/FieldName}}
 */
function processConditionals(template: string, fields: Record<string, string>): string {
  // Positive conditional: {{#FieldName}}...{{/FieldName}}
  // Show block only if field is non-empty
  let result = template.replace(
    /\{\{#([^{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, fieldName, content) => {
      const trimmedName = fieldName.trim();
      const fieldValue = fields[trimmedName];
      return fieldValue && fieldValue.trim() !== '' ? content : '';
    }
  );

  // Inverse conditional: {{^FieldName}}...{{/FieldName}}
  // Show block only if field is empty
  result = result.replace(
    /\{\{\^([^{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, fieldName, content) => {
      const trimmedName = fieldName.trim();
      const fieldValue = fields[trimmedName];
      return !fieldValue || fieldValue.trim() === '' ? content : '';
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
 * Process audio tags [sound:filename.mp3] -> <audio>
 */
function processAudio(template: string): string {
  return template.replace(/\[sound:([^\]]+)\]/g, (_, filename) => {
    // URL encode the filename but keep slashes and colons
    const encodedFilename = encodeURIComponent(filename);
    return `<audio class="cards-audio" src="/api/v1/media/${encodedFilename}" controls></audio>`;
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

    return `<button class="tts-button" data-text="${encodedText}" data-lang="${encodedLang}" title="Listen">🔊</button>`;
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
  return template.replace(/\{\{FrontSide\}\}/g, frontContent);
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

/**
 * Main render function that processes all template features
 */
function renderTemplate(
  template: string,
  fields: Record<string, string>,
  side: 'front' | 'back',
  clozeOrdinal?: number,
  _recursionDepth = 0
): string {
  // Prevent infinite recursion from FrontSide processing (max 2 levels)
  if (_recursionDepth > 1) {
    return template;
  }

  let result = template;

  // Process FrontSide only when rendering back side
  if (side === 'back' && template.includes('{{FrontSide}}')) {
    // Render front template separately to get front content
    const frontTemplate = template.replace(/[\s\S]*\{\{FrontSide\}\}[\s\S]*/g, '');
    const frontContent = renderTemplate(frontTemplate, fields, 'front', clozeOrdinal, _recursionDepth + 1);
    result = processFrontSide(template, frontContent);
  }

  // Process conditionals
  result = processConditionals(result, fields);

  // Process field variables
  result = replaceFieldVariables(result, fields);

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
  side,
  clozeOrdinal,
  typedAnswers = {},
  onTypeAnswer,
  autoplay = 'never',
  ttsSpeed = 1,
  onAudioReady,
}: CardRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localTypedAnswers, setLocalTypedAnswers] = useState<Record<string, string>>({});

  // Initialize local typed answers from prop
  useEffect(() => {
    setLocalTypedAnswers(typedAnswers);
  }, [typedAnswers]);

  // Process type-answer after sanitization
  const processedContent = useMemo(() => {
    const template = side === 'front' ? qfmt : afmt;
    const rendered = renderTemplate(template, fields, side, clozeOrdinal);
    const sanitized = sanitizeHtml(rendered);

    // Process type-answer inputs
    return processTypeAnswer(sanitized, fields, localTypedAnswers, side);
  }, [qfmt, afmt, fields, side, clozeOrdinal, localTypedAnswers]);

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
