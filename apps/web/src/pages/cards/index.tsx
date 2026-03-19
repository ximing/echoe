import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { EchoeDeckService } from '../../services/echoe-deck.service';
import { CardEditorService } from '../../services/card-editor.service';
import { ToastService } from '../../services/toast.service';
import * as echoeApi from '../../api/echoe';
import {
  Plus,
  Upload,
  MoreVertical,
  Pencil,
  Settings,
  Trash2,
  Layers,
  BookOpen,
  Filter,
  RotateCcw,
  Trash,
  Clock,
  Search,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  X,
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
  const cardEditorState = useService(CardEditorService);
  const toastService = useService(ToastService);
  const navigate = useNavigate();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCustomStudyOpen, setIsCustomStudyOpen] = useState(false);
  const [isFilteredDeckOpen, setIsFilteredDeckOpen] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<EchoeDeckWithCountsDto | null>(null);
  const [contextMenu, setContextMenu] = useState<{ deck: EchoeDeckWithCountsDto; x: number; y: number } | null>(null);
  const [deleteCards, setDeleteCards] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'due' | 'name' | 'lastStudied'>('due');

  // Load decks on mount
  useEffect(() => {
    deckService.loadDecks();
  }, [deckService]);

  // Handle context menu events from grid cards
  useEffect(() => {
    const handleDeckContextMenu = (e: Event) => {
      const customEvent = e as CustomEvent<{ deck: EchoeDeckWithCountsDto; x: number; y: number }>;
      setContextMenu(customEvent.detail);
    };

    const handleClick = () => setContextMenu(null);
    document.addEventListener('deckContextMenu', handleDeckContextMenu);
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('deckContextMenu', handleDeckContextMenu);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  // Calculate total due
  const totalDue = deckService.getTotalDue();

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
    navigate(`/cards/decks/${contextMenu.deck.deckId}/config`);
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
      await echoeApi.rebuildFilteredDeck(deck.deckId);
      toastService.success('Filtered deck rebuilt');
      deckService.loadDecks();
    } catch {
      toastService.error('Failed to rebuild filtered deck');
    }
  };

  // Handle empty filtered deck
  const handleEmptyFilteredDeck = async () => {
    if (!contextMenu) return;
    const deck = contextMenu.deck;
    setContextMenu(null);
    try {
      await echoeApi.emptyFilteredDeck(deck.deckId);
      toastService.success('Filtered deck emptied');
      deckService.loadDecks();
    } catch {
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
    const success = await deckService.updateDeckData(selectedDeck.deckId, { name });
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
    const success = await deckService.deleteDeckData(selectedDeck.deckId, deleteCards);
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
    navigate('/cards/import/apkg');
  };

  // Handle quick create entry
  const handleOpenCreateDeckDialog = () => {
    setSelectedDeck(null);
    setIsCreateDialogOpen(true);
  };

  // Format last studied time
const formatLastStudied = (timestamp: number | null): string => {
  if (!timestamp) return 'Never studied';

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
};

// Calculate mastery percentage from average retrievability
const getMasteryPercentage = (deck: EchoeDeckWithCountsDto): number => {
  const retrievability = Number(deck.averageRetrievability);

  if (!Number.isFinite(retrievability)) return 0;

  return Math.round(Math.max(0, Math.min(1, retrievability)) * 100);
};

// Filter and sort decks
const getFilteredAndSortedDecks = (
  decks: EchoeDeckWithCountsDto[],
  searchQuery: string,
  sortBy: 'due' | 'name' | 'lastStudied'
): EchoeDeckWithCountsDto[] => {
  let filtered = decks;

  // Filter by search query
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = decks.filter((deck) => deck.name.toLowerCase().includes(query));
  }

  // Sort decks
  return [...filtered].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    } else if (sortBy === 'lastStudied') {
      // Sort by last studied (most recent first), nulls last
      if (!a.lastStudiedAt && !b.lastStudiedAt) return 0;
      if (!a.lastStudiedAt) return 1;
      if (!b.lastStudiedAt) return -1;
      return b.lastStudiedAt - a.lastStudiedAt;
    } else {
      // Sort by due count (most due first)
      const dueA = a.newCount + a.learnCount + a.reviewCount;
      const dueB = b.newCount + b.learnCount + b.reviewCount;
      return dueB - dueA;
    }
  });
};

// Render deck card for grid layout
const renderDeckCard = (deck: EchoeDeckWithCountsDto, deckService: EchoeDeckService) => {
  const children = deck.children;
  const hasChildren = children.length > 0;
  const isExpanded = deckService.isExpanded(deck.deckId);

  // Get display name (after last ::)
  const displayName = deck.name.split('::').pop() || deck.name;

  // Counts are already aggregated by backend hierarchy
  const dueCount = deck.newCount + deck.learnCount + deck.reviewCount;
  const masteryPercent = getMasteryPercentage(deck);

  return (
    <div key={deck.deckId} className="flex flex-col">
      {/* Deck Card */}
      <div
        className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-700 transition-all cursor-pointer group"
        onClick={() => navigate(`/cards/study/${deck.deckId}`)}
        onContextMenu={(e) => {
          e.preventDefault();
          // Trigger context menu via service
          const event = new CustomEvent('deckContextMenu', { detail: { deck: deck, x: e.clientX, y: e.clientY } });
          document.dispatchEvent(event);
        }}
      >
        {/* Deck Icon & Name */}
        <div className="flex items-start gap-3 mb-3">
          {deck.dyn === 1 ? (
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
              <Filter className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-dark-700 flex items-center justify-center flex-shrink-0">
              <Layers className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {displayName}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {deck.totalCount} cards
            </p>
          </div>
          {/* Expand/Collapse Arrow (for parent decks with children) */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deckService.toggleExpanded(deck.deckId);
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-dark-700 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-500" />
              )}
            </button>
          )}
          {/* Context Menu Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const event = new CustomEvent('deckContextMenu', { detail: { deck: deck, x: e.clientX, y: e.clientY } });
              document.dispatchEvent(event);
            }}
            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-dark-700 rounded transition-all"
          >
            <MoreVertical className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Mastery Progress Bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500 dark:text-gray-400">Mastery (Retrievability)</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{masteryPercent}%</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-dark-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500"
              style={{ width: `${masteryPercent}%` }}
            />
          </div>
        </div>

        {/* Badges Row + Due count & Last studied - merged */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {deck.newCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-md">
                {deck.newCount} new
              </span>
            )}
            {deck.learnCount > 0 && (
              <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium rounded-md">
                {deck.learnCount} learn
              </span>
            )}
            {deck.reviewCount > 0 && (
              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded-md">
                {deck.reviewCount} review
              </span>
            )}
            {deck.difficultCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium rounded-md">
                {deck.difficultCount} diff
              </span>
            )}
            {dueCount > 0 ? (
              <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium rounded-md">
                {dueCount} due
              </span>
            ) : dueCount === 0 && deck.totalCount > 0 ? (
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-dark-700 text-gray-500 dark:text-gray-400 text-xs font-medium rounded-md">
                Done
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
            <Clock className="w-3 h-3" />
            <span>{formatLastStudied(deck.lastStudiedAt)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-dark-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              cardEditorState.openCreate(deck.deckId);
              cardEditorState.setOnSaved(() => {
                deckService.loadDecks();
              });
            }}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
          >
            <Plus className="w-3 h-3" />
            新增卡片
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/cards/study/${deck.deckId}`);
            }}
            disabled={dueCount === 0 && deck.totalCount === 0}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BookOpen className="w-3 h-3" />
            去学习
          </button>
        </div>
      </div>

      {/* Children (if expanded and has children) */}
      {hasChildren && isExpanded && (
        <div className="mt-2 pl-4 border-l-2 border-gray-200 dark:border-dark-700 space-y-2">
          {children.map((child) => renderDeckCard(child, deckService))}
        </div>
      )}
    </div>
  );
};

  return (
    <div className="flex flex-col h-full">
      {/* Header - Single Row Layout */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-dark-700">
        <div className="flex items-center gap-4">
          {/* Title + Due count */}
          <div className="flex-shrink-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">我的卡组</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalDue > 0 ? `${totalDue} 待复习` : '无待复习'}
            </p>
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-gray-200 dark:bg-dark-700" />

          {/* Search Input */}
          {deckService.decks.length > 0 && (
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索卡组..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Sort Dropdown */}
          {deckService.decks.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700">
              <ArrowUpDown className="w-4 h-4 text-gray-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'due' | 'name' | 'lastStudied')}
                className="text-sm border-none bg-transparent text-gray-600 dark:text-gray-400 focus:ring-0 cursor-pointer"
              >
                <option value="due">按待复习</option>
                <option value="name">按名称</option>
                <option value="lastStudied">按最近学习</option>
              </select>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors text-sm font-medium"
            >
              <Upload className="w-4 h-4" />
              导入
            </button>
            <button
              onClick={handleOpenCreateDeckDialog}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              新建卡组
            </button>
          </div>
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
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              使用顶部的「导入」开始，或点击下方按钮创建卡组
            </p>
            <button
              onClick={handleOpenCreateDeckDialog}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              新建卡组
            </button>
          </div>
        ) : (
          <div className="p-6">
            {/* Responsive Grid: 1 col mobile, 2 cols tablet, 3 cols small desktop, 4 cols large desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {getFilteredAndSortedDecks(deckService.getRootDecks(), searchQuery, sortBy).map((deck) => renderDeckCard(deck, deckService))}
            </div>
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
          deckId={selectedDeck.deckId}
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
  deckId: string;
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
        } catch {
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
    } catch {
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
