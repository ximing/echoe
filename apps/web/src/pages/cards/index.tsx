import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { EchoeDeckService } from '../../services/echoe-deck.service';
import { ToastService } from '../../services/toast.service';
import * as echoeApi from '../../api/echoe';
import {
  Plus,
  Upload,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Pencil,
  Settings,
  Trash2,
  Layers,
  Search,
  BarChart3,
  BookOpen,
  Filter,
  RotateCcw,
  Trash,
  Tag,
  Image,
  Copy,
} from 'lucide-react';
import type { EchoeDeckWithCountsDto } from '@echoe/dto';

/**
 * Cards Deck List Page
 * Main entry point for flashcard studying
 */
export default function CardsPage() {
  return <CardsPageContent />;
}

const CardsPageContent = view(() => {
  const deckService = useService(EchoeDeckService);
  const toastService = useService(ToastService);
  const navigate = useNavigate();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCustomStudyOpen, setIsCustomStudyOpen] = useState(false);
  const [isFilteredDeckOpen, setIsFilteredDeckOpen] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<EchoeDeckWithCountsDto | null>(null);
  const [contextMenu, setContextMenu] = useState<{ deck: EchoeDeckWithCountsDto; x: number; y: number } | null>(null);
  const [deleteCards, setDeleteCards] = useState(false);

  // Load decks on mount
  useEffect(() => {
    deckService.loadDecks();
  }, [deckService]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Calculate total due
  const totalDue = deckService.getTotalDue();

  // Handle deck click - navigate to study
  const handleDeckClick = (deck: EchoeDeckWithCountsDto) => {
    navigate(`/cards/study/${deck.id}`);
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent, deck: EchoeDeckWithCountsDto) => {
    e.preventDefault();
    setContextMenu({ deck, x: e.clientX, y: e.clientY });
  };

  // Handle rename
  const handleRename = () => {
    if (!contextMenu) return;
    setSelectedDeck(contextMenu.deck);
    setIsCreateDialogOpen(true);
    setContextMenu(null);
  };

  // Handle configure
  const handleConfigure = () => {
    if (!contextMenu) return;
    navigate(`/cards/decks/${contextMenu.deck.id}/config`);
    setContextMenu(null);
  };

  // Handle delete click
  const handleDeleteClick = () => {
    if (!contextMenu) return;
    setSelectedDeck(contextMenu.deck);
    setIsDeleteDialogOpen(true);
    setContextMenu(null);
  };

  // Handle custom study click
  const handleCustomStudyClick = () => {
    if (!contextMenu) return;
    setSelectedDeck(contextMenu.deck);
    setIsCustomStudyOpen(true);
    setContextMenu(null);
  };

  // Handle rebuild filtered deck
  const handleRebuildFilteredDeck = async () => {
    if (!contextMenu) return;
    const deck = contextMenu.deck;
    setContextMenu(null);
    try {
      await echoeApi.rebuildFilteredDeck(deck.id);
      toastService.success('Filtered deck rebuilt');
      deckService.loadDecks();
    } catch (_error) {
      toastService.error('Failed to rebuild filtered deck');
    }
  };

  // Handle empty filtered deck
  const handleEmptyFilteredDeck = async () => {
    if (!contextMenu) return;
    const deck = contextMenu.deck;
    setContextMenu(null);
    try {
      await echoeApi.emptyFilteredDeck(deck.id);
      toastService.success('Filtered deck emptied');
      deckService.loadDecks();
    } catch (_error) {
      toastService.error('Failed to empty filtered deck');
    }
  };

  // Handle create deck
  const handleCreateDeck = async (name: string) => {
    const success = await deckService.createNewDeck({ name });
    if (success) {
      toastService.success('Deck created');
      setIsCreateDialogOpen(false);
      setSelectedDeck(null);
    } else {
      toastService.error(deckService.error || 'Failed to create deck');
    }
  };

  // Handle update deck
  const handleUpdateDeck = async (name: string) => {
    if (!selectedDeck) return;
    const success = await deckService.updateDeckData(selectedDeck.id, { name });
    if (success) {
      toastService.success('Deck updated');
      setIsCreateDialogOpen(false);
      setSelectedDeck(null);
    } else {
      toastService.error(deckService.error || 'Failed to update deck');
    }
  };

  // Handle delete deck
  const handleDeleteDeck = async () => {
    if (!selectedDeck) return;
    const success = await deckService.deleteDeckData(selectedDeck.id, deleteCards);
    if (success) {
      toastService.success('Deck deleted');
      setIsDeleteDialogOpen(false);
      setSelectedDeck(null);
      setDeleteCards(false);
    } else {
      toastService.error(deckService.error || 'Failed to delete deck');
    }
  };

  // Handle import
  const handleImport = () => {
    navigate('/cards/import/csv');
  };

  // Render deck row recursively
  const renderDeckRow = (deck: EchoeDeckWithCountsDto, depth: number = 0) => {
    const children = deckService.getChildren(deck.name);
    const hasChildren = children.length > 0;
    const isExpanded = deckService.isExpanded(deck.id);

    // Get display name (after last ::)
    const displayName = deck.name.split('::').pop() || deck.name;

    return (
      <div key={deck.id}>
        <div
          className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-800 cursor-pointer transition-colors group`}
          style={{ paddingLeft: `${depth * 24 + 16}px` }}
          onClick={() => handleDeckClick(deck)}
          onContextMenu={(e) => handleContextMenu(e, deck)}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deckService.toggleExpanded(deck.id);
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-dark-700 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* Deck Icon - Filter icon for filtered decks */}
          {deck.dyn === 1 ? (
            <Filter className="w-5 h-5 text-purple-500" />
          ) : (
            <Layers className="w-5 h-5 text-gray-400" />
          )}

          {/* Deck Name */}
          <span className="flex-1 font-medium text-gray-900 dark:text-white truncate">
            {displayName}
          </span>

          {/* Badges */}
          <div className="flex items-center gap-2">
            {deck.newCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full">
                {deck.newCount}
              </span>
            )}
            {deck.learnCount > 0 && (
              <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium rounded-full">
                {deck.learnCount}
              </span>
            )}
            {deck.reviewCount > 0 && (
              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded-full">
                {deck.reviewCount}
              </span>
            )}
          </div>

          {/* More Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, deck);
            }}
            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-dark-700 rounded transition-all"
          >
            <MoreVertical className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && children.map((child) => renderDeckRow(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-700">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Flashcards</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {totalDue > 0 ? `${totalDue} cards due today` : 'No cards due'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/cards/browser')}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            Browse Cards
          </button>
          <button
            onClick={() => navigate('/cards/stats')}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Statistics
          </button>
          <button
            onClick={() => navigate('/cards/notetypes')}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <Layers className="w-4 h-4" />
            Note Types
          </button>
          <button
            onClick={() => navigate('/cards/tags')}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <Tag className="w-4 h-4" />
            Tags
          </button>
          <button
            onClick={() => navigate('/cards/media')}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <Image className="w-4 h-4" />
            Media
          </button>
          <button
            onClick={() => navigate('/cards/settings')}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={() => navigate('/cards/duplicates')}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Duplicates
          </button>
          <button
            onClick={handleImport}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={() => setIsFilteredDeckOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Custom Study Deck
          </button>
          <button
            onClick={() => {
              setSelectedDeck(null);
              setIsCreateDialogOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Deck
          </button>
        </div>
      </div>

      {/* Deck List */}
      <div className="flex-1 overflow-y-auto">
        {deckService.isLoading && deckService.decks.length === 0 ? (
          <div className="p-8 text-center">
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-200 dark:bg-dark-700 rounded-lg" />
              ))}
            </div>
          </div>
        ) : deckService.decks.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-dark-700 rounded-full flex items-center justify-center">
              <Layers className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No decks yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Import a deck or create your first deck to get started
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleImport}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import .apkg
              </button>
              <button
                onClick={() => {
                  setSelectedDeck(null);
                  setIsCreateDialogOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Deck
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-700">
            {deckService.getRootDecks().map((deck) => renderDeckRow(deck))}
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      {totalDue > 0 && (
        <div className="px-6 py-3 border-t border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Total: <span className="font-medium text-gray-900 dark:text-white">{totalDue} cards due</span>
            </span>
            <button
              onClick={() => navigate('/cards/study')}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Start Studying
            </button>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.deck.dyn === 1 ? (
            // Filtered deck options
            <>
              <button
                onClick={handleRebuildFilteredDeck}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Rebuild
              </button>
              <button
                onClick={handleEmptyFilteredDeck}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 flex items-center gap-2"
              >
                <Trash className="w-4 h-4" />
                Empty
              </button>
              <div className="my-1 border-t border-gray-200 dark:border-dark-700" />
            </>
          ) : (
            // Regular deck options
            <>
              <button
                onClick={handleRename}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Rename
              </button>
              <button
                onClick={handleConfigure}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Configure
              </button>
              <button
                onClick={handleCustomStudyClick}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                Custom Study
              </button>
              <div className="my-1 border-t border-gray-200 dark:border-dark-700" />
            </>
          )}
          <button
            onClick={handleDeleteClick}
            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Create/Edit Deck Dialog */}
      {isCreateDialogOpen && (
        <CreateDeckDialog
          deck={selectedDeck}
          onClose={() => {
            setIsCreateDialogOpen(false);
            setSelectedDeck(null);
          }}
          onSubmit={selectedDeck ? handleUpdateDeck : handleCreateDeck}
        />
      )}

      {/* Delete Deck Dialog */}
      {isDeleteDialogOpen && selectedDeck && (
        <DeleteDeckDialog
          deckName={selectedDeck.name.split('::').pop() || selectedDeck.name}
          deleteCards={deleteCards}
          onDeleteCardsChange={setDeleteCards}
          onClose={() => {
            setIsDeleteDialogOpen(false);
            setSelectedDeck(null);
            setDeleteCards(false);
          }}
          onConfirm={handleDeleteDeck}
        />
      )}

      {/* Custom Study Dialog */}
      {isCustomStudyOpen && selectedDeck && (
        <CustomStudyDialog
          deckId={selectedDeck.id}
          deckName={selectedDeck.name.split('::').pop() || selectedDeck.name}
          onClose={() => {
            setIsCustomStudyOpen(false);
            setSelectedDeck(null);
          }}
        />
      )}

      {/* Filtered Deck Dialog */}
      {isFilteredDeckOpen && (
        <FilteredDeckDialog
          onClose={() => setIsFilteredDeckOpen(false)}
          onCreated={() => {
            setIsFilteredDeckOpen(false);
            deckService.loadDecks();
          }}
        />
      )}
    </div>
  );
});

interface CreateDeckDialogProps {
  deck: EchoeDeckWithCountsDto | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

const CreateDeckDialog = view(({ deck, onClose, onSubmit }: CreateDeckDialogProps) => {
  const [name, setName] = useState(deck?.name.split('::').pop() || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-dark-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {deck ? 'Rename Deck' : 'Create Deck'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Deck Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Japanese Vocab"
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-dark-700 text-gray-900 dark:text-white"
              autoFocus
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Use <code className="px-1 bg-gray-100 dark:bg-dark-700 rounded">::</code> to create sub-decks (e.g., <code className="px-1 bg-gray-100 dark:bg-dark-700 rounded">Japanese::N5::Numbers</code>)
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-dark-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              {isSubmitting ? 'Saving...' : deck ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

interface DeleteDeckDialogProps {
  deckName: string;
  deleteCards: boolean;
  onDeleteCardsChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteDeckDialog = view(
  ({ deckName, deleteCards, onDeleteCardsChange, onClose, onConfirm }: DeleteDeckDialogProps) => {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
      setIsDeleting(true);
      try {
        await onConfirm();
      } finally {
        setIsDeleting(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white dark:bg-dark-800 rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Deck</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete the deck "{deckName}"?
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteCards}
                onChange={(e) => onDeleteCardsChange(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Also delete all cards in this deck
              </span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-7">
              If unchecked, cards will be moved to the default deck.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

interface CustomStudyDialogProps {
  deckId: number;
  deckName: string;
  onClose: () => void;
}

const CustomStudyDialog = view(({ deckId, deckName, onClose }: CustomStudyDialogProps) => {
  const navigate = useNavigate();
  const [studyType, setStudyType] = useState<'newLimit' | 'reviewAhead' | 'preview'>('newLimit');
  const [newLimit, setNewLimit] = useState<number>(20);
  const [reviewDays, setReviewDays] = useState<number>(1);

  const handleStartStudy = () => {
    let url = `/cards/study/${deckId}`;

    if (studyType === 'newLimit') {
      // For new limit, we use the limit parameter
      url += `?limit=${newLimit}`;
    } else if (studyType === 'reviewAhead') {
      // For review ahead, include cards due within N days
      url += `?reviewAhead=${reviewDays}`;
    } else if (studyType === 'preview') {
      // For preview, return new cards without modifying state
      url += `?preview=true`;
    }

    navigate(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-dark-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Custom Study
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Choose how you want to study "{deckName}":
          </p>

          {/* Option 1: Increase new card limit */}
          <label
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer mb-3 transition-colors ${
              studyType === 'newLimit'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-dark-700 hover:bg-gray-50 dark:hover:bg-dark-700'
            }`}
          >
            <input
              type="radio"
              name="studyType"
              checked={studyType === 'newLimit'}
              onChange={() => setStudyType('newLimit')}
              className="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
            />
            <div className="flex-1">
              <span className="block font-medium text-gray-900 dark:text-white">
                Increase today's new card limit
              </span>
              <span className="block text-sm text-gray-500 dark:text-gray-400 mt-1">
                Temporarily raise the limit of new cards for today
              </span>
              {studyType === 'newLimit' && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={newLimit}
                    onChange={(e) => setNewLimit(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 px-3 py-1.5 border border-gray-300 dark:border-dark-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-dark-700 text-gray-900 dark:text-white text-sm"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">cards</span>
                </div>
              )}
            </div>
          </label>

          {/* Option 2: Review ahead */}
          <label
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer mb-3 transition-colors ${
              studyType === 'reviewAhead'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-dark-700 hover:bg-gray-50 dark:hover:bg-dark-700'
            }`}
          >
            <input
              type="radio"
              name="studyType"
              checked={studyType === 'reviewAhead'}
              onChange={() => setStudyType('reviewAhead')}
              className="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
            />
            <div className="flex-1">
              <span className="block font-medium text-gray-900 dark:text-white">
                Review ahead
              </span>
              <span className="block text-sm text-gray-500 dark:text-gray-400 mt-1">
                Study cards due in the next few days
              </span>
              {studyType === 'reviewAhead' && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={reviewDays}
                    onChange={(e) => setReviewDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                    className="w-20 px-3 py-1.5 border border-gray-300 dark:border-dark-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-dark-700 text-gray-900 dark:text-white text-sm"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">days ahead</span>
                </div>
              )}
            </div>
          </label>

          {/* Option 3: Preview new cards */}
          <label
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              studyType === 'preview'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-dark-700 hover:bg-gray-50 dark:hover:bg-dark-700'
            }`}
          >
            <input
              type="radio"
              name="studyType"
              checked={studyType === 'preview'}
              onChange={() => setStudyType('preview')}
              className="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
            />
            <div className="flex-1">
              <span className="block font-medium text-gray-900 dark:text-white">
                Preview new cards
              </span>
              <span className="block text-sm text-gray-500 dark:text-gray-400 mt-1">
                Look at new cards without affecting your scheduling
              </span>
            </div>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-700">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStartStudy}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            Start Studying
          </button>
        </div>
      </div>
    </div>
  );
});

interface FilteredDeckDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

const FilteredDeckDialog = view(({ onClose, onCreated }: FilteredDeckDialogProps) => {
  const toastService = useService(ToastService);
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [rebuildDaily, setRebuildDaily] = useState(true);
  const [preview, setPreview] = useState<{ count: number; sampleCards: { front: string }[] } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preview when search query changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        try {
          const result = await echoeApi.previewFilteredDeck(searchQuery, 3);
          if (result.code === 0) {
            setPreview(result.data);
          }
        } catch (_error) {
          setPreview(null);
        }
      } else {
        setPreview(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !searchQuery.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await echoeApi.createFilteredDeck({
        name: name.trim(),
        searchQuery: searchQuery.trim(),
        rebuildDaily,
      });
      if (result.code === 0) {
        toastService.success('Filtered deck created');
        onCreated();
      } else {
        toastService.error('Failed to create filtered deck');
      }
    } catch (error) {
      toastService.error('Failed to create filtered deck');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-dark-800 rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Create Custom Study Deck
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Deck Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Difficult Cards"
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-dark-700 text-gray-900 dark:text-white"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search Query
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='e.g., tag:hard is:review'
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-dark-700 text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Use Cards search syntax: <code className="px-1 bg-gray-100 dark:bg-dark-700 rounded">deck:name</code>, <code className="px-1 bg-gray-100 dark:bg-dark-700 rounded">tag:foo</code>, <code className="px-1 bg-gray-100 dark:bg-dark-700 rounded">is:new</code>, <code className="px-1 bg-gray-100 dark:bg-dark-700 rounded">is:learn</code>, <code className="px-1 bg-gray-100 dark:bg-dark-700 rounded">is:review</code>, etc.
            </p>
          </div>

          {/* Preview results */}
          {preview && (
            <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">
                {preview.count} cards match this search
              </p>
              {preview.sampleCards.length > 0 && (
                <div className="space-y-1">
                  {preview.sampleCards.map((card, i) => (
                    <p key={i} className="text-xs text-purple-600 dark:text-purple-400 truncate">
                      • {card.front}
                    </p>
                  ))}
                  {preview.count > 3 && (
                    <p className="text-xs text-purple-500 dark:text-purple-400 italic">
                      ...and {preview.count - 3} more
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={rebuildDaily}
                onChange={(e) => setRebuildDaily(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Rebuild daily (resets card selection each day)
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !searchQuery.trim() || isSubmitting}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
