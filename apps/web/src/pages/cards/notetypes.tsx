import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { EchoeNoteService } from '../../services/echoe-note.service';
import { ToastService } from '../../services/toast.service';
import * as echoeApi from '../../api/echoe';
import { CardRenderer } from '../../components/echoe/CardRenderer';
import {
  Plus,
  Copy,
  Trash2,
  Save,
  Edit3,
  FileText,
  Layout,
  Eye,
  X,
  PlusCircle,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import type { EchoeNoteTypeDto, EchoeTemplateDto, EchoeFieldDto } from '@echoe/dto';

export default function NoteTypesPage() {
  return <NoteTypesPageContent />;
}

interface NoteTypeWithCount extends EchoeNoteTypeDto {
  noteCount: number;
}

const NoteTypesPageContent = view(() => {
  useService(EchoeNoteService);
  const toastService = useService(ToastService);

  // State
  const [noteTypes, setNoteTypes] = useState<NoteTypeWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNoteType, setSelectedNoteType] = useState<NoteTypeWithCount | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFields, setEditFields] = useState<{ name: string }[]>([]);
  const [editTemplates, setEditTemplates] = useState<EchoeTemplateDto[]>([]);
  const [editCss, setEditCss] = useState('');
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [previewFields, setPreviewFields] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load note types on mount
  useEffect(() => {
    loadNoteTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNoteTypes = async () => {
    try {
      setLoading(true);
      const res = await echoeApi.getNoteTypes();
      if (res.code === 0) {
        setNoteTypes(res.data as NoteTypeWithCount[]);
      }
    } catch (error) {
      console.error('Failed to load note types:', error);
      toastService.error('Failed to load note types');
    } finally {
      setLoading(false);
    }
  };

  const handleClone = async (noteType: NoteTypeWithCount) => {
    try {
      const res = await echoeApi.createNoteType({
        name: `${noteType.name} (Copy)`,
        cloneFrom: noteType.id,
      });
      if (res.code === 0) {
        toastService.success('Note type cloned');
        loadNoteTypes();
      } else {
        toastService.error('Failed to clone note type');
      }
    } catch (error) {
      console.error('Failed to clone note type:', error);
      toastService.error('Failed to clone note type');
    }
  };

  const handleSelectNoteType = (noteType: NoteTypeWithCount) => {
    setSelectedNoteType(noteType);
    setIsEditing(false);
    setEditName(noteType.name);
    setEditFields(noteType.flds.map(f => ({ name: f.name })));
    setEditTemplates(noteType.tmpls);
    setEditCss(noteType.css);
    setSelectedTemplateIndex(0);

    // Initialize preview fields with sample data
    const fields: Record<string, string> = {};
    noteType.flds.forEach((f, i) => {
      if (f.name.toLowerCase() === 'front') {
        fields[f.name] = 'Sample Front Text';
      } else if (f.name.toLowerCase() === 'back') {
        fields[f.name] = 'Sample Back Text';
      } else if (f.name.toLowerCase() === 'text' || f.name.toLowerCase() === 'extra') {
        fields[f.name] = 'Sample cloze text';
      } else {
        fields[f.name] = `Sample ${f.name} ${i + 1}`;
      }
    });
    setPreviewFields(fields);
  };

  const handleCreateNew = () => {
    const newNoteType: NoteTypeWithCount = {
      id: '',
      name: 'New Note Type',
      mod: Math.floor(Date.now() / 1000),
      sortf: 0,
      did: '',
      tmpls: [{ id: '', name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}\n\n<hr>\n\n{{Back}}', bqfmt: '', bafmt: '', did: '' }],
      flds: [
        { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', mathjax: false, hidden: false },
        { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', mathjax: false, hidden: false },
      ],
      css: `.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n}`,
      type: 0,
      latexPre: '',
      latexPost: '',
      req: '[]',
      noteCount: 0,
    };
    setSelectedNoteType(newNoteType);
    setIsEditing(true);
    setEditName(newNoteType.name);
    setEditFields(newNoteType.flds.map(f => ({ name: f.name })));
    setEditTemplates(newNoteType.tmpls);
    setEditCss(newNoteType.css);
    setSelectedTemplateIndex(0);

    const fields: Record<string, string> = {};
    newNoteType.flds.forEach((f, i) => {
      fields[f.name] = i === 0 ? 'Sample Front Text' : 'Sample Back Text';
    });
    setPreviewFields(fields);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!selectedNoteType) return;

    try {
      const updateDto: Partial<EchoeNoteTypeDto> = {
        name: editName,
        flds: editFields as unknown as EchoeFieldDto[],
        css: editCss,
      };

      if (!selectedNoteType.id) {
        // Creating new note type
        const res = await echoeApi.createNoteType({
          name: editName,
          flds: editFields as unknown as EchoeFieldDto[],
          tmpls: editTemplates.map((t) => ({
            name: t.name,
            qfmt: t.qfmt,
            afmt: t.afmt,
          })) as unknown as EchoeTemplateDto[],
          css: editCss,
        });
        if (res.code === 0) {
          toastService.success('Note type created');
          loadNoteTypes();
          setIsEditing(false);
        } else {
          toastService.error('Failed to create note type');
        }
      } else {
        // Updating existing note type
        const res = await echoeApi.updateNoteType(selectedNoteType.id, updateDto);
        if (res.code === 0) {
          toastService.success('Note type saved');
          loadNoteTypes();
          setIsEditing(false);
          // Refresh selected note type
          const updated = noteTypes.find(n => n.id === selectedNoteType?.id);
          if (updated) {
            setSelectedNoteType({ ...updated, ...res.data });
          }
        } else {
          toastService.error('Failed to save note type');
        }
      }
    } catch (error) {
      console.error('Failed to save note type:', error);
      toastService.error('Failed to save note type');
    }
  };

  const handleDelete = async () => {
    if (!selectedNoteType || !selectedNoteType.id) return;

    try {
      const res = await echoeApi.deleteNoteType(selectedNoteType.id);
      if (res.code === 0 && res.data.success) {
        toastService.success('Note type deleted');
        setSelectedNoteType(null);
        setIsEditing(false);
        loadNoteTypes();
      } else {
        toastService.error('Failed to delete note type');
      }
    } catch (error) {
      console.error('Failed to delete note type:', error);
      toastService.error('Failed to delete note type');
    }
    setShowDeleteConfirm(false);
  };

  const handleAddField = () => {
    setEditFields([...editFields, { name: `Field ${editFields.length + 1}` }]);
    const newFields = { ...previewFields, [`Field ${editFields.length + 1}`]: '' };
    setPreviewFields(newFields);
  };

  const handleRemoveField = (index: number) => {
    const newFields = editFields.filter((_, i) => i !== index);
    setEditFields(newFields);
  };

  const handleFieldNameChange = (index: number, name: string) => {
    const newFields = [...editFields];
    const oldName = newFields[index].name;
    newFields[index] = { ...newFields[index], name };
    setEditFields(newFields);

    // Update preview fields
    if (previewFields[oldName] !== undefined) {
      const newPreviewFields = { ...previewFields };
      newPreviewFields[name] = newPreviewFields[oldName];
      delete newPreviewFields[oldName];
      setPreviewFields(newPreviewFields);
    }
  };

  const handleAddTemplate = () => {
    const newTemplate: EchoeTemplateDto = {
      id: '',
      name: `Card ${editTemplates.length + 1}`,
      ord: editTemplates.length,
      qfmt: '{{Front}}',
      afmt: '{{FrontSide}}\n\n<hr>\n\n{{Back}}',
      bqfmt: '',
      bafmt: '',
      did: '',
    };
    setEditTemplates([...editTemplates, newTemplate]);
    setSelectedTemplateIndex(editTemplates.length);
  };

  const handleRemoveTemplate = (index: number) => {
    if (editTemplates.length <= 1) {
      toastService.error('Cannot remove the last template');
      return;
    }
    const newTemplates = editTemplates.filter((_, i) => i !== index);
    setEditTemplates(newTemplates);
    if (selectedTemplateIndex >= newTemplates.length) {
      setSelectedTemplateIndex(newTemplates.length - 1);
    }
  };

  const handleTemplateChange = (field: 'qfmt' | 'afmt', value: string) => {
    const newTemplates = [...editTemplates];
    newTemplates[selectedTemplateIndex] = { ...newTemplates[selectedTemplateIndex], [field]: value };
    setEditTemplates(newTemplates);
  };

  const handleTemplateNameChange = (value: string) => {
    const newTemplates = [...editTemplates];
    newTemplates[selectedTemplateIndex] = { ...newTemplates[selectedTemplateIndex], name: value };
    setEditTemplates(newTemplates);
  };

  const currentTemplate = editTemplates[selectedTemplateIndex];

  return (
    <div className="h-full bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-gray-50">
      {/* Header */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Note Types</h1>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left sidebar - Note type list */}
        <div className="w-80 border-r border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">Loading...</div>
          ) : noteTypes.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No note types yet</p>
              <button
                onClick={handleCreateNew}
                className="mt-2 text-primary-600 hover:underline"
              >
                Create one
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-dark-700">
              {noteTypes.map((noteType) => (
                <div
                  key={noteType.id}
                  onClick={() => handleSelectNoteType(noteType)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-700 ${
                    selectedNoteType?.id === noteType.id
                      ? 'bg-primary-50 dark:bg-primary-900/30 border-l-4 border-primary-600'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layout className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {noteType.name}
                      </span>
                      {noteType.type === 1 && (
                        <span className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 rounded">
                          Cloze
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClone(noteType);
                      }}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-dark-600 rounded"
                      title="Clone"
                    >
                      <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {noteType.noteCount || 0} notes
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right side - Note type editor / preview */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedNoteType ? (
            <>
              {/* Toolbar */}
              <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layout className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  {isEditing ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-lg font-medium bg-transparent border-b border-gray-300 dark:border-dark-600 focus:border-primary-500 outline-none text-gray-900 dark:text-white"
                    />
                  ) : (
                    <span className="text-lg font-medium text-gray-900 dark:text-white">
                      {selectedNoteType.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          if (!selectedNoteType.id) {
                            setSelectedNoteType(null);
                          }
                        }}
                        className="px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      >
                        <Save className="w-4 h-4" />
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      {selectedNoteType.id && (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={handleEdit}
                        className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      >
                        <Edit3 className="w-4 h-4" />
                        Edit
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex">
                {/* Fields and Templates Panel */}
                <div className="w-1/2 border-r border-gray-200 dark:border-dark-700 overflow-y-auto">
                  {/* Fields Section */}
                  <div className="p-4 border-b border-gray-200 dark:border-dark-700">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-gray-900 dark:text-white">Fields</h3>
                      {isEditing && (
                        <button
                          onClick={handleAddField}
                          className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Add
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {isEditing ? (
                        editFields.map((field, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={field.name}
                              onChange={(e) => handleFieldNameChange(index, e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white text-sm"
                            />
                            <button
                              onClick={() => handleRemoveField(index)}
                              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      ) : (
                        editFields.map((field, index) => (
                          <div
                            key={index}
                            className="px-3 py-2 bg-gray-50 dark:bg-dark-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                          >
                            {field.name}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Templates Section */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-gray-900 dark:text-white">Templates</h3>
                      {isEditing && (
                        <button
                          onClick={handleAddTemplate}
                          className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Add
                        </button>
                      )}
                    </div>

                    {/* Template tabs */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {editTemplates.map((template, index) => (
                        <div key={index} className="flex items-center">
                          <button
                            onClick={() => setSelectedTemplateIndex(index)}
                            className={`px-3 py-1.5 text-sm rounded-lg ${
                              selectedTemplateIndex === index
                                ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-700'
                            }`}
                          >
                            {template.name}
                          </button>
                          {isEditing && editTemplates.length > 1 && (
                            <button
                              onClick={() => handleRemoveTemplate(index)}
                              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {currentTemplate && (
                      <div className="space-y-3">
                        {isEditing ? (
                          <>
                            <div>
                              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                                Name
                              </label>
                              <input
                                type="text"
                                value={currentTemplate.name}
                                onChange={(e) => handleTemplateNameChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                                Front Template
                              </label>
                              <textarea
                                value={currentTemplate.qfmt}
                                onChange={(e) => handleTemplateChange('qfmt', e.target.value)}
                                rows={4}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white text-sm font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                                Back Template
                              </label>
                              <textarea
                                value={currentTemplate.afmt}
                                onChange={(e) => handleTemplateChange('afmt', e.target.value)}
                                rows={4}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white text-sm font-mono"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Front</div>
                              <pre className="p-3 bg-gray-50 dark:bg-dark-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
                                {currentTemplate.qfmt}
                              </pre>
                            </div>
                            <div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Back</div>
                              <pre className="p-3 bg-gray-50 dark:bg-dark-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
                                {currentTemplate.afmt}
                              </pre>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* CSS */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm text-gray-600 dark:text-gray-400">Styling</label>
                      </div>
                      {isEditing ? (
                        <textarea
                          value={editCss}
                          onChange={(e) => setEditCss(e.target.value)}
                          rows={6}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white text-sm font-mono"
                        />
                      ) : (
                        <pre className="p-3 bg-gray-50 dark:bg-dark-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
                          {editCss}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>

                {/* Preview Panel */}
                <div className="w-1/2 bg-gray-100 dark:bg-dark-900 overflow-y-auto">
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Eye className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      <h3 className="font-medium text-gray-900 dark:text-white">Preview</h3>
                    </div>

                    {isEditing && (
                      <div className="mb-4 space-y-2">
                        <div className="text-sm text-gray-600 dark:text-gray-400">Sample Values</div>
                        {editFields.map((field, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <label className="w-20 text-sm text-gray-500 dark:text-gray-400">
                              {field.name}
                            </label>
                            <input
                              type="text"
                              value={previewFields[field.name] || ''}
                              onChange={(e) =>
                                setPreviewFields({ ...previewFields, [field.name]: e.target.value })
                              }
                              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-white text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Card Preview */}
                    <div className="space-y-4">
                      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 dark:bg-dark-700 border-b border-gray-200 dark:border-dark-600">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                            {currentTemplate?.name || 'Card'} - Front
                          </span>
                        </div>
                        <div className="p-4">
                          <CardRenderer
                            qfmt={currentTemplate?.qfmt || ''}
                            afmt={''}
                            css={editCss}
                            fields={previewFields}
                            side="front"
                          />
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <ChevronRight className="w-6 h-6 text-gray-400 dark:text-gray-500 rotate-90" />
                      </div>

                      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 dark:bg-dark-700 border-b border-gray-200 dark:border-dark-600">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                            {currentTemplate?.name || 'Card'} - Back
                          </span>
                        </div>
                        <div className="p-4">
                          <CardRenderer
                            qfmt={currentTemplate?.qfmt || ''}
                            afmt={currentTemplate?.afmt || ''}
                            css={editCss}
                            fields={previewFields}
                            side="back"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <Layout className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Select a note type to view or edit</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Note Type
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {selectedNoteType && selectedNoteType.noteCount && selectedNoteType.noteCount > 0 ? (
                <>
                  Cannot delete <strong>{selectedNoteType.name}</strong> because{' '}
                  <strong>{selectedNoteType.noteCount} notes</strong> are using this note type.
                  <br />
                  <br />
                  Please delete those notes first or move them to another note type.
                </>
              ) : (
                <>
                  Are you sure you want to delete <strong>{selectedNoteType?.name}</strong>?
                  This action cannot be undone.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
              >
                Cancel
              </button>
              {selectedNoteType && (!selectedNoteType.noteCount || selectedNoteType.noteCount === 0) && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
