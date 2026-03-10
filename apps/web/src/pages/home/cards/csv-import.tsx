import { view, useService } from '@rabjs/react';
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ToastService } from '../../../services/toast.service';
import { EchoeCsvImportService } from '../../../services/echoe-csv-import.service';
import { EchoeNoteService } from '../../../services/echoe-note.service';
import { EchoeDeckService } from '../../../services/echoe-deck.service';
import {
  ArrowLeft,
  Upload,
  FileText,
  Check,
  X,
  ChevronDown,
  AlertCircle,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

export default function CsvImportPage() {
  return <CsvImportPageContent />;
}

const CsvImportPageContent = view(() => {
  const toastService = useService(ToastService);
  const csvImportService = useService(EchoeCsvImportService);
  const noteTypeService = useService(EchoeNoteService);
  const deckService = useService(EchoeDeckService);
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Step 1: File selection
  // Step 2: Column mapping (handled by service state)
  // Step 3: Import result

  // Load note types and decks
  useEffect(() => {
    noteTypeService.loadNoteTypes();
    deckService.loadDecks();
  }, []);

  // Handle file selection
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.csv', '.tsv', '.txt'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!validExtensions.includes(ext)) {
      toastService.error('Please select a .csv, .tsv, or .txt file');
      return;
    }

    setSelectedFile(file);
    await csvImportService.loadPreview(file);
  };

  // Handle column mapping change
  const handleColumnChange = (columnIndex: number, field: string) => {
    csvImportService.setColumnMapping(columnIndex, field);
  };

  // Handle import
  const handleImport = async () => {
    if (!selectedFile) {
      toastService.error('Please select a file first');
      return;
    }

    const success = await csvImportService.executeImport(selectedFile);
    if (success) {
      toastService.success('Import completed successfully');
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

  // Handle go back
  const handleGoBack = () => {
    navigate('/cards');
  };

  const preview = csvImportService.preview;
  const importResult = csvImportService.importResult;
  const isLoading = csvImportService.isLoading;
  const isImporting = csvImportService.isImporting;

  // Field options for column mapping
  const fieldOptions = ['Front', 'Back', 'Tags', 'Ignore'];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleGoBack}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Import from CSV/TSV
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Import Result */}
        {importResult && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Import Complete
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Your flashcards have been imported
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {importResult.added}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Added</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {importResult.updated}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Updated</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {importResult.skipped}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Skipped</div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 mb-2">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">{importResult.errors.length} errors</span>
                </div>
                <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>
                      Row {err.row}: {err.reason}
                    </li>
                  ))}
                  {importResult.errors.length > 5 && (
                    <li>...and {importResult.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Import More
              </button>
              <button
                onClick={handleGoBack}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Back to Cards
              </button>
            </div>
          </div>
        )}

        {/* File Upload */}
        {!importResult && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Step 1: Select File
            </h2>

            {!preview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
              >
                <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  Click to select a CSV or TSV file
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Supports .csv, .tsv, and .txt files
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
                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedFile?.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {preview.detectedEncoding} encoding, {preview.detectedDelimiter === '\t' ? 'Tab' : preview.detectedDelimiter} delimiter, {preview.totalRows} rows
                    </p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
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
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Step 2: Map Columns
            </h2>

            {/* Header row checkbox */}
            <div className="mb-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="hasHeader"
                checked={csvImportService.hasHeader}
                onChange={(e) => csvImportService.setHasHeader(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="hasHeader" className="text-gray-700 dark:text-gray-300">
                First row is header
              </label>
            </div>

            {/* Column mapping table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Column
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Sample Data
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Map To
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.length > 0 &&
                    (csvImportService.hasHeader ? [preview.rows[0]] : preview.rows.slice(0, 3)).map((row, rowIdx) =>
                      row.map((cell, colIdx) => (
                        <tr
                          key={`${rowIdx}-${colIdx}`}
                          className="border-b border-gray-100 dark:border-gray-700"
                        >
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                            Column {colIdx + 1}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">
                            {cell}
                          </td>
                          <td className="py-3 px-4">
                            <div className="relative">
                              <select
                                value={csvImportService.columnMapping[colIdx] || 'Ignore'}
                                onChange={(e) => handleColumnChange(colIdx, e.target.value)}
                                className="appearance-none w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Step 3: Select Destination
            </h2>

            <div className="grid grid-cols-2 gap-4">
              {/* Deck Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Deck
                </label>
                <div className="relative">
                  <select
                    value={csvImportService.selectedDeckId || ''}
                    onChange={(e) =>
                      csvImportService.setDeckId(e.target.value ? Number(e.target.value) : 0)
                    }
                    className="appearance-none w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a deck...</option>
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
                  Note Type
                </label>
                <div className="relative">
                  <select
                    value={csvImportService.selectedNotetypeId || ''}
                    onChange={(e) =>
                      csvImportService.setNotetypeId(
                        e.target.value ? Number(e.target.value) : 0
                      )
                    }
                    className="appearance-none w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a note type...</option>
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
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleImport}
              disabled={
                !csvImportService.selectedDeckId ||
                !csvImportService.selectedNotetypeId ||
                isImporting
              }
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {isImporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  Import Cards
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 flex items-center gap-4">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-900 dark:text-white">Analyzing file...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
