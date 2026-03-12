import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { view, useService } from '@rabjs/react';
import { Flame, Loader2 } from 'lucide-react';
import { EchoeDeckService } from '../../services/echoe-deck.service';
import { EchoeDashboardService } from '../../services/echoe-dashboard.service';

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
    </div>
  );
});

export default DashboardPage;
