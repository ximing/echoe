import { Service } from '@rabjs/react';
import * as apiTokenApi from '../api/api-token';
import type { ApiTokenListItemDto, CreateApiTokenResponseDto } from '@echoe/dto';

/**
 * Service for managing API tokens
 * Handles token listing, creation, and deletion
 */
export class ApiTokenService extends Service {
  tokens: ApiTokenListItemDto[] = [];
  isLoading = false;
  error: string | null = null;

  /**
   * Load all API tokens for the current user
   */
  async loadTokens(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await apiTokenApi.getApiTokens();
      this.tokens = response.data || [];
    } catch (error) {
      console.error('Failed to load API tokens:', error);
      this.error = error instanceof Error ? error.message : 'Failed to load tokens';
      this.tokens = [];
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Create a new API token
   * @param name - Name for the token
   * @returns The created token response including the plaintext token (shown only once)
   */
  async createToken(name: string): Promise<CreateApiTokenResponseDto> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await apiTokenApi.createApiToken({ name });
      // Reload tokens to get the updated list (without plaintext token)
      await this.loadTokens();
      if (!response.data) {
        throw new Error('Failed to create API token: no data returned');
      }
      return response.data;
    } catch (error) {
      console.error('Failed to create API token:', error);
      this.error = error instanceof Error ? error.message : 'Failed to create token';
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Delete an API token
   * @param tokenId - Business ID of the token to delete
   */
  async deleteToken(tokenId: string): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      await apiTokenApi.deleteApiToken(tokenId);
      // Remove from local state
      this.tokens = this.tokens.filter((t) => t.tokenId !== tokenId);
    } catch (error) {
      console.error('Failed to delete API token:', error);
      this.error = error instanceof Error ? error.message : 'Failed to delete token';
      throw error;
    } finally {
      this.isLoading = false;
    }
  }
}
