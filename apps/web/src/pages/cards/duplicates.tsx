import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ToastService } from '../../services/toast.service';
import * as echoeApi from '../../api/echoe';
import type { EchoeNoteTypeDto, FindDuplicatesDto, DuplicateGroupDto } from '@echoe/dto';
import {
  ArrowLeft,
  Search,
  Trash2,
  Copy,
  AlertTriangle,
} from 'lucide-react';

export default function DuplicatesPage() {
  return <DuplicatesPageContent />;
}

interface NoteTypeWithCount extends EchoeNoteTypeDto {
  noteCount: number;
}

const DuplicatesPageContent = view(() => {
  const toastService = useService(ToastService);
  const navigate = useNavigate();

  // State
  const [noteTypes, setNoteTypes] = useState<NoteTypeWithCount[]>([]);
  const [loadingNoteTypes, setLoadingNoteTypes] = useState(true);
  const [selectedNoteTypeId, setSelectedNoteTypeId] = useState<number | null>(null);
  const [selectedFieldName, setSelectedFieldName] = useState<string>('');
  const [threshold, setThreshold] = useState(1.0);
  const [isSearching, setIsSearching] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroupDto[]>([]);
  const [selectedToKeep, setSelectedToKeep] = useState<Record<number, number>>({});
  const [isDeleting, setIsDeleting] = useState(false);

  // Load note types on mount
  useEffect(() => {
    loadNoteTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNoteTypes = async () => {
    try {
      setLoadingNoteTypes(true);
      const res = await echoeApi.getNoteTypes();
      if (res.code === 0) {
        setNoteTypes(res.data as NoteTypeWithCount[]);
        // Auto-select first note type if available
        if (res.data.length > 0) {
          const firstNoteType = res.data[0] as NoteTypeWithCount;
          setSelectedNoteTypeId(firstNoteType.id);
          if (firstNoteType.flds.length > 0) {
            setSelectedFieldName(firstNoteType.flds[0].name);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load note types:', error);
      toastService.error('Failed to load note types');
    } finally {
      setLoadingNoteTypes(false);
    }
  };

  // Update field selection when note type changes
  useEffect(() => {
    if (selectedNoteTypeId) {
      const noteType = noteTypes.find((nt) => nt.id === selectedNoteTypeId);
      if (noteType && noteType.flds.length > 0) {
        setSelectedFieldName(noteType.flds[0].name);
      }
    }
  }, [selectedNoteTypeId, noteTypes]);

  // Handle find duplicates
  const handleFindDuplicates = async () => {
    if (!selectedNoteTypeId || !selectedFieldName) {
      toastService.error('Please select a note type and field');
      return;
    }

    try {
      setIsSearching(true);
      setDuplicateGroups([]);
      setSelectedToKeep({});

      const dto: FindDuplicatesDto = {
        notetypeId: selectedNoteTypeId,
        fieldName: selectedFieldName,
        threshold: threshold,
      };

      const res = await echoeApi.findDuplicates(dto);
      if (res.code === 0) {
        setDuplicateGroups(res.data);
        if (res.data.length === 0) {
          toastService.success('No duplicates found');
        } else {
          toastService.success(`Found ${res.data.length} duplicate groups`);
        }
      } else {
        toastService.error('Failed to find duplicates');
      }
    } catch (error) {
      console.error('Failed to find duplicates:', error);
      toastService.error('Failed to find duplicates');
    } finally {
      setIsSearching(false);
    }
  };

  // Handle merge (delete selected duplicates)
  const handleMergeDuplicates = async (groupIndex: number) => {
    const group = duplicateGroups[groupIndex];
    const keepId = selectedToKeep[groupIndex];

    if (!keepId) {
      toastService.error('Please select which note to keep');
      return;
    }

    const deleteIds = group.notes
      .filter((n) => n.id !== keepId)
      .map((n) => n.id);

    if (deleteIds.length === 0) {
      toastService.error('No notes to delete');
      return;
    }

    if (!confirm(`Delete ${deleteIds.length} note(s) and keep note ${keepId}?`)) {
      return;
    }

    try {
      setIsDeleting(true);
      const res = await echoeApi.mergeDuplicates({ keepId, deleteIds });
      if (res.code === 0) {
        toastService.success('Duplicates merged successfully');
        // Remove the group from results
        const newGroups = [...duplicateGroups];
        newGroups.splice(groupIndex, 1);
        setDuplicateGroups(newGroups);
        // Clear selection for this group
        const newSelected = { ...selectedToKeep };
        delete newSelected[groupIndex];
        setSelectedToKeep(newSelected);
      } else {
        toastService.error('Failed to merge duplicates');
      }
    } catch (error) {
      console.error('Failed to merge duplicates:', error);
      toastService.error('Failed to merge duplicates');
    } finally {
      setIsDeleting(false);
    }
  };

  // Get selected note type
  const selectedNoteType = noteTypes.find((nt) => nt.id === selectedNoteTypeId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/cards')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Duplicate Detection</h1>
        </div>
      </div>

      {/* Search Form */}
      <div className="p-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Note Type Select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Note Type
              </label>
              <select
                value={selectedNoteTypeId || ''}
                onChange={(e) => setSelectedNoteTypeId(Number(e.target.value))}
                disabled={loadingNoteTypes}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {loadingNoteTypes ? (
                  <option>Loading...</option>
                ) : (
                  noteTypes.map((nt) => (
                    <option key={nt.id} value={nt.id}>
                      {nt.name} ({(nt as NoteTypeWithCount).noteCount || 0} notes)
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Field Select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Field to Check
              </label>
              <select
                value={selectedFieldName}
                onChange={(e) => setSelectedFieldName(e.target.value)}
                disabled={!selectedNoteType}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {selectedNoteType?.flds.map((field) => (
                  <option key={field.name} value={field.name}>
                    {field.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Similarity Threshold: {threshold === 1.0 ? 'Exact Match' : `${(threshold * 100).toFixed(0)}%`}
              </label>
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>50%</span>
                <span>75%</span>
                <span>Exact (100%)</span>
              </div>
            </div>
          </div>

          {/* Search Button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleFindDuplicates}
              disabled={isSearching || !selectedNoteTypeId || !selectedFieldName}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Search className="w-4 h-4" />
              {isSearching ? 'Searching...' : 'Find Duplicates'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="px-4 pb-4">
        {duplicateGroups.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
            <Copy className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              Select a note type and field, then click "Find Duplicates" to search for duplicate notes.
            </p>
            {threshold < 1.0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Using fuzzy matching ({(threshold * 100).toFixed(0)}% similarity)
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {duplicateGroups.map((group, groupIndex) => (
              <div
                key={groupIndex}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      Duplicate Group {groupIndex + 1}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({group.notes.length} notes)
                    </span>
                  </div>
                  <button
                    onClick={() => handleMergeDuplicates(groupIndex)}
                    disabled={isDeleting || !selectedToKeep[groupIndex]}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Others
                  </button>
                </div>

                {/* Notes in this group */}
                <div className="space-y-2">
                  {group.notes.map((note) => (
                    <div
                      key={note.id}
                      className={`flex items-start gap-3 p-3 border rounded-lg transition-colors ${
                        selectedToKeep[groupIndex] === note.id
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`keep-${groupIndex}`}
                        checked={selectedToKeep[groupIndex] === note.id}
                        onChange={() =>
                          setSelectedToKeep({
                            ...selectedToKeep,
                            [groupIndex]: note.id,
                          })
                        }
                        className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            Note ID: {note.id}
                          </span>
                          {selectedToKeep[groupIndex] === note.id && (
                            <span className="text-xs text-green-600 dark:text-green-400">
                              (Keeping)
                            </span>
                          )}
                        </div>
                        {/* Show field value */}
                        {note.fields && typeof note.fields === 'object' && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {selectedFieldName}:{' '}
                            <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">
                              {note.fields[selectedFieldName] || '(empty)'}
                            </span>
                          </div>
                        )}
                        {/* Show tags if any */}
                        {note.tags && note.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {note.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
