import { Request, Response, NextFunction } from 'express';
import { Container } from 'typedi';

import { ApiTokenService } from '../services/api-token.service.js';
import { UserService } from '../services/user.service.js';
import { InboxMetricsService } from '../services/inbox-metrics.service.js';
import { logger } from '../utils/logger.js';

/**
 * API Token Authentication Middleware
 *
 * This middleware validates the Authorization: Bearer <token> header
 * and sets the authenticated user on the request context.
 *
 * Priority: Token authentication takes precedence over JWT authentication.
 * When both credentials are present, token authentication is used.
 *
 * Expected header format:
 * Authorization: Bearer <plaintext_token>
 */
export const apiTokenAuthMiddleware = async (
  request: Request,
  response: Response,
  next: NextFunction
) => {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.authorization;

    // No Bearer token - skip this middleware and let JWT handle it
    if (!authHeader) {
      return next();
    }

    // Check Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      // Invalid format - skip this middleware
      return next();
    }

    const plaintextToken = parts[1];

    // Skip if token is empty
    if (!plaintextToken) {
      return next();
    }

    // Validate the token
    const apiTokenService = Container.get(ApiTokenService);
    const metricsService = Container.get(InboxMetricsService);
    const apiToken = await apiTokenService.validateToken(plaintextToken);

    // Token is invalid or deleted - skip this middleware
    if (!apiToken) {
      metricsService.trackTokenAuthFailure('invalid_token');
      return next();
    }

    // Get user from database
    const userService = Container.get(UserService);
    const user = await userService.findUserByUid(apiToken.uid);

    // User not found or soft-deleted - return 401
    if (!user || user.deletedAt > 0) {
      metricsService.trackTokenAuthFailure('user_not_found_or_deleted', apiToken.tokenId);
      return response.status(401).json({
        success: false,
        message: 'Invalid token: user not found or deleted',
      });
    }

    // Set user on request - this takes precedence over JWT
    request.user = {
      uid: user.uid,
      email: user.email ?? undefined,
      nickname: user.nickname ?? undefined,
    };

    // Store apiTokenId for audit purposes
    request.apiTokenId = apiToken.tokenId;

    logger.debug(`API token authenticated: ${apiToken.tokenId} for user ${user.uid}`);
    metricsService.trackTokenAuthSuccess(user.uid, apiToken.tokenId);

    // Continue to the next middleware or route handler
    // This bypasses JWT authentication since we already set request.user
    next();
  } catch (error) {
    logger.error('API token authentication error:', {
      error: error instanceof Error ? error.message : String(error),
    });

    const metricsService = Container.get(InboxMetricsService);
    metricsService.trackTokenAuthFailure('authentication_error');

    // Return 401 for any authentication errors
    return response.status(401).json({
      success: false,
      message: 'Token authentication failed',
    });
  }
};

// Extend Express Request type to include apiTokenId
declare global {
  namespace Express {
    interface Request {
      apiTokenId?: string;
    }
  }
}
