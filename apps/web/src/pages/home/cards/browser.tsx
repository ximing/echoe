import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ToastService } from '../../../services/toast.service';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  Pause,
  Play,
  RotateCcw,
  X,
  Edit,
} from 'lucide-react';
import type { EchoeCardListItemDto, EchoeDeckWithCountsDto } from '@echoe/dto';
import { getDecks, bulkCardOperation, getCards } from '../../../api/echoe';

type FilterStatus = 'all' | 'new' | 'learn' | 'review' | 'suspended' | 'buried' | 'leech';
type SortField = 'added' | 'due' | 'mod';
type SortOrder = 'asc' | 'desc';

interface CardDetail {
  card: EchoeCardListItemDto;
  reviewCount: number;
  averageTime: number;
}

/**
 * Card Browser Page
 * Browse, search, and bulk-edit cards
 */
export default function CardBrowserPage() {
  return <CardBrowserPageContent />;
}

const CardBrowserPageContent = view(() => {
  const toastService = useService(ToastService);
  const navigate = useNavigate();

  // State
  const [cards, setCards] = useState<EchoeCardListItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortField, setSortField] = useState<SortField>('added');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [deckFilter, setDeckFilter] = useState<number | undefined>(undefined);

  // Data
  const [decks, setDecks] = useState<EchoeDeckWithCountsDto[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 50;

  // Load initial data
  useEffect(() => {
    loadDecks();
  }, []);

  // Load cards when filters change
  useEffect(() => {
    loadCards();
  }, [searchQuery, statusFilter, sortField, sortOrder, deckFilter, page]);

  const loadDecks = async () => {
    try {
      const res = await getDecks();
      if (res.code === 0) {
        setDecks(res.data);
      }
    } catch (error) {
      console.error('Failed to load decks:', error);
    }
  };

  const loadCards = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit,
        sort: sortField,
        order: sortOrder,
      };

      if (searchQuery) {
        params.q = searchQuery;
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (deckFilter) {
        params.deckId = deckFilter;
      }

      const res = await getCards(params);
      if (res.code === 0) {
        setCards(res.data.cards);
        setTotal(res.data.total);
      }
    } catch (error) {
      console.error('Failed to load cards:', error);
      toastService.error('Failed to load cards');
    } finally {
      setLoading(false);
    }
  };

  // Selection helpers
  const toggleSelectAll = () => {
    if (selectedCards.size === cards.length) {
      setSelectedCards(new Set());
    } else {
      setSelectedCards(new Set(cards.map((c) => c.id)));
    }
  };

  const toggleSelectCard = (cardId: number) => {
    const newSelected = new Set(selectedCards);
    if (newSelected.has(cardId)) {
      newSelected.delete(cardId);
    } else {
      newSelected.add(cardId);
    }
    setSelectedCards(newSelected);
  };

  // Bulk operations
  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedCards.size} selected cards? This will also delete their notes.`)) {
      return;
    }

    try {
      // Delete notes (cards will be deleted automatically)
      // Since we don't have a bulk delete for notes, we need to delete cards first
      for (const cardId of selectedCards) {
        const card = cards.find((c) => c.id === cardId);
        if (card) {
          // TODO: Delete via API
        }
      }
      toastService.success(`Deleted ${selectedCards.size} cards`);
      setSelectedCards(new Set());
      loadCards();
    } catch {
      toastService.error('Failed to delete cards');
    }
  };

  const handleBulkSuspend = async () => {
    try {
      await bulkCardOperation({
        cardIds: Array.from(selectedCards),
        action: 'suspend',
      });
      toastService.success(`Suspended ${selectedCards.size} cards`);
      setSelectedCards(new Set());
      loadCards();
    } catch {
      toastService.error('Failed to suspend cards');
    }
  };

  const handleBulkUnsuspend = async () => {
    try {
      await bulkCardOperation({
        cardIds: Array.from(selectedCards),
        action: 'unsuspend',
      });
      toastService.success(`Unsuspended ${selectedCards.size} cards`);
      setSelectedCards(new Set());
      loadCards();
    } catch {
      toastService.error('Failed to unsuspend cards');
    }
  };

  const handleBulkForget = async () => {
    if (!confirm(`Reset ${selectedCards.size} selected cards to new? This will lose all scheduling data.`)) {
      return;
    }

    try {
      await bulkCardOperation({
        cardIds: Array.from(selectedCards),
        action: 'forget',
      });
      toastService.success(`Reset ${selectedCards.size} cards`);
      setSelectedCards(new Set());
      loadCards();
    } catch {
      toastService.error('Failed to reset cards');
    }
  };

  // Get status badge color
  const getStatusBadge = (card: EchoeCardListItemDto) => {
    if (card.queue === -1) {
      return { label: 'Suspended', className: 'bg-gray-500' };
    }
    if (card.queue === -2) {
      return { label: 'Buried', className: 'bg-purple-500' };
    }
    if (card.queue === -3) {
      return { label: 'Sib. Buried', className: 'bg-purple-600' };
    }
    if (card.queue === 0) {
      return { label: 'New', className: 'bg-blue-500' };
    }
    if (card.queue === 1 || card.queue === 3) {
      return { label: 'Learning', className: 'bg-red-500' };
    }
    if (card.queue === 2) {
      return { label: 'Review', className: 'bg-green-500' };
    }
    return { label: 'Unknown', className: 'bg-gray-500' };
  };

  // Format due date
  const formatDueDate = (card: EchoeCardListItemDto) => {
    if (card.queue === 0) {
      return 'New';
    }
    if (card.queue === -1 || card.queue === -2 || card.queue === -3) {
      return '-';
    }

    // Due is in days (for review) or milliseconds (for learning)
    if (card.queue === 1 || card.queue === 3) {
      // Learning - due is timestamp
      const dueTime = new Date(card.due);
      return dueTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Review - due is days since epoch
    const today = Math.floor(Date.now() / 86400000);
    const dueDays = Math.floor(card.due);
    const diff = dueDays - today;

    if (diff < 0) {
      return `${Math.abs(diff)}d overdue`;
    }
    if (diff === 0) {
      return 'Today';
    }
    if (diff === 1) {
      return 'Tomorrow';
    }
    return `+${diff}d`;
  };

  // Filter chips
  const filterChips: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'new', label: 'New' },
    { value: 'learn', label: 'Learning' },
    { value: 'review', label: 'Review' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'buried', label: 'Buried' },
    { value: 'leech', label: 'Leech' },
  ];

  // Sort options
  const sortOptions: { value: SortField; label: string }[] = [
    { value: 'added', label: 'Added' },
    { value: 'due', label: 'Due' },
    { value: 'mod', label: 'Modified' },
  ];

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold text-gray-900">Card Browser</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/cards/cards/new')}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
            >
              Add Cards
            </button>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Deck filter */}
          <select
            value={deckFilter || ''}
            onChange={(e) => {
              setDeckFilter(e.target.value ? Number(e.target.value) : undefined);
              setPage(1);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Decks</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1">
            <select
              value={sortField}
              onChange={(e) => {
                setSortField(e.target.value as SortField);
                setPage(1);
              }}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {filterChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => {
                setStatusFilter(chip.value);
                setPage(1);
              }}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                statusFilter === chip.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedCards.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between">
          <span className="text-sm text-blue-800">
            {selectedCards.size} card{selectedCards.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkSuspend}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              <Pause className="w-3 h-3" />
              Suspend
            </button>
            <button
              onClick={handleBulkUnsuspend}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              <Play className="w-3 h-3" />
              Unsuspend
            </button>
            <button
              onClick={handleBulkForget}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              <RotateCcw className="w-3 h-3" />
              Forget
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-50 border border-red-300 text-red-700 rounded hover:bg-red-100"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Card list */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 w-8">
                <input
                  type="checkbox"
                  checked={selectedCards.size === cards.length && cards.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-2">Front</th>
              <th className="px-4 py-2">Deck</th>
              <th className="px-4 py-2">Due</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Interval</th>
              <th className="px-4 py-2">Ease</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : cards.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No cards found
                </td>
              </tr>
            ) : (
              cards.map((card) => {
                const status = getStatusBadge(card);
                return (
                  <tr
                    key={card.id}
                    className={`hover:bg-gray-50 cursor-pointer ${
                      selectedCards.has(card.id) ? 'bg-blue-50' : ''
                    } ${selectedCard?.card.id === card.id ? 'bg-blue-100' : ''}`}
                    onClick={() => {
                      setSelectedCard({
                        card,
                        reviewCount: card.reps,
                        averageTime: 0,
                      });
                      setShowDetailPanel(true);
                    }}
                  >
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedCards.has(card.id)}
                        onChange={() => toggleSelectCard(card.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 max-w-xs">
                      <div className="truncate" title={card.front}>
                        {card.front || '(empty)'}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm">{card.deckName}</td>
                    <td className="px-4 py-2 text-sm">{formatDueDate(card)}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1 flex-wrap">
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-medium text-white rounded-full ${status.className}`}
                        >
                          {status.label}
                        </span>
                        {card.notetypeType === 1 && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium text-white rounded-full bg-orange-500">
                            Cloze
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm">{card.ivl > 0 ? `${card.ivl}d` : '-'}</td>
                    <td className="px-4 py-2 text-sm">{(card.factor / 1000).toFixed(1)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          Showing {cards.length} of {total} cards
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm">
            Page {page} of {totalPages || 1}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Detail Panel */}
      {showDetailPanel && selectedCard && (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-lg flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="font-semibold">Card Details</h2>
            <button
              onClick={() => setShowDetailPanel(false)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Card info */}
            <div>
              <h3 className="text-xs uppercase text-gray-500 font-medium mb-2">Info</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Card ID:</span>
                  <span>{selectedCard.card.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Note ID:</span>
                  <span>{selectedCard.card.nid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Deck:</span>
                  <span>{selectedCard.card.deckName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span>{selectedCard.card.notetypeName}</span>
                </div>
              </div>
            </div>

            {/* Scheduling */}
            <div>
              <h3 className="text-xs uppercase text-gray-500 font-medium mb-2">Scheduling</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Interval:</span>
                  <span>{selectedCard.card.ivl}d</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Ease:</span>
                  <span>{(selectedCard.card.factor / 1000).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Reviews:</span>
                  <span>{selectedCard.card.reps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Lapses:</span>
                  <span>{selectedCard.card.lapses}</span>
                </div>
              </div>
            </div>

            {/* Tags */}
            {selectedCard.card.tags.length > 0 && (
              <div>
                <h3 className="text-xs uppercase text-gray-500 font-medium mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1">
                  {selectedCard.card.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-gray-100 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Front field preview */}
            <div>
              <h3 className="text-xs uppercase text-gray-500 font-medium mb-2">Front</h3>
              <div className="p-2 bg-gray-50 rounded text-sm">
                {selectedCard.card.fields['Front'] || '(empty)'}
              </div>
            </div>

            {/* Back field preview */}
            {selectedCard.card.fields['Back'] && (
              <div>
                <h3 className="text-xs uppercase text-gray-500 font-medium mb-2">Back</h3>
                <div className="p-2 bg-gray-50 rounded text-sm">
                  {selectedCard.card.fields['Back']}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t p-4 space-y-2">
            <button
              onClick={() => navigate(`/cards/cards/${selectedCard.card.nid}/edit`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Edit className="w-4 h-4" />
              Edit Note
            </button>
            <button
              onClick={() => navigate(`/cards/study?deckId=${selectedCard.card.did}`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <Play className="w-4 h-4" />
              Study This Deck
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
