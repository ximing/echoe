import type { InboxReportSummaryDto } from '@echoe/dto';
import { view, useService } from '@rabjs/react';
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { InboxReportService } from '../../services/inbox-report.service.js';
import { ArrowLeft, Calendar, Tag, AlertCircle, CheckCircle2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Configure marked for better rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Parse summary JSON string
const parseSummary = (summary: string | null): InboxReportSummaryDto | null => {
  if (!summary) return null;
  try {
    return JSON.parse(summary) as InboxReportSummaryDto;
  } catch {
    return null;
  }
};

export const InboxReportDetailPage = view(() => {
  const { reportId } = useParams<{ reportId: string }>();
  const reportService = useService(InboxReportService);
  const navigate = useNavigate();

  useEffect(() => {
    if (reportId) {
      reportService.loadReport(reportId);
    }
    return () => {
      reportService.clearCurrentReport();
    };
  }, [reportId, reportService]);

  const handleBack = () => {
    navigate('/inbox/reports');
  };

  const renderMarkdown = (content: string) => {
    const rawHtml = marked(content);
    const cleanHtml = DOMPurify.sanitize(rawHtml as string);
    return { __html: cleanHtml };
  };

  if (reportService.isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-dark-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!reportService.currentReport) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-dark-900">
        <AlertCircle className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
        <p className="text-lg font-medium text-gray-700 dark:text-gray-300">报告未找到</p>
        <button
          onClick={handleBack}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          返回列表
        </button>
      </div>
    );
  }

  const report = reportService.currentReport;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-dark-900">
      {/* Header */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-6 py-4">
        <div className="flex items-center gap-4 mb-2">
          <button
            onClick={handleBack}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{report.date}</h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              创建于 {new Date(report.createdAt).toLocaleString('zh-CN')}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Summary Section */}
          {(() => {
            const summary = parseSummary(report.summary);
            return summary && (
              <div className="bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
                  报告摘要
                </h2>
                <div className="space-y-4">
                  {/* Topics */}
                  {summary.topics && summary.topics.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Tag className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          主题
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {summary.topics.map((topic: string, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mistakes */}
                  {summary.mistakes && summary.mistakes.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          需要注意
                        </h3>
                      </div>
                      <ul className="space-y-1">
                        {summary.mistakes.map((mistake: string, idx: number) => (
                          <li
                            key={idx}
                            className="text-sm text-gray-600 dark:text-gray-400 pl-4 before:content-['•'] before:mr-2 before:text-orange-600 dark:before:text-orange-400"
                          >
                            {mistake}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions */}
                  {summary.actions && summary.actions.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          行动建议
                        </h3>
                      </div>
                      <ul className="space-y-1">
                        {summary.actions.map((action: string, idx: number) => (
                          <li
                            key={idx}
                            className="text-sm text-gray-600 dark:text-gray-400 pl-4 before:content-['✓'] before:mr-2 before:text-green-600 dark:before:text-green-400"
                          >
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Markdown Content */}
          <div className="bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
              详细报告
            </h2>
            <div
              className="prose prose-sm dark:prose-invert max-w-none
                prose-headings:text-gray-900 dark:prose-headings:text-gray-100
                prose-p:text-gray-700 dark:prose-p:text-gray-300
                prose-a:text-blue-600 dark:prose-a:text-blue-400
                prose-strong:text-gray-900 dark:prose-strong:text-gray-100
                prose-code:text-purple-600 dark:prose-code:text-purple-400
                prose-pre:bg-gray-100 dark:prose-pre:bg-dark-700
                prose-ul:text-gray-700 dark:prose-ul:text-gray-300
                prose-ol:text-gray-700 dark:prose-ol:text-gray-300"
              dangerouslySetInnerHTML={renderMarkdown(report.content)}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
