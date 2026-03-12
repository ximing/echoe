import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { view, useService } from '@rabjs/react';
import { Flame, Loader2 } from 'lucide-react';
import { EchoeDeckService } from '../../services/echoe-deck.service';
import { EchoeDashboardService } from '../../services/echoe-dashboard.service';
import type { EchoeDeckWithCountsDto } from '@echoe/dto';
import type { MaturityBatchDeck } from '../../api/echoe';

// Returns the display name (last segment after ::) and depth level
function parseDeckName(name: string): { label: string; depth: number } {
  const parts = name.split('::');
  return { label: parts[parts.length - 1], depth: parts.length - 1 };
}

function MaturityBar({ deckId, maturityBatch }: { deckId: number; maturityBatch: MaturityBatchDeck[] }) {
  const data = maturityBatch.find((d) => d.deckId === deckId);
  if (!data) return <div className="h-1.5 rounded-full bg-gray-100 dark:bg-dark-700 w-full" />;

  const total = data.new + data.learning + data.young + data.mature;
  if (total === 0) return <div className="h-1.5 rounded-full bg-gray-100 dark:bg-dark-700 w-full" />;

  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden w-full bg-gray-100 dark:bg-dark-700">
      {data.new > 0 && <div className="bg-blue-400" style={{ width: pct(data.new) }} title={`新卡: ${data.new}`} />}
      {data.learning > 0 && <div className="bg-orange-400" style={{ width: pct(data.learning) }} title={`学习中: ${data.learning}`} />}
      {data.young > 0 && <div className="bg-yellow-400" style={{ width: pct(data.young) }} title={`年轻: ${data.young}`} />}
      {data.mature > 0 && <div className="bg-green-500" style={{ width: pct(data.mature) }} title={`成熟: ${data.mature}`} />}
    </div>
  );
}

function DeckCard({
  deck,
  maturityBatch,
  onStudy,
}: {
  deck: EchoeDeckWithCountsDto;
  maturityBatch: MaturityBatchDeck[];
  onStudy: (deckId: number) => void;
}) {
  const { label, depth } = parseDeckName(deck.name);
  const dueCount = deck.newCount + deck.learnCount + deck.reviewCount;

  return (
    <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {depth > 0 && <span className="text-gray-300 dark:text-gray-600 text-xs flex-shrink-0">{'└'.repeat(depth)}</span>}
          <span className="font-medium text-gray-900 dark:text-white truncate text-sm">{label}</span>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            {deck.newCount}
          </span>
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
            {deck.learnCount}
          </span>
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            {deck.reviewCount}
          </span>
        </div>
      </div>

      <MaturityBar deckId={deck.id} maturityBatch={maturityBatch} />

      {dueCount > 0 ? (
        <button
          onClick={() => onStudy(deck.id)}
          className="w-full py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors"
        >
          学习此卡片集
        </button>
      ) : (
        <button
          disabled
          className="w-full py-1.5 rounded-lg bg-gray-100 dark:bg-dark-700 text-gray-400 dark:text-gray-500 text-xs font-medium cursor-not-allowed"
        >
          已完成 ✓
        </button>
      )}
    </div>
  );
}

export const DashboardPage = view(() => {
  const navigate = useNavigate();
  const deckService = useService(EchoeDeckService);
  const dashboardService = useService(EchoeDashboardService);

  useEffect(() => {
    deckService.loadDecks();
    dashboardService.loadAll();
  }, []);

  const totalNew = deckService.decks.reduce((s, d) => s + d.newCount, 0);
  const totalLearn = deckService.decks.reduce((s, d) => s + d.learnCount, 0);
  const totalReview = deckService.decks.reduce((s, d) => s + d.reviewCount, 0);
  const totalDue = totalNew + totalLearn + totalReview;

  const isLoading = deckService.isLoading || dashboardService.loading;
  const streak = dashboardService.streak;
  const decks = deckService.decks;
  const useGrid = decks.length <= 4;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Zone 1: Today's Action */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-100 dark:border-dark-700 p-6">
        <div className="grid grid-cols-3 gap-6 items-center">
          {/* Left: Due count */}
          <div className="space-y-3">
            <div className="text-6xl font-bold text-gray-900 dark:text-white">
              {isLoading ? <span className="text-4xl text-gray-400">...</span> : totalDue}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">今日待学</div>
            <div className="flex gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                新卡 {totalNew}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                学习中 {totalLearn}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                复习 {totalReview}
              </span>
            </div>
          </div>

          {/* Center: Streak */}
          <div className="flex flex-col items-center space-y-2">
            <Flame className="w-10 h-10 text-orange-500" />
            <div className="text-5xl font-bold text-gray-900 dark:text-white">
              {isLoading ? <span className="text-3xl text-gray-400">...</span> : streak}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">已坚持 {streak} 天</div>
          </div>

          {/* Right: Start study button */}
          <div className="flex justify-end">
            {isLoading ? (
              <button
                disabled
                className="px-8 py-3 rounded-xl bg-primary-600 text-white font-medium opacity-60 flex items-center gap-2 cursor-not-allowed"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                加载中
              </button>
            ) : totalDue === 0 ? (
              <button
                disabled
                className="px-8 py-3 rounded-xl bg-gray-100 dark:bg-dark-700 text-gray-400 dark:text-gray-500 font-medium cursor-not-allowed"
              >
                今日已完成 ✓
              </button>
            ) : (
              <button
                onClick={() => navigate('/cards/study')}
                className="px-8 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors"
              >
                开始学习
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Zone 2: Deck List */}
      {decks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">卡片集</h2>
          <div className={useGrid ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
            {decks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                maturityBatch={dashboardService.maturityBatch}
                onStudy={(id) => navigate(`/cards/study/${id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default DashboardPage;
