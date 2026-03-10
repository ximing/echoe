import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Controller, Get, Req, Res } from 'routing-controllers';
import { Service } from 'typedi';

import { logger } from '../utils/logger.js';

import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

/**
 * Serves index.html for SPA routing
 * NOTE: This controller is a fallback and should only handle routes that don't match any API routes.
 * It uses a very specific route pattern to avoid matching /api/* routes.
 */
@Service()
@Controller('')
export class StaticController {
  private indexPath: string;

  constructor() {
    // Path to index.html from the web build
    this.indexPath = join(__dirname, '../../public/index.html');
  }

  /**
   * Handle root path - serve index.html for SPA
   */
  @Get('/')
  serveRoot(@Req() req: Request, @Res() res: Response) {
    return this.serveIndex(req, res);
  }

  /**
   * Handle paths that don't start with /api - serve index.html for SPA
   * This uses a regex that explicitly excludes /api prefix
   */
  @Get('/(^(/api)|/[^/]+)')
  serveIndex(@Req() req: Request, @Res() res: Response) {
    // Double-check: skip API routes
    if (req.path.startsWith('/api')) {
      return undefined;
    }

    return this.sendIndex(res);
  }

  private sendIndex(res: Response) {
    try {
      if (existsSync(this.indexPath)) {
        const html = readFileSync(this.indexPath, 'utf-8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      }

      return res
        .status(404)
        .send('Not Found: index.html not found. Make sure web application is built.');
    } catch (error) {
      logger.error('Error serving index.html:', error);
      return res.status(500).send('Internal Server Error');
    }
  }
}
