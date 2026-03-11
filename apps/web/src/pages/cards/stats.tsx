import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { EchoeStatsService } from '../../services/echoe-stats.service';
import { getDecks } from '../../api/echoe';
import type { EchoeDeckWithCountsDto } from '@echoe/dto';
import { ArrowLeft, RefreshCw, Calendar, Clock, TrendingUp, Layers } from 'lucide-react';

export default function StatsPage() {
  return <StatsPageContent />;
}

const StatsPageContent = view(() => {
  const statsService = useService(EchoeStatsService);
  const navigate = useNavigate();

  // State
  const [decks, setDecks] = useState<EchoeDeckWithCountsDto[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<number | undefined>(undefined);
  const [historyDays, setHistoryDays] = useState(30);
  const [forecastDays, setForecastDays] = useState(14);

  // Load initial data
  useEffect(() => {
    loadDecks();
    statsService.loadAllStats();
  }, []);

  // Reload stats when deck or time range changes
  useEffect(() => {
    statsService.setDeckId(selectedDeckId);
  }, [selectedDeckId]);

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

  const handleRefresh = () => {
    statsService.loadAllStats();
  };

  // Format time from milliseconds
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  // Get data for today's stats pie chart
  const getTodayStatsData = () => {
    const stats = statsService.todayStats;
    if (!stats) return [];

    return [
      { name: 'Again', value: stats.again, color: '#EF4444' },
      { name: 'Hard', value: stats.hard, color: '#F97316' },
      { name: 'Good', value: stats.good, color: '#10B981' },
      { name: 'Easy', value: stats.easy, color: '#3B82F6' },
    ].filter(d => d.value > 0);
  };

  // Get data for maturity pie chart
  const getMaturityData = () => {
    const maturity = statsService.maturity;
    if (!maturity) return [];

    return [
      { name: 'New', value: maturity.new, color: '#3B82F6' },
      { name: 'Learning', value: maturity.learning, color: '#EF4444' },
      { name: 'Young', value: maturity.young, color: '#F59E0B' },
      { name: 'Mature', value: maturity.mature, color: '#10B981' },
    ].filter(d => d.value > 0);
  };

  // Get data for history chart
  const getHistoryData = () => {
    return statsService.history.map(day => ({
      ...day,
      date: day.date.slice(5), // MM-DD format
    }));
  };

  // Get data for forecast chart
  const getForecastData = () => {
    return statsService.forecast.slice(0, forecastDays).map(day => ({
      ...day,
      date: day.date.slice(5), // MM-DD format
    }));
  };

  const isLoading = statsService.isLoadingToday || statsService.isLoadingHistory ||
    statsService.isLoadingMaturity || statsService.isLoadingForecast;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/cards')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">Learning Statistics</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedDeckId || ''}
            onChange={(e) => setSelectedDeckId(e.target.value ? Number(e.target.value) : undefined)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Decks</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>

          <select
            value={historyDays}
            onChange={(e) => setHistoryDays(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>

          <select
            value={forecastDays}
            onChange={(e) => setForecastDays(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading && !statsService.todayStats ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Today's Summary Cards */}
            <div className="lg:col-span-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Studied Today */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-gray-500">Studied Today</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {statsService.todayStats?.studied || 0}
                  </div>
                  <div className="text-xs text-gray-500">cards</div>
                </div>

                {/* Time Spent */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-gray-500">Time Spent</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatTime(statsService.todayStats?.timeSpent || 0)}
                  </div>
                  <div className="text-xs text-gray-500">today</div>
                </div>

                {/* Average Reviews */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-purple-500" />
                    <span className="text-sm text-gray-500">Daily Average</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {statsService.getAverageReviewsPerDay()}
                  </div>
                  <div className="text-xs text-gray-500">reviews/day</div>
                </div>

                {/* Total Cards */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-4 h-4 text-orange-500" />
                    <span className="text-sm text-gray-500">Total Cards</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {statsService.getTotalMatureCards()}
                  </div>
                  <div className="text-xs text-gray-500">in collection</div>
                </div>
              </div>
            </div>

            {/* Today's Reviews Chart */}
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Today's Reviews</h3>
              {getTodayStatsData().length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={getTodayStatsData()}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {getTodayStatsData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-gray-400">
                  No reviews today
                </div>
              )}
            </div>

            {/* Card Maturity Chart */}
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Card Maturity</h3>
              {getMaturityData().length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={getMaturityData()}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {getMaturityData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-gray-400">
                  No cards yet
                </div>
              )}
            </div>

            {/* Study History Chart */}
            <div className="lg:col-span-2 bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Study History</h3>
              {getHistoryData().length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={getHistoryData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => [`${value} cards`, 'Reviews']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-400">
                  No study history yet
                </div>
              )}
            </div>

            {/* Forecast Chart */}
            <div className="lg:col-span-2 bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Upcoming Reviews</h3>
              {getForecastData().length > 0 && getForecastData().some(d => d.dueCount > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={getForecastData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => [`${value} cards`, 'Due']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="dueCount"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={{ fill: '#10B981', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-400">
                  No upcoming reviews
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
