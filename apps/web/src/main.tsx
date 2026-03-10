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
import { EchoeStudyService } from './services/echoe-study.service';
import { AuthService } from './services/auth.service';
import { ThemeService } from './services/theme.service';
import { ToastService } from './services/toast.service';
import { UserModelService } from './services/user-model.service';

/**
 * Register services globally
 * These are accessible throughout the entire application
 */
const AppWithServices = bindServices(App, []);
register(AuthService);
register(ThemeService);
register(ToastService);
register(UserModelService);
register(EchoeDeckService);
register(EchoeNoteService);
register(EchoeStudyService);
register(EchoeStatsService);
register(EchoeSettingsService);
register(EchoeCsvImportService);

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
