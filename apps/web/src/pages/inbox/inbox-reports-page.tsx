import type { InboxReportSummaryDto } from '@echoe/dto';
import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { InboxReportService } from '../../services/inbox-report.service.js';
import { Plus, FileText, Calendar, X } from 'lucide-react';

// Parse summary JSON string
const parseSummary = (summary: string | null): InboxReportSummaryDto | null => {
  if (!summary) return null;
  try {
    return JSON.parse(summary) as InboxReportSummaryDto;
  } catch {
    return null;
  }
};

export const InboxReportsPage = view(() => {
  const reportService = useService(InboxReportService);
  const navigate = useNavigate();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  useEffect(() => {
    reportService.loadReports();
  }, []);

  const handleGenerateReport = () => {
    setShowGenerateDialog(true);
  };

  const handleReportClick = (reportId: string) => {
    navigate(`/inbox/reports/${reportId}`);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-dark-900">
      {/* Header */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">收件箱日报</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              查看和生成每日收件箱整理报告
            </p>
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={reportService.isGenerating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reportService.isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                生成中...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                生成日报
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {reportService.isLoading && reportService.list.items.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : reportService.list.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            <FileText className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无日报</p>
            <p className="text-sm mt-2">点击右上角"生成日报"按钮创建第一份日报</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reportService.list.items.map((report) => {
              const summary = parseSummary(report.summary);
              return (
                <div
                  key={report.inboxReportId}
                  onClick={() => handleReportClick(report.inboxReportId)}
                  className="bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700 p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                          {report.date}
                        </h3>
                      </div>
                      {summary && summary.topics && summary.topics.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium min-w-[60px]">
                              主题:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {summary.topics.slice(0, 3).map((topic: string, idx: number) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                                >
                                  {topic}
                                </span>
                              ))}
                              {summary.topics.length > 3 && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  +{summary.topics.length - 3} 更多
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        创建于 {new Date(report.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <FileText className="w-5 h-5 text-gray-400 dark:text-gray-500 ml-4" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {reportService.list.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => reportService.setPage(reportService.list.page - 1)}
              disabled={reportService.list.page === 1 || reportService.isLoading}
              className="px-4 py-2 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              第 {reportService.list.page} / {reportService.list.totalPages} 页
            </span>
            <button
              onClick={() => reportService.setPage(reportService.list.page + 1)}
              disabled={
                reportService.list.page === reportService.list.totalPages ||
                reportService.isLoading
              }
              className="px-4 py-2 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* Generate Report Dialog */}
      {showGenerateDialog && (
        <GenerateReportDialog
          onClose={() => setShowGenerateDialog(false)}
          onSubmit={async (date) => {
            await reportService.generateReport(date);
            setShowGenerateDialog(false);
          }}
        />
      )}
    </div>
  );
});

// Generate Report Dialog Component
const GenerateReportDialog = view(
  ({
    onClose,
    onSubmit,
  }: {
    onClose: () => void;
    onSubmit: (date: string) => Promise<void>;
  }) => {
    const [date, setDate] = useState(() => {
      // Default to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!date) return;

      setIsSubmitting(true);
      try {
        await onSubmit(date);
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">生成日报</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                选择日期 *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                将为选定日期生成收件箱整理报告
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !date}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                生成
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
);
