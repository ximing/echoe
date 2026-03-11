import { NavLink } from 'react-router';
import { User, Bot, Palette, Info, FileText, Tag, Image, Upload, Copy, BarChart3, Settings } from 'lucide-react';

export const SettingsMenu = () => {
  const cardManagementItems: Array<{ id: string; label: string; icon: React.ReactNode; to: string }> = [
    {
      id: 'notetypes',
      label: '笔记类型',
      icon: <FileText className="w-5 h-5" />,
      to: '/settings/notetypes',
    },
    {
      id: 'tags',
      label: '标签',
      icon: <Tag className="w-5 h-5" />,
      to: '/settings/tags',
    },
    {
      id: 'media',
      label: '媒体文件',
      icon: <Image className="w-5 h-5" />,
      to: '/settings/media',
    },
    {
      id: 'import',
      label: '导入',
      icon: <Upload className="w-5 h-5" />,
      to: '/settings/import',
    },
    {
      id: 'duplicates',
      label: '重复卡片',
      icon: <Copy className="w-5 h-5" />,
      to: '/settings/duplicates',
    },
    {
      id: 'statistics',
      label: '统计数据',
      icon: <BarChart3 className="w-5 h-5" />,
      to: '/settings/statistics',
    },
    {
      id: 'cards-settings',
      label: '卡片设置',
      icon: <Settings className="w-5 h-5" />,
      to: '/settings/cards-settings',
    },
  ];

  const menuItems: Array<{ id: string; label: string; icon: React.ReactNode; to: string }> = [
    {
      id: 'account',
      label: '账户设置',
      icon: <User className="w-5 h-5" />,
      to: '/settings/account',
    },
    {
      id: 'models',
      label: '大模型设置',
      icon: <Bot className="w-5 h-5" />,
      to: '/settings/models',
    },
    {
      id: 'theme',
      label: '主题设置',
      icon: <Palette className="w-5 h-5" />,
      to: '/settings/theme',
    },
    {
      id: 'about',
      label: '关于',
      icon: <Info className="w-5 h-5" />,
      to: '/settings/about',
    },
  ];

  return (
    <aside className="w-[240px] flex-shrink-0 px-4 py-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-6 px-3">设置</h2>
      <nav className="space-y-1">
        {/* Card Management Section */}
        <div className="mb-4">
          <h3 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            卡片管理
          </h3>
          {cardManagementItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-dark-700 my-3" />

        {/* Settings Section */}
        {menuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'
              }`
              }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};
