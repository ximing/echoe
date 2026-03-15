import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { EchoeNoteService } from '../../services/echoe-note.service';
import { EchoeDeckService } from '../../services/echoe-deck.service';
import { ToastService } from '../../services/toast.service';
import { CardRenderer } from '../../components/echoe/CardRenderer';
import { RichTextEditor } from '../../components/echoe/RichTextEditor';
import {
  ChevronLeft,
  Save,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Image,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import type { EchoeNoteTypeDto, EchoeFieldDto, EchoeDeckWithCountsDto } from '@echoe/dto';

/**
 * Card Editor Page
 * Route: /echoe/cards/new and /echoe/cards/:id/edit
 */
export default function CardEditorPage() {
  return <CardEditorPageContent />;
}

const CardEditorPageContent = view(() => {
  const { noteId, cardId } = useParams<{ noteId?: string; cardId?: string }>();
  const navigate = useNavigate();
  const noteService = useService(EchoeNoteService);
  const deckService = useService(EchoeDeckService);
  const toastService = useService(ToastService);

  const isEditMode = !!noteId || !!cardId;

  const [selectedNotetype, setSelectedNotetype] = useState<EchoeNoteTypeDto | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<EchoeDeckWithCountsDto | null>(null);
const [fields, setFields] = useState<Record<string, string>>({});
const [richTextFields, setRichTextFields] = useState<Record<string, Record<string, unknown>>>({});
const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showSourceMode, setShowSourceMode] = useState<Record<number, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      noteService.clearCurrentNote();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        noteService.loadNoteTypes(),
        deckService.loadDecks(),
      ]);
      setIsDataLoaded(true);
    };
    loadData();

    if (noteId) {
      noteService.loadNote(noteId);
    } else if (cardId) {
      noteService.loadCard(cardId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, cardId]);

  // Set initial values when note loads (depends on both note and noteTypes being loaded)
  useEffect(() => {
    if (noteService.currentNote && noteService.noteTypes.length > 0 && (noteId || cardId)) {
      const nt = noteService.getNoteTypeById(noteService.currentNote.mid);
      if (nt) {
        setSelectedNotetype(nt);
        setFields(noteService.currentNote.fields || {});
        setRichTextFields(noteService.currentNote.richTextFields || {});
        setTags(noteService.currentNote.tags || []);
      }

      // Try to find deck from card
      if (cardId && noteService.currentCard) {
        const deck = deckService.decks.find((d) => d.deckId === noteService.currentCard?.did);
        if (deck) {
          setSelectedDeck(deck);
        }
      }
      setIsInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteService.currentNote, noteService.noteTypes, noteId, cardId]);

  // Set default notetype and deck on first load (new card mode only)
  useEffect(() => {
    if (!isEditMode && !isInitialized && isDataLoaded && noteService.noteTypes.length > 0 && deckService.decks.length > 0) {
      // Set default notetype
      const defaultNt = noteService.noteTypes.find((nt) => nt.name === 'Basic') || noteService.noteTypes[0];
      setSelectedNotetype(defaultNt);

      // Initialize fields for default notetype
      const initialFields: Record<string, string> = {};
      if (defaultNt?.flds) {
        defaultNt.flds.forEach((fld) => {
          initialFields[fld.name] = '';
        });
      }
      setFields(initialFields);
      setTags([]);

      // Set default deck
      const defaultDeck = deckService.decks.find((d) => d.name === 'Default') || deckService.decks[0];
      setSelectedDeck(defaultDeck);

      setIsInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, isInitialized, isDataLoaded, noteService.noteTypes.length, deckService.decks.length]);

  // Update fields when notetype changes (only after initialization, and only if field structure changed)
  useEffect(() => {
    if (isInitialized && selectedNotetype && selectedNotetype.flds) {
      // Check if field structure actually changed (compare field names)
      const currentFieldNames = Object.keys(fields).sort();
      const notetypeFieldNames = selectedNotetype.flds.map((fld) => fld.name).sort();

      const structureChanged =
        currentFieldNames.length !== notetypeFieldNames.length ||
        currentFieldNames.some((name, idx) => name !== notetypeFieldNames[idx]);

      if (structureChanged) {
        const newFields: Record<string, string> = {};
        selectedNotetype.flds.forEach((fld) => {
          newFields[fld.name] = fields[fld.name] || '';
        });
        setFields(newFields);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, selectedNotetype?.id]);

  // Handle notetype change
  const handleNotetypeChange = (notetypeId: string) => {
    const nt = noteService.noteTypes.find((n) => n.id === notetypeId);
    if (nt) {
      setSelectedNotetype(nt);
      // Reset fields to empty for new notetype
      const newFields: Record<string, string> = {};
      nt.flds.forEach((fld) => {
        newFields[fld.name] = '';
      });
      setFields(newFields);
      // Reset rich text fields for new notetype
      setRichTextFields({});
    }
  };

  // Handle deck change
  const handleDeckChange = (deckId: string) => {
    const deck = deckService.decks.find((d) => d.deckId === deckId);
    if (deck) {
      setSelectedDeck(deck);
    }
  };

  // Handle field change
  const handleFieldChange = (fieldName: string, value: string) => {
    setFields((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  // Check whether a rich text JSON node contains meaningful content
  const hasRichTextContent = (node: Record<string, unknown> | undefined): boolean => {
    if (!node || typeof node !== 'object') {
      return false;
    }

    if (typeof node.text === 'string' && node.text.trim() !== '') {
      return true;
    }

    if (node.type === 'image' && typeof node.attrs?.src === 'string' && node.attrs.src.trim() !== '') {
      return true;
    }

    if (Array.isArray(node.content)) {
      return node.content.some((child) => hasRichTextContent(child));
    }

    return false;
  };

  // Check whether a field has content in plain text or rich text mode
  const hasFieldContent = (fieldName: string): boolean => {
    if (fields[fieldName]?.trim()) {
      return true;
    }

    return hasRichTextContent(richTextFields[fieldName]);
  };

  // Toggle source mode for a field
  const toggleSourceMode = (fieldOrd: number) => {
    setShowSourceMode((prev) => ({
      ...prev,
      [fieldOrd]: !prev[fieldOrd],
    }));
  };

  // Handle image upload
  const handleImageUpload = async (fieldName: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const result = await noteService.uploadMediaFile(file);
      if (result) {
        const imgTag = `<img src="${result.url}" alt="${file.name}">`;
        const currentValue = fields[fieldName] || '';
        const newValue = currentValue + imgTag;
        handleFieldChange(fieldName, newValue);
        toastService.success('Image uploaded');
      } else {
        toastService.error('Failed to upload image');
      }
    };
    input.click();
  };

  // Handle tag input
  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = tagInput.trim();
      if (tag && !tags.includes(tag)) {
        setTags([...tags, tag]);
      }
      setTagInput('');
    }
  };

  // Remove tag
  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Apply formatting to field
  const applyFormatting = (fieldName: string, format: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'cloze') => {
    const textarea = document.getElementById(`field-${fieldName}`) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = fields[fieldName].substring(start, end);

    let formattedText = selectedText;
    switch (format) {
      case 'bold':
        formattedText = `<b>${selectedText}</b>`;
        break;
      case 'italic':
        formattedText = `<i>${selectedText}</i>`;
        break;
      case 'underline':
        formattedText = `<u>${selectedText}</u>`;
        break;
      case 'strike':
        formattedText = `<s>${selectedText}</s>`;
        break;
      case 'code':
        formattedText = `<code>${selectedText}</code>`;
        break;
      case 'cloze':
        formattedText = `{{c1::${selectedText}}}`;
        break;
    }

    const newValue = fields[fieldName].substring(0, start) + formattedText + fields[fieldName].substring(end);
    handleFieldChange(fieldName, newValue);
  };

  // Empty ProseMirror document used for fields not yet edited in rich text mode
  const EMPTY_PROSEMIRROR_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

  // Build complete richTextFields ensuring all notetype field keys are present.
  // Fields in source mode (HTML textarea) are excluded so the backend uses fields[name] instead.
  // Unedited rich-text fields get an empty ProseMirror doc so the backend can process them uniformly.
  const buildCompleteRichTextFields = (): Record<string, Record<string, unknown>> => {
    if (!selectedNotetype) return richTextFields;
    const complete: Record<string, Record<string, unknown>> = {};
    for (const fld of selectedNotetype.flds) {
      if (showSourceMode[fld.ord]) {
        // Field is in source mode — skip; backend will use fields[fld.name] as plain HTML
        continue;
      }
      complete[fld.name] = richTextFields[fld.name] ?? EMPTY_PROSEMIRROR_DOC;
    }
    return complete;
  };

  // Handle save
  const handleSave = async () => {
    if (!selectedNotetype || !selectedDeck) {
      toastService.error('Please select a note type and deck');
      return;
    }

    // Check required fields
    const requiredFields = selectedNotetype.flds.filter((f) => f.name === 'Front' || f.name === 'Back');
    for (const fld of requiredFields) {
      if (!hasFieldContent(fld.name)) {
        toastService.error(`Field "${fld.name}" is required`);
        return;
      }
    }

    const completeRichTextFields = buildCompleteRichTextFields();

    setIsSaving(true);
    try {
      if (noteId) {
        // Update existing note
        const success = await noteService.updateExistingNote(noteId, {
          fields,
          tags,
          richTextFields: completeRichTextFields,
        });
        if (success) {
          toastService.success('Note updated');
          navigate('/cards');
        } else {
          toastService.error(noteService.error || 'Failed to update note');
        }
      } else {
        // Create new note
        const result = await noteService.createNewNote({
          notetypeId: selectedNotetype.id,
          deckId: selectedDeck.deckId,
          fields,
          tags,
          richTextFields: completeRichTextFields,
        });
        if (result) {
          toastService.success('Note created');
          navigate('/cards');
        } else {
          toastService.error(noteService.error || 'Failed to create note');
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Get preview template
  const getPreviewTemplate = (side: 'front' | 'back') => {
    if (!selectedNotetype || !selectedNotetype.tmpls || selectedNotetype.tmpls.length === 0) {
      return side === 'front' ? '{{Front}}' : '{{FrontSide}}<hr id="answer">{{Back}}';
    }
    const template = selectedNotetype.tmpls[0];
    return side === 'front' ? template.qfmt : template.afmt;
  };

  // Render field editor
  const renderFieldEditor = (field: EchoeFieldDto) => {
    const isSourceMode = showSourceMode[field.ord] || false;
    const isCloze = selectedNotetype?.type === 1 && field.name.toLowerCase() === 'text';

    return (
      <div key={field.ord} className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {field.name}
            {field.description && (
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">- {field.description}</span>
            )}
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => applyFormatting(field.name, 'bold')}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting(field.name, 'italic')}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting(field.name, 'underline')}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
              title="Underline (Ctrl+U)"
            >
              <Underline className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting(field.name, 'strike')}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
              title="Strikethrough"
            >
              <Strikethrough className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting(field.name, 'code')}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
              title="Code"
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleImageUpload(field.name)}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
              title="Insert Image"
            >
              <Image className="w-4 h-4" />
            </button>
            {isCloze && (
              <button
                type="button"
                onClick={() => applyFormatting(field.name, 'cloze')}
                className="p-1.5 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded"
                title="Insert Cloze Deletion"
              >
                <span className="text-xs font-bold">C</span>
              </button>
            )}
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <button
              type="button"
              onClick={() => toggleSourceMode(field.ord)}
              className={`p-1.5 rounded ${
                isSourceMode
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700'
              }`}
              title={isSourceMode ? 'Switch to Rich Text Editor' : 'Switch to HTML Source'}
            >
              {isSourceMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {isSourceMode ? (
          <textarea
            id={`field-${field.name}`}
            value={fields[field.name] || ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className="w-full h-32 px-3 py-2 font-mono text-sm border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder={`Enter ${field.name} (HTML)`}
          />
        ) : (
          <RichTextEditor
            content={richTextFields[field.name] || fields[field.name] || ''}
            onChange={(_html, json) => {
              // Only store rich text JSON, not HTML in fields
              // Fields will contain empty string for rich text fields
              setRichTextFields((prev) => ({
                ...prev,
                [field.name]: json,
              }));
              // Also update fields with empty string to maintain the field exists
              if (!fields[field.name]) {
                handleFieldChange(field.name, '');
              }
            }}
            minHeight="120px"
          />
        )}
        {isCloze && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Use {'{{c1::text}}'} for cloze deletion. Use {'{{c1::text::hint}}'} for hint.
          </p>
        )}
      </div>
    );
  };

  // Show loading indicator while data loads
  if (!isDataLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-dark-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/cards')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isEditMode ? 'Edit Card' : 'Add Card'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/cards')}
            className="px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !selectedNotetype || !selectedDeck}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {/* Selectors Row */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Note Type Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Note Type
              </label>
              <select
                value={selectedNotetype?.id || ''}
                onChange={(e) => handleNotetypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                disabled={isEditMode}
              >
                <option value="">Select note type</option>
                {noteService.noteTypes.map((nt) => (
                  <option key={nt.id} value={nt.id}>
                    {String(nt.name)}
                  </option>
                ))}
              </select>
            </div>

            {/* Deck Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Deck
              </label>
              <select
                value={selectedDeck?.deckId || ''}
                onChange={(e) => handleDeckChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Select deck</option>
                {deckService.getRootDecks().map((deck) => (
                  <option key={deck.deckId} value={deck.deckId}>
                    {deck.name.split('::').pop()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fields */}
          {selectedNotetype && selectedNotetype.flds && selectedNotetype.flds.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Fields</h2>
              {selectedNotetype.flds.map((field) => renderFieldEditor(field))}
            </div>
          )}

          {/* Tags */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</label>
            <div className="flex flex-wrap items-center gap-2 p-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 min-h-[42px]">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-dark-600 text-gray-700 dark:text-gray-300 text-sm rounded"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-dark-500 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                placeholder={tags.length === 0 ? 'Add tags (press Enter or comma to add)' : ''}
                className="flex-1 min-w-[120px] px-2 py-1 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>
          </div>

          {/* Preview */}
          {selectedNotetype && hasFieldContent('Front') && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Preview</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewSide('front')}
                    className={`px-3 py-1 text-sm rounded ${
                      previewSide === 'front'
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700'
                    }`}
                  >
                    Front
                  </button>
                  <button
                    onClick={() => setPreviewSide('back')}
                    className={`px-3 py-1 text-sm rounded ${
                      previewSide === 'back'
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700'
                    }`}
                  >
                    Back
                  </button>
                </div>
              </div>
              <div className="border border-gray-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-800 p-4 min-h-[200px]">
                <CardRenderer
                  qfmt={getPreviewTemplate('front')}
                  afmt={getPreviewTemplate('back')}
                  css={selectedNotetype.css || ''}
                  fields={fields}
                  richTextFields={richTextFields}
                  side={previewSide}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
