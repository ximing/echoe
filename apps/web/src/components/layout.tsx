import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { view, useService } from '@rabjs/react';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { EchoeDeckService } from '../services/echoe-deck.service';
import { Sun, Moon, LogOut, Settings, Zap, Layers, Search, Plus, FileText, Tag, Image, BarChart3 } from 'lucide-react';
import logoUrl from '../assets/logo.png';
import logoDarkUrl from '../assets/logo-dark.png';
import { isElectron, isMacOS } from '../electron/isElectron';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = view(({ children }: LayoutProps) => {
  const authService = useService(AuthService);
  const themeService = useService(ThemeService);
  const deckService = useService(EchoeDeckService);
  const navigate = useNavigate();
  const dueCount = deckService.getTotalDue();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check active routes
  const isStudyPage = location.pathname.startsWith('/cards/study');
  const isMyDecksPage = location.pathname === '/cards';
  const isBrowseCardsPage = location.pathname.startsWith('/cards/browser');
  const isNoteTypesPage = location.pathname.startsWith('/cards/notetypes');
  const isSettingsPage = location.pathname.startsWith('/settings');
  const isTagsPage = location.pathname.startsWith('/cards/tags');
  const isMediaPage = location.pathname.startsWith('/cards/media');
  const isStatsPage = location.pathname.startsWith('/cards/stats');

  // Check if FAB should be shown (on /cards or /cards/study/* routes)
  const showFab = location.pathname === '/cards' || location.pathname.startsWith('/cards/study');

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMenuOpen]);

  const handleThemeToggle = () => {
    themeService.toggleTheme();
  };

  const handleLogout = () => {
    setIsMenuOpen(false);
    authService.logout();
    navigate('/auth', { replace: true });
  };

  const userName = authService.user?.nickname || authService.user?.email?.split('@')[0] || 'User';
  const userEmail = authService.user?.email || '';
  const userAvatar = authService.user?.avatar;

  const isElectronApp = isElectron();
  const isMac = isMacOS();
  const needsTopPadding = isElectronApp && isMac;

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-gray-50 transition-colors">
      {/* Electron macOS Drag Area */}
      {needsTopPadding && (
        <div
          className="fixed top-0 left-0 right-0 h-[30px] z-40 pointer-events-none"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      )}

      {/* Left Sidebar - Fixed 70px */}
      <aside className="w-[70px] flex-shrink-0 border-r border-gray-100 dark:border-dark-800 flex flex-col items-center py-4 gap-4">
        {/* Logo Area */}
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${needsTopPadding ? 'mt-4' : ''}`}
        >
          <img
            src={logoUrl}
            alt="echoe Logo"
            className="w-full h-full object-cover block dark:hidden"
          />
          <img
            src={logoDarkUrl}
            alt="echoe Logo"
            className="w-full h-full object-cover hidden dark:block"
          />
        </div>

        {/* Navigation Section */}
        <nav className="flex flex-col items-center gap-2 flex-shrink-0">
          {/* Study/Review Navigation */}
          <div className="relative">
            <button
              onClick={() => {
                if (dueCount > 0) {
                  navigate('/cards/study');
                } else {
                  navigate('/cards');
                }
              }}
              className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                isStudyPage
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800'
              }`}
              title={dueCount > 0 ? '学习' : '暂无待学卡片'}
              aria-label={dueCount > 0 ? '学习' : '暂无待学卡片'}
            >
              <Zap className="w-6 h-6" />
            </button>
            {dueCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-xs font-semibold rounded-full">
                {dueCount > 99 ? '99+' : dueCount}
              </span>
            )}
          </div>

          {/* My Decks Navigation */}
          <button
            onClick={() => navigate('/cards')}
            className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
              isMyDecksPage
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800'
            }`}
            title="我的卡组"
            aria-label="我的卡组"
          >
            <Layers className="w-6 h-6" />
          </button>

          {/* Browse Cards Navigation */}
          <button
            onClick={() => navigate('/cards/browser')}
            className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
              isBrowseCardsPage
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800'
            }`}
            title="浏览卡片"
            aria-label="浏览卡片"
          >
            <Search className="w-6 h-6" />
          </button>

          {/* Note Types Navigation */}
          <button
            onClick={() => navigate('/cards/notetypes')}
            className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
              isNoteTypesPage
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800'
            }`}
            title="笔记类型"
            aria-label="笔记类型"
          >
            <FileText className="w-6 h-6" />
          </button>

          {/* Tags Navigation */}
          <button
            onClick={() => navigate('/cards/tags')}
            className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
              isTagsPage
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800'
            }`}
            title="标签"
            aria-label="标签"
          >
            <Tag className="w-6 h-6" />
          </button>

          {/* Media Navigation */}
          <button
            onClick={() => navigate('/cards/media')}
            className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
              isMediaPage
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800'
            }`}
            title="媒体文件"
            aria-label="媒体文件"
          >
            <Image className="w-6 h-6" />
          </button>

          {/* Statistics Navigation */}
          <button
            onClick={() => navigate('/cards/stats')}
            className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
              isStatsPage
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800'
            }`}
            title="统计数据"
            aria-label="统计数据"
          >
            <BarChart3 className="w-6 h-6" />
          </button>
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom Section */}
        <div className="flex flex-col items-center gap-3 flex-shrink-0">
          {/* Settings Button */}
          <button
            onClick={() => {
              navigate(`/settings`);
            }}
            className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
              isSettingsPage
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800'
            }`}
            title="设置"
            aria-label="设置"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={handleThemeToggle}
            className="w-12 h-12 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800 transition-colors"
            title={themeService.isDark() ? '切换到亮色模式' : '切换到暗色模式'}
            aria-label="切换主题"
          >
            {themeService.isDark() ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* User Menu */}
          <div className="relative w-full" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="w-12 h-12 mx-auto flex items-center justify-center bg-gray-100 dark:bg-dark-800 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-700 transition-colors"
              title={userName}
              aria-label="用户菜单"
              aria-expanded={isMenuOpen}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={`${userName} avatar`}
                  className="w-6 h-6 rounded object-cover"
                />
              ) : (
                <div className="w-6 h-6 bg-primary-600 rounded flex items-center justify-center text-white text-xs font-semibold">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute left-full ml-2 bottom-0 w-56 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg shadow-lg z-50">
                {/* User Info Section */}
                <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-700">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{userName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 truncate mt-1">
                    {userEmail}
                  </p>
                </div>

                {/* Menu Items */}
                <div className="py-2">
                  {/* Logout */}
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors cursor-pointer border-t border-gray-200 dark:border-dark-700 mt-2 pt-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>登出</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>

      {/* Floating Action Button - Create New Card */}
      {showFab && (
        <button
          onClick={() => navigate('/cards/cards/new')}
          className="fixed bottom-6 right-6 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40"
          title="Create new card"
          aria-label="Create new card"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}
    </div>
  );
});
