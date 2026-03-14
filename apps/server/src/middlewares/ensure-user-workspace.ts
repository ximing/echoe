import { Request, Response, NextFunction } from 'express';
import { Container } from 'typedi';

import { EchoeSeedService } from '../services/echoe-seed.service.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to ensure user has an Echoe workspace initialized.
 * This is a safety net for users who registered before workspace auto-initialization
 * or if registration-time initialization failed.
 *
 * Only runs for authenticated Echoe API requests.
 */
export async function ensureUserWorkspace(request: Request, response: Response, next: NextFunction) {
  // Only apply to Echoe API routes
  if (!request.path.startsWith('/api/v1/echoe')) {
    return next();
  }

  // Only apply to authenticated requests
  const user = request.user as { uid?: string } | undefined;
  if (!user?.uid) {
    return next();
  }

  try {
    const echoeSeedService = Container.get(EchoeSeedService);
    await echoeSeedService.ensureUserWorkspace(user.uid);
  } catch (error) {
    // Log error but don't fail the request
    // If workspace initialization fails, the actual API call will likely fail with a better error
    logger.error(`Failed to ensure workspace for uid=${user.uid}:`, error);
  }

  next();
}
