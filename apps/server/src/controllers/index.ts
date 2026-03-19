/* eslint-disable import/order */
import { ApiTokenController } from './v1/api-token.controller.js';
import { AuthV1Controller } from './v1/auth.controller.js';
import { EchoeConfigController } from './v1/echoe-config.controller.js';
import { EchoeCsvImportController } from './v1/echoe-csv-import.controller.js';

import { EchoeDeckController } from './v1/echoe-deck.controller.js';
import { EchoeDuplicateController } from './v1/echoe-duplicate.controller.js';
import { EchoeExportController } from './v1/echoe-export.controller.js';
import { EchoeImportController } from './v1/echoe-import.controller.js';
import { EchoeMediaController } from './v1/echoe-media.controller.js';

import { EchoeNoteController } from './v1/echoe-note.controller.js';
import { EchoeStatsController } from './v1/echoe-stats.controller.js';
import { EchoeStudyController } from './v1/echoe-study.controller.js';
import { EchoeTagController } from './v1/echoe-tag.controller.js';
import { InboxCategoryController } from './v1/inbox-category.controller.js';
import { InboxReportController } from './v1/inbox-report.controller.js';
import { InboxSourceController } from './v1/inbox-source.controller.js';
import { InboxToCardController } from './v1/inbox-to-card.controller.js';

import { InboxController } from './v1/inbox.controller.js';

import { SystemController } from './v1/system.controller.js';
import { UserModelController } from './v1/user-model.controller.js';
import { UserV1Controller } from './v1/user.controller.js';

// Note: StaticController import should stay last to avoid catching API routes
export const controllers = [
  AuthV1Controller,
  UserV1Controller,
  ApiTokenController,
  SystemController,
  EchoeDeckController,
  EchoeNoteController,
  EchoeStudyController,
  EchoeMediaController,
  EchoeExportController,
  EchoeImportController,
  EchoeStatsController,
  EchoeConfigController,
  EchoeTagController,
  EchoeCsvImportController,
  EchoeDuplicateController,
  InboxController,
  InboxReportController,
  InboxToCardController,
  InboxSourceController,
  InboxCategoryController,
  UserModelController
  // StaticController,
];
