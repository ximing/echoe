import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { EchoeNoteService } from '../../services/echoe-note.service';
import { EchoeDeckService } from '../../services/echoe-deck.service';
import { ToastService } from '../../services/toast.service';
import { CardRenderer } from '../../components/echoe/CardRenderer';
import { RichTextEditor } from '../../components/echoe/RichTextEditor';
import {
  Save,
  Eye,
  EyeOff,
  X,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Image,
} from 'lucide-react';
import type { EchoeNoteTypeDto, EchoeDeckWithCountsDto } from '@echoe/dto';

interface CardEditorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selected deck ID */
  deckId?: string;
  /** Pre-selected notetype ID */
  notetypeId?: string;
  /** Note ID to edit (when provided, drawer is in edit mode) */
  noteId?: string;
  /** Callback when card is saved successfully */
  onSaved?: () => void;
}

export function CardEditorDrawer({ isOpen, onClose, deckId, notetypeId, noteId, onSaved }: CardEditorDrawerProps) {
  return (
    <CardEditorDrawerContent
      isOpen={isOpen}
      onClose={onClose}
      deckId={deckId}
      notetypeId={notetypeId}
      noteId={noteId}
      onSaved={onSaved}
    />
  );
}

const CardEditorDrawerContent = view(({ isOpen, onClose, deckId, notetypeId, noteId, onSaved }: CardEditorDrawerProps) => {
  const noteService = useService(EchoeNoteService);
  const deckService = useService(EchoeDeckService);
  const toastService = useService(ToastService);

  const isEditMode = !!noteId;

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

  // Get preview template for CardRenderer
  const getPreviewTemplate = (side: 'front' | 'back') => {
    if (!selectedNotetype || !selectedNotetype.tmpls || selectedNotetype.tmpls.length === 0) {
      return side === 'front' ? '{{Front}}' : '{{FrontSide}}<hr id="answer">{{Back}}';
    }
    const template = selectedNotetype.tmpls[0];
    return side === 'front' ? template.qfmt : template.afmt;
  };

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      noteService.clearCurrentNote();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data on mount
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      await Promise.all([
        noteService.loadNoteTypes(),
        deckService.loadDecks(),
      ]);
      if (noteId) {
        await noteService.loadNote(noteId);
      }
      setIsDataLoaded(true);
    };
    loadData();
  }, [isOpen, noteId, noteService, deckService]);

  // Set initial values when data is loaded
  useEffect(() => {
    if (!isOpen || !isDataLoaded || isInitialized) return;

    if (noteId && noteService.currentNote) {
      // Edit mode: load existing note data
      const note = noteService.currentNote;
      const nt = noteService.getNoteTypeById(note.mid);
      if (nt) {
        setSelectedNotetype(nt);
      }
      setFields(note.fields || {});
      setRichTextFields(note.richTextFields || {});
      setTags(note.tags || []);

      // Note: deck is not stored in note, use deckId from prop instead
      // Find deck from prop
      if (deckId) {
        const deck = deckService.decks.find((d) => d.deckId === deckId);
        if (deck) {
          setSelectedDeck(deck);
        }
      }
    } else {
      // Create mode: use defaults
      // Set notetype from prop or default
      if (notetypeId) {
        const nt = noteService.noteTypes.find((n) => n.id === notetypeId);
        if (nt) {
          setSelectedNotetype(nt);
        }
      } else if (noteService.noteTypes.length > 0) {
        const defaultNt = noteService.noteTypes.find((nt) => nt.name === 'Basic') || noteService.noteTypes[0];
        setSelectedNotetype(defaultNt);
      }

      // Set deck from prop or default
      if (deckId) {
        const deck = deckService.decks.find((d) => d.deckId === deckId);
        if (deck) {
          setSelectedDeck(deck);
        }
      } else if (deckService.decks.length > 0) {
        const defaultDeck = deckService.decks.find((d) => d.name === 'Default') || deckService.decks[0];
        setSelectedDeck(defaultDeck);
      }
    }

    setIsInitialized(true);
  }, [isOpen, isDataLoaded, noteId, noteService, deckService.decks, notetypeId, deckId, isInitialized]);

  // Initialize fields when notetype is set
  useEffect(() => {
    if (!isOpen || !selectedNotetype || !isInitialized) return;

    const initialFields: Record<string, string> = {};
    if (selectedNotetype?.flds) {
      selectedNotetype.flds.forEach((fld) => {
        initialFields[fld.name] = fields[fld.name] || '';
      });
    }
    setFields(initialFields);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedNotetype, isInitialized]);

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

  // Handle rich text editor content change
  const handleRichTextChange = (fieldName: string, json: Record<string, unknown>) => {
    setRichTextFields((prev) => ({
      ...prev,
      [fieldName]: json,
    }));
  };

  // Add tag
  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  // Remove tag
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Check whether a rich text JSON node contains meaningful content
  const hasRichTextContent = (node: Record<string, unknown> | undefined): boolean => {
    if (!node || typeof node !== 'object') {
      return false;
    }

    if (typeof node.text === 'string' && node.text.trim() !== '') {
      return true;
    }

    if (node.type === 'image') {
      const attrs = node.attrs as { src?: string } | undefined;
      if (typeof attrs?.src === 'string' && attrs.src.trim() !== '') {
        return true;
      }
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

  // Empty ProseMirror document used for fields not yet edited in rich text mode
  const EMPTY_PROSEMIRROR_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

  // Build complete richTextFields ensuring all notetype field keys are present.
  const buildCompleteRichTextFields = (): Record<string, Record<string, unknown>> => {
    if (!selectedNotetype) return richTextFields;
    const complete: Record<string, Record<string, unknown>> = {};
    for (const fld of selectedNotetype.flds) {
      if (showSourceMode[fld.ord]) {
        continue;
      }
      complete[fld.name] = richTextFields[fld.name] ?? EMPTY_PROSEMIRROR_DOC;
    }
    return complete;
  };

  // Save note
  const handleSave = async () => {
    if (!selectedNotetype) {
      toastService.error('Please select a note type');
      return;
    }

    if (!isEditMode && !selectedDeck?.deckId) {
      toastService.error('Please select a deck');
      return;
    }

    // Check required fields - Front and Back are always required
    const requiredFieldNames = ['Front', 'Back'];
    const requiredFields = selectedNotetype.flds.filter((f) => requiredFieldNames.includes(f.name));
    for (const field of requiredFields) {
      if (!hasFieldContent(field.name)) {
        toastService.error(`Field "${field.name}" is required`);
        return;
      }
    }

    try {
      setIsSaving(true);

      const completeRichTextFields = buildCompleteRichTextFields();

      if (isEditMode && noteId) {
        // Update existing note
        const success = await noteService.updateExistingNote(noteId, {
          fields,
          tags,
          richTextFields: completeRichTextFields,
        });
        if (success) {
          toastService.success('Card updated successfully');
          onSaved?.();
        } else {
          toastService.error(noteService.error || 'Failed to update card');
        }
      } else {
        // Create new note
        await noteService.createNewNote({
          notetypeId: selectedNotetype.id,
          deckId: selectedDeck?.deckId || '',
          fields,
          richTextFields: completeRichTextFields,
          tags,
        });

        toastService.success('Card created successfully');
        onSaved?.();

        // Reset form for new card
        setFields({});
        setRichTextFields({});
        setTags([]);
        setIsInitialized(false);

        // Reinitialize
        setTimeout(() => {
          const nt = notetypeId
            ? noteService.noteTypes.find((n) => n.id === notetypeId)
            : noteService.noteTypes[0];
          if (nt) {
            setSelectedNotetype(nt);
            const initialFields: Record<string, string> = {};
            nt.flds.forEach((fld) => {
              initialFields[fld.name] = '';
            });
            setFields(initialFields);
          }

          const deck = deckId
            ? deckService.decks.find((d) => d.deckId === deckId)
            : deckService.decks[0];
          if (deck) {
            setSelectedDeck(deck);
          }
          setIsInitialized(true);
        }, 100);
      }
    } catch (error) {
      console.error('Failed to save card:', error);
      toastService.error('Failed to save card');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // Show loading state while data loads
  if (!isDataLoaded || (isEditMode && !noteService.currentNote && noteService.isLoading)) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
        <div className="fixed right-0 top-0 bottom-0 w-[600px] bg-white dark:bg-dark-800 border-l border-gray-200 dark:border-dark-700 z-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[600px] bg-white dark:bg-dark-800 border-l border-gray-200 dark:border-dark-700 z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditMode ? '编辑卡片' : '新建卡片'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Deck & Notetype Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                卡组
              </label>
              <select
                value={selectedDeck?.deckId || ''}
                onChange={(e) => handleDeckChange(e.target.value)}
                disabled={isEditMode}
                className="w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deckService.decks.map((deck) => (
                  <option key={deck.deckId} value={deck.deckId}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                笔记类型
              </label>
              <select
                value={selectedNotetype?.id || ''}
                onChange={(e) => handleNotetypeChange(e.target.value)}
                disabled={isEditMode}
                className="w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {noteService.noteTypes.map((nt) => (
                  <option key={nt.id} value={nt.id}>
                    {nt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fields */}
          {selectedNotetype?.flds.map((field) => {
            const isSourceMode = showSourceMode[field.ord] || false;
            const isCloze = selectedNotetype?.type === 1 && field.name.toLowerCase() === 'text';
            return (
              <div key={field.name}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {field.name}
                    {field.description && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">- {field.description}</span>
                    )}
                    {(field.name === 'Front' || field.name === 'Back') && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <div className="flex items-center gap-1">
                    {/* Source mode toggle */}
                    <button
                      onClick={() => setShowSourceMode((prev) => ({ ...prev, [field.ord]: !prev[field.ord] }))}
                      className={`p-1 rounded ${
                        isSourceMode
                          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                          : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-700'
                      }`}
                      title={isSourceMode ? 'Switch to Rich Text Editor' : 'Switch to HTML Source'}
                    >
                      {isSourceMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                {isSourceMode ? (
                  <div>
                    <textarea
                      id={`field-${field.name}`}
                      value={fields[field.name] || ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      placeholder={`Enter ${field.name}...`}
                      className="w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                      rows={4}
                    />
                    {/* Formatting toolbar for source mode */}
                    <div className="flex items-center gap-1 mt-1.5">
                      <button
                        type="button"
                        onClick={() => applyFormatting(field.name, 'bold')}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
                        title="Bold"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting(field.name, 'italic')}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
                        title="Italic"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting(field.name, 'underline')}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
                        title="Underline"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting(field.name, 'strike')}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
                        title="Strikethrough"
                      >
                        <Strikethrough className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting(field.name, 'code')}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
                        title="Code"
                      >
                        <Code className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleImageUpload(field.name)}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700 rounded"
                        title="Insert Image"
                      >
                        <Image className="w-3.5 h-3.5" />
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
                    </div>
                    {isCloze && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Use {'{{c1::text}}'} for cloze deletion. Use {'{{c1::text::hint}}'} for hint.
                      </p>
                    )}
                  </div>
                ) : (
                  <RichTextEditor
                    content={richTextFields[field.name] || fields[field.name] || ''}
                    onChange={(_html, json) => handleRichTextChange(field.name, json)}
                    placeholder={`Enter ${field.name}...`}
                    minHeight="100px"
                  />
                )}
              </div>
            );
          })}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              标签
            </label>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 text-xs rounded"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                placeholder="Add tag..."
                className="flex-1 px-3 py-1.5 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleAddTag}
                className="px-3 py-1.5 bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600"
              >
                添加
              </button>
            </div>
          </div>

          {/* Preview */}
          {selectedNotetype && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  预览
                </label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPreviewSide('front')}
                    className={`px-2 py-1 text-xs rounded ${
                      previewSide === 'front'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Front
                  </button>
                  <button
                    onClick={() => setPreviewSide('back')}
                    className={`px-2 py-1 text-xs rounded ${
                      previewSide === 'back'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Back
                  </button>
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-dark-700 rounded-lg min-h-[100px]">
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-dark-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !selectedNotetype || !selectedDeck}
            className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <Save className="w-4 h-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
});
