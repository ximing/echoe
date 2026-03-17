import { view, useService } from '@rabjs/react';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ToastService } from '../../services/toast.service';
import * as echoeApi from '../../api/echoe';
import type { ImportResultDto } from '@echoe/dto';
import {
  ArrowLeft,
  Upload,
  Check,
  AlertCircle,
  RotateCcw,
  FileArchive,
} from 'lucide-react';

export default function ApkgImportPage() {
  return <ApkgImportPageContent />;
}

const ApkgImportPageContent = view(() => {
  const toastService = useService(ToastService);
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResultDto | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Validate file extension
  const validateFile = (file: File): boolean => {
    const validExtensions = ['.apkg'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!validExtensions.includes(ext)) {
      toastService.error('Please select an .apkg file');
      return false;
    }
    return true;
  };

  // Handle file selection
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (validateFile(file)) {
      setSelectedFile(file);
    }
  };

  // Handle drag events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  };

  // Handle import
  const handleImport = async () => {
    if (!selectedFile) {
      toastService.error('Please select a file first');
      return;
    }

    setIsImporting(true);
    try {
      const response = await echoeApi.importApkg(selectedFile);
      setImportResult(response.data);

      // Show appropriate message based on results
      if (response.data.errors.length === 0) {
        toastService.success('Import completed successfully');
      } else if (response.data.notesAdded > 0 || response.data.cardsAdded > 0) {
        toastService.warning(`Import completed with ${response.data.errors.length} warnings. Check details below.`);
      } else {
        toastService.error('Import failed. Please check the error details below.');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage = err.response?.data?.message || err.message || 'Import failed. Please try again.';
      toastService.error(errorMessage);

      // Set empty result to show error state
      setImportResult({
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
      setIsImporting(false);
    }
  };

  // Handle reset
  const handleReset = () => {
    setSelectedFile(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle go back
  const handleGoBack = () => {
    navigate('/cards');
  };

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
              Import from APKG
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
                  {importResult.notesAdded}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Notes Added</div>
              </div>
              <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                  {importResult.notesUpdated}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Notes Updated</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {importResult.notesSkipped}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Notes Skipped</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {importResult.cardsAdded}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Cards Added</div>
              </div>
              <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                  {importResult.cardsUpdated}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Cards Updated</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {importResult.decksAdded}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Decks Added</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {importResult.notetypesAdded}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Note Types Added</div>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {importResult.mediaImported}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Media Imported</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {importResult.revlogImported}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Revlog Entries</div>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 mb-3">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-semibold">
                    {importResult.errors.length} {importResult.errors.length === 1 ? 'issue' : 'issues'} found
                  </span>
                </div>

                {/* Error categories */}
                {importResult.errorDetails && importResult.errorDetails.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {importResult.errorDetails.map((detail, i) => (
                      <div key={i} className="p-2 bg-white dark:bg-gray-800 rounded border border-yellow-200 dark:border-yellow-700">
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

                {/* Detailed error list */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 font-medium">
                    View all errors ({importResult.errors.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-yellow-700 dark:text-yellow-300 pl-4">
                    {importResult.errors.map((err, i) => (
                      <li key={i} className="list-disc">{err}</li>
                    ))}
                  </ul>
                </details>
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
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
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
              Select APKG File
            </h2>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/10'
              }`}
            >
              <FileArchive className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                {isDragging ? 'Drop APKG file here' : 'Click or drag to select an APKG file'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Supports .apkg files (Anki deck export)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".apkg"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Selected file preview */}
            {selectedFile && (
              <div className="mt-4">
                <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                  <FileArchive className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <AlertCircle className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import Button */}
        {!importResult && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleImport}
              disabled={!selectedFile || isImporting}
              className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {isImporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import Deck
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
