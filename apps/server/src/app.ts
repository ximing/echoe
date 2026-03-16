import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import cron from 'node-cron';
import dayjs from 'dayjs';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { useExpressServer, Action, useContainer } from 'routing-controllers';
import { Container } from 'typedi';

import { config } from './config/config.js';
import { controllers } from './controllers/index.js';
import { initializeDatabase, checkConnectionHealth, closeDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { EchoeSeedService } from './services/echoe-seed.service.js';
import { EchoeStudyService } from './services/echoe-study.service.js';
import { InboxScheduledJobsService } from './services/inbox-scheduled-jobs.service.js';
import { initIOC } from './ioc.js';
import { authHandler } from './middlewares/auth-handler.js';
import { apiTokenAuthMiddleware } from './middlewares/api-token-auth.middleware.js';
import { ensureUserWorkspace } from './middlewares/ensure-user-workspace.js';
import { errorHandler } from './middlewares/error-handler.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dayjs.locale(config.locale.language);
useContainer(Container);

export async function createApp() {
  await initIOC();

  // Initialize MySQL database connection pool
  initializeDatabase();

  // Check MySQL connection health
  const isHealthy = await checkConnectionHealth();
  if (!isHealthy) {
    throw new Error('MySQL connection health check failed');
  }

  // Run database migrations
  try {
    await runMigrations();
  } catch (error) {
    logger.error('Failed to run database migrations:', error);
    throw error;
  }

  // Seed Echoe default data (note types, templates, default deck)
  try {
    const echoeSeedService = Container.get(EchoeSeedService);
    await echoeSeedService.seedIfNeeded();
  } catch (error) {
    logger.error('Failed to seed Echoe default data:', error);
    throw error;
  }

  const echoeStudyService = Container.get(EchoeStudyService);
  const studyUnburyCron = config.scheduler?.studyUnburyCron || '5 0 * * *';

  const runStudyUnburyJob = async (trigger: 'startup' | 'schedule') => {
    try {
      const { userCount, unburiedCount } = await echoeStudyService.unburyAtDayBoundaryForAllUsers();
      logger.info('Study unbury job completed', {
        event: 'study_unbury_job_completed',
        trigger,
        userCount,
        unburiedCount,
      });
    } catch (error) {
      logger.error('Study unbury job failed', {
        event: 'study_unbury_job_failed',
        trigger,
        error,
      });
    }
  };

  const studyUnburyTask = cron.schedule(
    studyUnburyCron,
    () => {
      void runStudyUnburyJob('schedule');
    },
    { timezone: config.locale.timezone }
  );

  logger.info('Study unbury cron registered', {
    event: 'study_unbury_cron_registered',
    cron: studyUnburyCron,
    timezone: config.locale.timezone,
  });

  // Catch-up run for deployments/restarts that cross day boundary.
  await runStudyUnburyJob('startup');

  // Inbox scheduled jobs
  const inboxScheduledJobsService = Container.get(InboxScheduledJobsService);

  // Weekly summary aggregation job - runs every Sunday at 2 AM
  const weeklySummaryCron = '0 2 * * 0';
  const runWeeklySummaryJob = async (trigger: 'startup' | 'schedule') => {
    try {
      const { processedUsers } = await inboxScheduledJobsService.runWeeklySummaryAggregation();
      logger.info('Weekly summary aggregation job completed', {
        event: 'weekly_summary_aggregation_job_completed',
        trigger,
        processedUsers,
      });
    } catch (error) {
      logger.error('Weekly summary aggregation job failed', {
        event: 'weekly_summary_aggregation_job_failed',
        trigger,
        error,
      });
    }
  };

  const weeklySummaryTask = cron.schedule(
    weeklySummaryCron,
    () => {
      void runWeeklySummaryJob('schedule');
    },
    { timezone: config.locale.timezone }
  );

  logger.info('Weekly summary aggregation cron registered', {
    event: 'weekly_summary_aggregation_cron_registered',
    cron: weeklySummaryCron,
    timezone: config.locale.timezone,
  });

  // Cleanup deleted records job - runs daily at 3 AM
  const cleanupDeletedCron = '0 3 * * *';
  const runCleanupDeletedJob = async (trigger: 'startup' | 'schedule') => {
    try {
      const { deletedInboxCount, deletedReportCount, deletedTokenCount } =
        await inboxScheduledJobsService.runCleanupDeletedRecords();
      logger.info('Cleanup deleted records job completed', {
        event: 'cleanup_deleted_records_job_completed',
        trigger,
        deletedInboxCount,
        deletedReportCount,
        deletedTokenCount,
      });
    } catch (error) {
      logger.error('Cleanup deleted records job failed', {
        event: 'cleanup_deleted_records_job_failed',
        trigger,
        error,
      });
    }
  };

  const cleanupDeletedTask = cron.schedule(
    cleanupDeletedCron,
    () => {
      void runCleanupDeletedJob('schedule');
    },
    { timezone: config.locale.timezone }
  );

  logger.info('Cleanup deleted records cron registered', {
    event: 'cleanup_deleted_records_cron_registered',
    cron: cleanupDeletedCron,
    timezone: config.locale.timezone,
  });

  const app: any = express();

  // 中间件配置
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:', 'http:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'http:', 'https:'],
          mediaSrc: ["'self'", 'https:', 'http:', 'blob:'],
        },
      },
    })
  );
  app.use(cors());
  app.use(cookieParser());
  app.use(morgan('dev'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  // API Token auth runs BEFORE JWT auth to implement Token > JWT priority
  app.use(apiTokenAuthMiddleware);
  app.use(authHandler);
  app.use(ensureUserWorkspace);

  // Serve static files from public directory (web build artifacts)
  const publicPath = join(__dirname, '../public');
  app.use(
    express.static(publicPath, {
      maxAge: '1d',
      etag: false,
      // Cache busting for JS and CSS files
      setHeaders: (res, path) => {
        if (/\.(js|css)$/.test(path)) {
          res.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  // 配置 routing-controllers
  useExpressServer(app, {
    controllers,
    validation: true,
    defaultErrorHandler: false,
    currentUserChecker: async (action: Action) => {
      if (action.request.user) {
        return action.request.user;
      }
      return null;
    },
  });

  // SPA fallback: serve index.html for non-API routes that didn't match any route
  // This must be AFTER routing-controllers to catch 404s for SPA routes
  const indexPath = join(publicPath, 'index.html');
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip API routes - they should have been handled by routing-controllers
    if (req.path.startsWith('/api')) {
      return next();
    }

    // Skip if response is already being sent
    if (res.headersSent) {
      return next();
    }

    // Try to serve index.html for SPA routing
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    return next();
  });

  // 错误处理中间件
  app.use(errorHandler);

  const server = app.listen(config.port, () => {
    logger.info(`Server is running on port ${config.port}`);
  });

  // Graceful shutdown handler
  const shutdownHandler = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      try {
        // Stop scheduled tasks before database shutdown.
        studyUnburyTask.stop();
        weeklySummaryTask.stop();
        cleanupDeletedTask.stop();

        // Close MySQL connection pool
        await closeDatabase();
        logger.info('All resources cleaned up');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));

  return app;
}
