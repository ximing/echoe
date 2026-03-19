import { view, useService } from '@rabjs/react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ToastService } from '../../services/toast.service';
import { EchoeDeckService } from '../../services/echoe-deck.service';
import { ApkgParserService, type AnkiDeck } from '../../services/apkg-parser.service';
import * as echoeApi from '../../api/echoe';
import type { ImportResultDto } from '@echoe/dto';
import {
  ArrowLeft,
  Upload,
  Check,
  AlertCircle,
  RotateCcw,
  FileArchive,
  ChevronDown,
  Eye,
  Layers,
} from 'lucide-react';

export default function ApkgImportPage() {
  return <ApkgImportPageContent />;
}

const ApkgImportPageContent = view(() => {
  const toastService = useService(ToastService);
  const deckService = useService(EchoeDeckService);
  const apkgParserService = useService(ApkgParserService);
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResultDto | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // APKG parsed data
  const [parsedDecks, setParsedDecks] = useState<AnkiDeck[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [showDeckPreview, setShowDeckPreview] = useState(false);
  const [customDeckName, setCustomDeckName] = useState<string>('');

  // Load decks
  useEffect(() => {
    deckService.loadDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setSelectedDeckId('');
      setCustomDeckName('');
      setParsedDecks([]);
      setImportResult(null);

      // Parse APKG file to get deck names
      setIsParsing(true);
      try {
        const success = await apkgParserService.parseApkgFile(file);
        if (success && apkgParserService.decks.length > 0) {
          setParsedDecks(apkgParserService.decks);
          // Set default custom deck name to the first deck's name
          setCustomDeckName(apkgParserService.decks[0].name);
        } else if (!success && apkgParserService.error) {
          toastService.error('Failed to parse APKG: ' + apkgParserService.error);
        }
      } catch (error) {
        console.error('Error parsing APKG:', error);
      } finally {
        setIsParsing(false);
      }
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
      setSelectedDeckId('');
      setCustomDeckName('');
      setParsedDecks([]);
      setImportResult(null);

      // Parse APKG file to get deck names
      setIsParsing(true);
      try {
        const success = await apkgParserService.parseApkgFile(file);
        if (success && apkgParserService.decks.length > 0) {
          setParsedDecks(apkgParserService.decks);
          // Set default custom deck name to the first deck's name
          setCustomDeckName(apkgParserService.decks[0].name);
        } else if (!success && apkgParserService.error) {
          toastService.error('Failed to parse APKG: ' + apkgParserService.error);
        }
      } catch (error) {
        console.error('Error parsing APKG:', error);
      } finally {
        setIsParsing(false);
      }
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
      // When no target deck is selected and user provided a custom deck name, use it
      const deckName = !selectedDeckId && customDeckName ? customDeckName : undefined;
      const response = await echoeApi.importApkg(selectedFile, selectedDeckId || undefined, deckName);
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
    setSelectedDeckId('');
    setCustomDeckName('');
    setParsedDecks([]);
    setShowDeckPreview(false);
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
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900">
      {/* Header */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700">
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
          <div className="mb-6 bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-dark-700 p-6">
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
              <div className="bg-gray-50 dark:bg-dark-700/50 rounded-lg p-4 text-center">
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
              <div className="bg-gray-50 dark:bg-dark-700/50 rounded-lg p-4 text-center">
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
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600 transition-colors"
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
          <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-dark-700 p-6">
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

        {/* Deck Selection */}
        {selectedFile && !importResult && (
          <div className="mt-6 bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-dark-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Import Options
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Target Deck (optional)
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Leave empty to use deck name from .apkg, or select a deck to import all cards into it
              </p>
              <div className="relative">
                <select
                  value={selectedDeckId}
                  onChange={(e) => setSelectedDeckId(e.target.value)}
                  className="appearance-none w-full px-3 py-2 pr-8 bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {parsedDecks.length > 0 ? (
                    <option value="">
                      {customDeckName || parsedDecks[0].name} ({parsedDecks.length} deck{parsedDecks.length > 1 ? 's' : ''})
                    </option>
                  ) : (
                    <option value="">Import deck structure from .apkg</option>
                  )}
                  {deckService.decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>

              {/* Preview decks button */}
              {parsedDecks.length > 0 && (
                <button
                  onClick={() => setShowDeckPreview(!showDeckPreview)}
                  className="mt-3 flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                >
                  <Eye className="w-4 h-4" />
                  {showDeckPreview ? 'Hide' : 'Preview'} decks in this .apkg
                </button>
              )}

              {/* Deck preview list */}
              {showDeckPreview && parsedDecks.length > 0 && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-dark-700 rounded-lg border border-gray-200 dark:border-dark-600">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Layers className="w-4 h-4" />
                    Decks in this .apkg:
                  </div>
                  <ul className="space-y-1">
                    {parsedDecks.map((deck) => (
                      <li key={deck.id} className="text-sm text-gray-600 dark:text-gray-400">
                        {deck.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Rename deck input */}
              {!selectedDeckId && parsedDecks.length > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Rename deck (optional)
                  </label>
                  <input
                    type="text"
                    value={customDeckName}
                    onChange={(e) => setCustomDeckName(e.target.value)}
                    placeholder={parsedDecks[0]?.name || 'Enter deck name'}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Leave empty to use the original deck name from .apkg
                  </p>
                </div>
              )}

              {/* Parsing indicator */}
              {isParsing && (
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Parsing .apkg file...
                </div>
              )}
            </div>
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
