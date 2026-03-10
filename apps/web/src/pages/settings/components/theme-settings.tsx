import { view, useService } from '@rabjs/react';
import { ThemeService } from '../../../services/theme.service';

export const ThemeSettings = view(() => {
  const themeService = useService(ThemeService);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">主题设置</h1>
      <div className="max-w-md">
        <div className="bg-white dark:bg-dark-800 rounded-lg p-6 border border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold mb-4">外观</h2>
          <div className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300">深色模式</span>
            <button
              onClick={() => themeService.toggleTheme()}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-dark-900"
              style={{
                backgroundColor: themeService.isDark() ? '#10b981' : '#e5e7eb',
              }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  themeService.isDark() ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
