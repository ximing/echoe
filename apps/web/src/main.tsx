import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { bindServices, register, resolve, RSRoot, RSStrict } from '@rabjs/react';
import './index.css';
import App from './App.tsx';

import { EchoeCsvImportService } from './services/echoe-csv-import.service';
import { EchoeDeckService } from './services/echoe-deck.service';
import { EchoeNoteService } from './services/echoe-note.service';
import { EchoeSettingsService } from './services/echoe-settings.service';
import { EchoeStatsService } from './services/echoe-stats.service';
import { EchoeDashboardService } from './services/echoe-dashboard.service';
import { AuthService } from './services/auth.service';
import { ThemeService } from './services/theme.service';
import { ToastService } from './services/toast.service';
import { UserModelService } from './services/user-model.service';
import { ApiTokenService } from './services/api-token.service';
import { InboxService } from './services/inbox.service';
import { InboxReportService } from './services/inbox-report.service';
import { ApkgParserService } from './services/apkg-parser.service';
/**
 * Register services globally
 * These are accessible throughout the entire application
 */
const AppWithServices = bindServices(App, []);
register(AuthService);
register(ApkgParserService);
register(ThemeService);
register(ToastService);
register(UserModelService);
register(ApiTokenService);
register(InboxService);
register(InboxReportService);
register(EchoeDeckService);
register(EchoeNoteService);
register(EchoeStatsService);
register(EchoeSettingsService);
register(EchoeCsvImportService);
register(EchoeDashboardService);

// Initialize theme before rendering
resolve(ThemeService).loadTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RSRoot>
      <RSStrict>
        <AppWithServices />
      </RSStrict>
    </RSRoot>
  </StrictMode>
);
