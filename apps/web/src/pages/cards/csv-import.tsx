import { view, useService } from '@rabjs/react';
import { useEffect, useState, useRef } from 'react';
import { ToastService } from '../../services/toast.service';
import { EchoeCsvImportService } from '../../services/echoe-csv-import.service';
import { EchoeNoteService } from '../../services/echoe-note.service';
import { EchoeDeckService } from '../../services/echoe-deck.service';
import { ApkgParserService } from '../../services/apkg-parser.service';
import * as echoeApi from '../../api/echoe';
import type { ImportResultDto, CreateEchoeNoteDto } from '@echoe/dto';
import {
  Upload,
  FileText,
  Check,
  X,
  ChevronDown,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  FileArchive,
} from 'lucide-react';

/**
 * Convert plain text to TipTap JSON format
 */
function convertPlainTextToTipTapJson(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text,
          },
        ],
      },
    ],
  };
}

export default function CsvImportPage() {
  return <CsvImportPageContent />;
}

const CsvImportPageContent = view(() => {
  const toastService = useService(ToastService);
  const csvImportService = useService(EchoeCsvImportService);
  const noteTypeService = useService(EchoeNoteService);
  const deckService = useService(EchoeDeckService);
  const apkgParserService = useService(ApkgParserService);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Import type: 'csv' or 'apkg'
  const [importType, setImportType] = useState<'csv' | 'apkg'>('csv');

  // APKG Import state
  const [apkgFile, setApkgFile] = useState<File | null>(null);
  const [apkgResult, setApkgResult] = useState<ImportResultDto | null>(null);
  const [isApkgImporting, setIsApkgImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [apkgDeckId, setApkgDeckId] = useState<string>('');

  // Progress state for APKG import
  const [apkgProgress, setApkgProgress] = useState<{ current: number; total: number } | null>(null);

  // Load note types and decks
  useEffect(() => {
    noteTypeService.loadNoteTypes();
    deckService.loadDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle file selection (CSV)
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.csv', '.tsv', '.txt'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!validExtensions.includes(ext)) {
      toastService.error('请选择 .csv、.tsv 或 .txt 文件');
      return;
    }

    setSelectedFile(file);
    await csvImportService.loadPreview(file);
  };

  // Handle column mapping change
  const handleColumnChange = (columnIndex: number, field: string) => {
    csvImportService.setColumnMapping(columnIndex, field);
  };

  // Handle CSV import
  const handleImport = async () => {
    if (!selectedFile) {
      toastService.error('请先选择一个文件');
      return;
    }

    const success = await csvImportService.executeImport(selectedFile);
    if (success) {
      toastService.success('导入成功');
    } else if (csvImportService.error) {
      toastService.error(csvImportService.error);
    }
  };

  // Handle reset
  const handleReset = () => {
    setSelectedFile(null);
    csvImportService.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // APKG file validation
  const validateApkgFile = (file: File): boolean => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (ext !== '.apkg') {
      toastService.error('请选择 .apkg 文件');
      return false;
    }
    return true;
  };

  // Handle APKG file selection
  const handleApkgFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && validateApkgFile(file)) {
      setApkgFile(file);
      setApkgResult(null);
    }
  };

  // Handle APKG drag events
  const handleApkgDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleApkgDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleApkgDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleApkgDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && validateApkgFile(file)) {
      setApkgFile(file);
      setApkgResult(null);
    }
  };

  // Handle APKG import - use frontend parser (ApkgParserService)
  const handleApkgImport = async () => {
    if (!apkgFile) {
      toastService.error('请先选择一个文件');
      return;
    }

    setIsApkgImporting(true);
    try {
      // Parse APKG file using frontend ApkgParserService
      const parseSuccess = await apkgParserService.parseApkgFile(apkgFile);
      if (!parseSuccess) {
        const errorMessage = apkgParserService.error || '解析 APKG 文件失败';
        toastService.error(errorMessage);
        setApkgResult({
          notesAdded: 0,
          notesUpdated: 0,
          notesSkipped: 0,
          cardsAdded: 0,
          cardsUpdated: 0,
          decksAdded: 0,
          notetypesAdded: 0,
          revlogImported: 0,
          mediaImported: 0,
          errors: [errorMessage],
          errorDetails: [{ category: 'general', message: errorMessage }],
        });
        setIsApkgImporting(false);
        return;
      }

      // Get parsed data
      const { notes, models } = apkgParserService;

      // Get note types and decks from service
      const noteTypes = noteTypeService.noteTypes || [];
      const echoeDecks = deckService.decks || [];

      // Create or find a basic note type for import
      let notetypeId: string;
      if (noteTypes.length > 0) {
        notetypeId = noteTypes[0].id;
      } else {
        // Need at least one note type
        toastService.error('请先创建一个笔记类型');
        setIsApkgImporting(false);
        return;
      }

      // Find or create deck - use user selected deck or first available
      let deckId: string;
      if (apkgDeckId) {
        deckId = apkgDeckId;
      } else if (echoeDecks.length > 0) {
        deckId = echoeDecks[0].id;
      } else {
        toastService.error('请先创建一个卡组');
        setIsApkgImporting(false);
        return;
      }

      // Import notes - batch import every 50 notes with progress tracking
      let notesAdded = 0;
      let notesSkipped = 0;
      const errors: string[] = [];
      const BATCH_SIZE = 50;

      // Set initial progress
      setApkgProgress({ current: 0, total: notes.length });

      for (let i = 0; i < notes.length; i += BATCH_SIZE) {
        const batch = notes.slice(i, i + BATCH_SIZE);
        const batchNotes: CreateEchoeNoteDto[] = [];

        // Process batch
        for (const note of batch) {
          try {
            // Parse Anki fields (0x1f separator)
            const fields = note.flds.split('\x1f');

            // Get the model for this note to map fields
            const model = models.find(m => m.id === note.mid);
            if (!model) {
              notesSkipped++;
              continue;
            }

            // Build field map
            const fieldMap: Record<string, string> = {};
            const richTextFields: Record<string, Record<string, unknown>> = {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            model.flds.forEach((fld: any, index: number) => {
              if (index < fields.length) {
                const value = fields[index];
                fieldMap[fld.name] = value;
                // Convert plain text to TipTap JSON format for rich text fields
                richTextFields[fld.name] = convertPlainTextToTipTapJson(value);
              }
            });

            // Parse tags
            const tags = note.tags ? note.tags.split(' ').filter(t => t) : [];

            // Create note DTO with rich text fields
            batchNotes.push({
              notetypeId,
              deckId,
              fields: fieldMap,
              tags,
              richTextFields,
            });
          } catch (e) {
            notesSkipped++;
            const err = e as Error;
            if (err.message) {
              errors.push(`Note ${note.id}: ${err.message}`);
            }
          }
        }

        // Batch create notes
        if (batchNotes.length > 0) {
          try {
            // Use batch API for better performance
            const response = await echoeApi.createNotesBatch({ notes: batchNotes });
            notesAdded += response.data.length;
          } catch (e) {
            const err = e as Error;
            errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message || 'Batch import failed'}`);
          }
        }

        // Update progress
        setApkgProgress({ current: Math.min(i + BATCH_SIZE, notes.length), total: notes.length });
      }

      const result: ImportResultDto = {
        notesAdded,
        notesUpdated: 0,
        notesSkipped,
        cardsAdded: notesAdded, // Each note creates one card
        cardsUpdated: 0,
        decksAdded: 0,
        notetypesAdded: 0,
        revlogImported: 0,
        mediaImported: 0,
        errors,
        errorDetails: errors.length > 0
          ? [{ category: 'general', message: `${errors.length} notes failed to import` }]
          : [],
      };

      setApkgResult(result);

      if (notesAdded > 0) {
        toastService.success(`成功导入 ${notesAdded} 张卡片`);
      }
      if (notesSkipped > 0) {
        toastService.warning(`${notesSkipped} 张卡片导入失败`);
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      const errorMessage = err.message || '导入失败';
      toastService.error(errorMessage);
      setApkgResult({
        notesAdded: 0,
        notesUpdated: 0,
        notesSkipped: 0,
        cardsAdded: 0,
        cardsUpdated: 0,
        decksAdded: 0,
        notetypesAdded: 0,
        revlogImported: 0,
        mediaImported: 0,
        errors: [errorMessage],
        errorDetails: [{ category: 'general', message: errorMessage }],
      });
    } finally {
      setIsApkgImporting(false);
    }
  };

  // Reset APKG import
  const handleApkgReset = () => {
    setApkgFile(null);
    setApkgResult(null);
    setApkgDeckId('');
    setApkgProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const preview = csvImportService.preview;
  const importResult = csvImportService.importResult;
  const isLoading = csvImportService.isLoading;
  const isImporting = csvImportService.isImporting;

  // Field options for column mapping
  const fieldOptions = ['Front', 'Back', 'Tags', 'Ignore'];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">导入数据</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">从 CSV 或 APKG 文件导入卡片</p>
      </div>

      {/* Import Type Tabs */}
      <div className="bg-white dark:bg-dark-800 rounded-lg p-1 flex">
        <button
          onClick={() => {
            setImportType('csv');
            handleReset();
            handleApkgReset();
          }}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            importType === 'csv'
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          CSV/TSV 导入
        </button>
        <button
          onClick={() => {
            setImportType('apkg');
            handleReset();
            handleApkgReset();
          }}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            importType === 'apkg'
              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          APKG 导入
        </button>
      </div>

      {/* CSV Import Section */}
      {importType === 'csv' && (
        <div className="space-y-6">
          {/* CSV Import Result */}
          {importResult && (
            <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                    导入完成
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    卡片已成功导入
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {importResult.added}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">新增</div>
                </div>
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                    {importResult.updated}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">更新</div>
                </div>
                <div className="bg-gray-50 dark:bg-dark-700/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                    {importResult.skipped}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">跳过</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium">{importResult.errors.length} 个错误</span>
                  </div>
                  <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>
                        Row {err.row}: {err.reason}
                      </li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li>...还有 {importResult.errors.length - 5} 个错误</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  继续导入
                </button>
              </div>
            </div>
          )}

          {/* CSV File Upload */}
          {!importResult && (
            <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
                第一步：选择文件
              </h2>

              {!preview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-dark-700 rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors"
                >
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-300 mb-2">
                    点击选择 CSV 或 TSV 文件
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    支持 .csv、.tsv 和 .txt 文件
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="mb-6">
                  <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                    <FileText className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        {selectedFile?.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {preview.detectedEncoding} 编码, {preview.detectedDelimiter === '\t' ? 'Tab' : preview.detectedDelimiter} 分隔符, {preview.totalRows} 行
                      </p>
                    </div>
                    <button
                      onClick={handleReset}
                      className="p-2 hover:bg-gray-200 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Column Mapping */}
          {preview && !importResult && (
            <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
                第二步：映射列
              </h2>

              {/* Header row checkbox */}
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasHeader"
                  checked={csvImportService.hasHeader}
                  onChange={(e) => csvImportService.setHasHeader(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-dark-700 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="hasHeader" className="text-gray-700 dark:text-gray-300">
                  第一行是表头
                </label>
              </div>

              {/* Column mapping table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-dark-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                        列
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                        示例数据
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                        映射到
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.length > 0 &&
                      (csvImportService.hasHeader ? [preview.rows[0]] : preview.rows.slice(0, 3)).map((row, rowIdx) =>
                        row.map((cell, colIdx) => (
                          <tr
                            key={`${rowIdx}-${colIdx}`}
                            className="border-b border-gray-100 dark:border-dark-700"
                          >
                            <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-50">
                              列 {colIdx + 1}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">
                              {cell}
                            </td>
                            <td className="py-3 px-4">
                              <div className="relative">
                                <select
                                  value={csvImportService.columnMapping[colIdx] || 'Ignore'}
                                  onChange={(e) => handleColumnChange(colIdx, e.target.value)}
                                  className="appearance-none w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-dark-700 rounded-lg text-sm text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                  {fieldOptions.map((field) => (
                                    <option key={field} value={field}>
                                      {field}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Target Options */}
          {preview && !importResult && (
            <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
                第三步：选择目标
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {/* Deck Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    卡组
                  </label>
                  <div className="relative">
                    <select
                      value={csvImportService.selectedDeckId || ''}
                      onChange={(e) =>
                        csvImportService.setDeckId(e.target.value || '')
                      }
                      className="appearance-none w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-dark-700 rounded-lg text-sm text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">选择卡组...</option>
                      {deckService.decks.map((deck) => (
                        <option key={deck.id} value={deck.id}>
                          {deck.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Note Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    笔记类型
                  </label>
                  <div className="relative">
                    <select
                      value={csvImportService.selectedNotetypeId || ''}
                      onChange={(e) =>
                        csvImportService.setNotetypeId(
                          e.target.value || ''
                        )
                      }
                      className="appearance-none w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-dark-700 rounded-lg text-sm text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">选择笔记类型...</option>
                      {noteTypeService.noteTypes.map((nt) => (
                        <option key={nt.id} value={nt.id}>
                          {nt.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Import Button */}
          {preview && !importResult && (
            <div className="flex justify-end">
              <button
                onClick={handleImport}
                disabled={
                  !csvImportService.selectedDeckId ||
                  !csvImportService.selectedNotetypeId ||
                  isImporting
                }
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-dark-600 disabled:cursor-not-allowed transition-colors"
              >
                {isImporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    导入卡片
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-dark-800 rounded-lg p-6 flex items-center gap-4">
                <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-900 dark:text-gray-50">分析文件中...</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* APKG Import Section */}
      {importType === 'apkg' && (
        <div className="space-y-6">
          {/* APKG Import Result */}
          {apkgResult && (
            <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                    导入完成
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    卡片已成功导入
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {apkgResult.notesAdded}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">笔记新增</div>
                </div>
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                    {apkgResult.notesUpdated}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">笔记更新</div>
                </div>
                <div className="bg-gray-50 dark:bg-dark-700/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                    {apkgResult.notesSkipped}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">笔记跳过</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {apkgResult.cardsAdded}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">卡片新增</div>
                </div>
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                    {apkgResult.cardsUpdated}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">卡片更新</div>
                </div>
                <div className="bg-gray-50 dark:bg-dark-700/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                    {apkgResult.decksAdded}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">卡组新增</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {apkgResult.notetypesAdded}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">笔记类型新增</div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {apkgResult.mediaImported}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">媒体导入</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {apkgResult.revlogImported}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">学习记录</div>
                </div>
              </div>

              {apkgResult.errors.length > 0 && (
                <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 mb-3">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-semibold">
                      发现 {apkgResult.errors.length} 个问题
                    </span>
                  </div>

                  {apkgResult.errorDetails && apkgResult.errorDetails.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {apkgResult.errorDetails.map((detail, i) => (
                        <div key={i} className="p-2 bg-white dark:bg-dark-800 rounded border border-yellow-200 dark:border-yellow-700">
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300 uppercase px-2 py-1 bg-yellow-100 dark:bg-yellow-900/40 rounded">
                              {detail.category}
                            </span>
                            <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{detail.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <details className="text-sm">
                    <summary className="cursor-pointer text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 font-medium">
                      查看所有错误 ({apkgResult.errors.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-yellow-700 dark:text-yellow-300 pl-4">
                      {apkgResult.errors.map((err, i) => (
                        <li key={i} className="list-disc">{err}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleApkgReset}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  继续导入
                </button>
              </div>
            </div>
          )}

          {/* APKG File Upload */}
          {!apkgResult && (
            <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
                选择 APKG 文件
              </h2>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleApkgDragEnter}
                onDragLeave={handleApkgDragLeave}
                onDragOver={handleApkgDragOver}
                onDrop={handleApkgDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-300 dark:border-dark-700 hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10'
                }`}
              >
                <FileArchive className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  {isDragging ? '拖放 APKG 文件到此处' : '点击或拖放选择 APKG 文件'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  支持 .apkg 文件（Anki 卡组导出）
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".apkg"
                  onChange={handleApkgFileSelect}
                  className="hidden"
                />
              </div>

              {/* Selected file preview */}
              {apkgFile && (
                <div className="mt-4">
                  <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                    <FileArchive className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        {apkgFile.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(apkgFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={handleApkgReset}
                      className="p-2 hover:bg-gray-200 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                </div>
              )}

              {/* APKG Import Options - Deck Selection */}
              {apkgFile && !apkgResult && (
                <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
                    导入选项
                  </h2>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      目标卡组（可选）
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      留空则从 .apkg 导入卡组结构，或选择卡组将所有卡片导入到该卡组
                    </p>
                    <div className="relative">
                      <select
                        value={apkgDeckId || ''}
                        onChange={(e) => setApkgDeckId(e.target.value)}
                        className="appearance-none w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-dark-700 rounded-lg text-sm text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">从 .apkg 导入卡组结构</option>
                        {deckService.decks.map((deck) => (
                          <option key={deck.id} value={deck.id}>
                            {deck.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* APKG Import Button */}
          {!apkgResult && (
            <div className="space-y-4">
              {/* Progress Bar */}
              {isApkgImporting && apkgProgress && (
                <div className="bg-white dark:bg-dark-800 rounded-lg p-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-700 dark:text-gray-300">
                      正在导入笔记...
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {apkgProgress.current} / {apkgProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-dark-700 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${apkgProgress.total > 0 ? (apkgProgress.current / apkgProgress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleApkgImport}
                  disabled={!apkgFile || isApkgImporting}
                  className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-dark-600 disabled:cursor-not-allowed transition-colors"
                >
                  {isApkgImporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      导入中...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      导入卡组
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
