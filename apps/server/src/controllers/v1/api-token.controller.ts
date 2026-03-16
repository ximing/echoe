import { JsonController, Get, Post, Delete, Body, Param, CurrentUser, Req } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { ApiTokenService } from '../../services/api-token.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil as ResponseUtility } from '../../utils/response.js';

import type {
  UserInfoDto,
  CreateApiTokenDto,
  CreateApiTokenResponseDto,
  ApiTokenListItemDto,
} from '@echoe/dto';
import type { Request } from 'express';

/**
 * API Token Management Controller
 *
 * Provides endpoints for users to manage their API tokens.
 * Requires JWT authentication - API token authentication is NOT allowed
 * for self-management (to prevent token lockout scenarios).
 */
@Service()
@JsonController('/api/v1/api-tokens')
export class ApiTokenController {
  constructor(private apiTokenService: ApiTokenService) {}

  /**
   * List all active API tokens for the authenticated user
   * GET /api/v1/api-tokens
   */
  @Get()
  async listTokens(@CurrentUser() userDto: UserInfoDto, @Req() request: Request) {
    try {
      // Reject API token authentication - require JWT
      if (this.isApiTokenAuth(request)) {
        return ResponseUtility.error(ErrorCode.FORBIDDEN, 'API token authentication is not allowed for this endpoint');
      }

      if (!userDto?.uid) {
        return ResponseUtility.error(ErrorCode.UNAUTHORIZED);
      }

      const tokens = await this.apiTokenService.listTokens(userDto.uid);

      // Return tokens without sensitive hash information
      const tokenList: ApiTokenListItemDto[] = tokens.map((token) => ({
        tokenId: token.tokenId,
        name: token.name,
        deletedAt: token.deletedAt,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt,
      }));

      return ResponseUtility.success({
        tokens: tokenList,
        total: tokenList.length,
      });
    } catch (error) {
      logger.error('List API tokens error:', error);
      return ResponseUtility.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * Create a new API token for the authenticated user
   * POST /api/v1/api-tokens
   *
   * Returns plaintext token only once at creation time.
   */
  @Post()
  async createToken(
    @Body() createData: CreateApiTokenDto,
    @CurrentUser() userDto: UserInfoDto,
    @Req() request: Request
  ) {
    try {
      // Reject API token authentication - require JWT
      if (this.isApiTokenAuth(request)) {
        return ResponseUtility.error(ErrorCode.FORBIDDEN, 'API token authentication is not allowed for this endpoint');
      }

      if (!userDto?.uid) {
        return ResponseUtility.error(ErrorCode.UNAUTHORIZED);
      }

      // Validate input
      if (!createData.name || createData.name.trim().length === 0) {
        return ResponseUtility.error(ErrorCode.PARAMS_ERROR, 'Token name is required');
      }

      if (createData.name.length > 255) {
        return ResponseUtility.error(ErrorCode.PARAMS_ERROR, 'Token name must be less than 255 characters');
      }

      // Create the token
      const result = await this.apiTokenService.createToken(userDto.uid, createData.name.trim());

      // Get the created token to return full info
      const tokens = await this.apiTokenService.listTokens(userDto.uid);
      const createdToken = tokens.find((t) => t.tokenId === result.tokenId);

      if (!createdToken) {
        return ResponseUtility.error(ErrorCode.DB_ERROR, 'Failed to retrieve created token');
      }

      const response: CreateApiTokenResponseDto = {
        tokenId: result.tokenId,
        token: result.plaintextToken, // Return plaintext only once
        name: createdToken.name,
        createdAt: createdToken.createdAt,
      };

      logger.info(`API token created for user ${userDto.uid}: ${result.tokenId}`);

      return ResponseUtility.success({
        message: 'API token created successfully. Store this token securely - it will not be shown again.',
        token: response,
      });
    } catch (error) {
      logger.error('Create API token error:', error);
      return ResponseUtility.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * Delete (revoke) an API token
   * DELETE /api/v1/api-tokens/:tokenId
   *
   * Uses business ID (tokenId), not numeric auto-increment id.
   */
  @Delete('/:tokenId')
  async deleteToken(
    @Param('tokenId') tokenId: string,
    @CurrentUser() userDto: UserInfoDto,
    @Req() request: Request
  ) {
    try {
      // Reject API token authentication - require JWT
      if (this.isApiTokenAuth(request)) {
        return ResponseUtility.error(ErrorCode.FORBIDDEN, 'API token authentication is not allowed for this endpoint');
      }

      if (!userDto?.uid) {
        return ResponseUtility.error(ErrorCode.UNAUTHORIZED);
      }

      // Validate tokenId
      if (!tokenId || tokenId.trim().length === 0) {
        return ResponseUtility.error(ErrorCode.PARAMS_ERROR, 'Token ID is required');
      }

      // Delete the token
      const success = await this.apiTokenService.deleteToken(userDto.uid, tokenId.trim());

      if (!success) {
        return ResponseUtility.error(ErrorCode.NOT_FOUND, 'Token not found');
      }

      logger.info(`API token deleted for user ${userDto.uid}: ${tokenId}`);

      return ResponseUtility.success({
        message: 'API token deleted successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Token not found') {
        return ResponseUtility.error(ErrorCode.NOT_FOUND, 'Token not found');
      }
      logger.error('Delete API token error:', error);
      return ResponseUtility.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * Check if the request was authenticated via API token
   * Returns true if API token auth was used, false if JWT was used
   */
  private isApiTokenAuth(request: Request): boolean {
    return !!request.apiTokenId;
  }
}
