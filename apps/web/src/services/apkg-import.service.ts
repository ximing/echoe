/**
 * APKG Import Service
 * Handles complete APKG import logic on the client side
 */

import { Service } from '@rabjs/react';
import { ApkgParserService } from './apkg-parser.service';
import * as echoeApi from '../api/echoe';
import type { CreateEchoeNotesBatchDto, ImportResultDto } from '@echoe/dto';

export interface ImportProgress {
  stage: 'parsing' | 'decks' | 'notetypes' | 'media' | 'notes';
  current: number;
  total: number;
  message: string;
}

export class ApkgImportService extends Service {

  get apkgParser() {
    return this.resolve(ApkgParserService);
  }

  // Progress callback
  private progressCallback?: (progress: ImportProgress) => void;

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: ImportProgress) => void) {
    this.progressCallback = callback;
  }

  /**
   * Report progress
   */
  private reportProgress(stage: ImportProgress['stage'], current: number, total: number, message: string) {
    if (this.progressCallback) {
      this.progressCallback({ stage, current, total, message });
    }
  }

  /**
   * Import APKG file completely on the client side
   */
  async importApkg(
    file: File,
    targetDeckId?: string,
    customDeckName?: string
  ): Promise<ImportResultDto> {
    const result: ImportResultDto = {
      notesAdded: 0,
      notesUpdated: 0,
      notesSkipped: 0,
      cardsAdded: 0,
      cardsUpdated: 0,
      decksAdded: 0,
      notetypesAdded: 0,
      revlogImported: 0,
      mediaImported: 0,
      errors: [],
      errorDetails: [],
    };

    try {
      // Step 1: Parse APKG file
      this.reportProgress('parsing', 0, 1, 'Parsing APKG file...');
      const parseSuccess = await this.apkgParser.parseApkgFile(file);
      if (!parseSuccess) {
        throw new Error(this.apkgParser.error || 'Failed to parse APKG file');
      }
      this.reportProgress('parsing', 1, 1, 'APKG file parsed');

      // Step 2: Create or get target deck
      this.reportProgress('decks', 0, 1, 'Creating deck...');
      let deckId = targetDeckId;

      if (!deckId) {
        // Use deck from APKG
        const mainDeck = this.apkgParser.decks.find(d => d.id !== 1); // Skip Default deck
        const deckName = customDeckName || mainDeck?.name || 'Imported Deck';

        // Create deck (handle hierarchy if needed)
        deckId = await this.createDeckHierarchy(deckName);
        result.decksAdded = 1;
      }
      this.reportProgress('decks', 1, 1, 'Deck created');

      // Step 3: Create notetypes
      this.reportProgress('notetypes', 0, this.apkgParser.models.length, 'Creating note types...');
      const notetypeMapping = await this.createNotetypes();
      result.notetypesAdded = notetypeMapping.size;
      this.reportProgress('notetypes', notetypeMapping.size, this.apkgParser.models.length, 'Note types created');

      // Step 4: Upload media files (non-blocking - failures won't stop import)
      const totalMedia = Object.keys(this.apkgParser.mediaMapping).length;
      this.reportProgress('media', 0, totalMedia, 'Uploading media files...');
      const { mediaMapping, failedCount } = await this.uploadMediaFiles();
      result.mediaImported = mediaMapping.size;
      this.reportProgress('media', mediaMapping.size, totalMedia, `${mediaMapping.size} media files uploaded`);

      if (failedCount > 0) {
        result.errors.push(`${failedCount} media files failed to upload`);
      }

      // Step 5: Process notes and cards
      const notes = this.apkgParser.notes;

      if (notes.length === 0) {
        result.errors.push('No notes found in APKG file');
        return result;
      }

      // Step 6: Batch create notes (10 at a time to avoid request size limits)
      // CET-4 notes have large HTML content, need smaller batches
      const BATCH_SIZE = 10;
      const totalNotes = notes.length;
      let processedNotes = 0;

      this.reportProgress('notes', 0, totalNotes, 'Creating notes...');

      for (let i = 0; i < totalNotes; i += BATCH_SIZE) {
        const batchNotes = notes.slice(i, i + BATCH_SIZE);

        const notesData: CreateEchoeNotesBatchDto = {
          notes: batchNotes.map(note => {
            const fieldMap = this.apkgParser.getFieldMap(note);
            const tags = this.apkgParser.splitTags(note);

            // Replace media references in fields
            const processedFields: Record<string, string> = {};
            for (const [fieldName, fieldValue] of Object.entries(fieldMap)) {
              processedFields[fieldName] = this.replaceMediaReferences(
                fieldValue,
                mediaMapping
              );
            }

            // Get mapped notetype ID
            const notetypeId = notetypeMapping.get(note.mid.toString());
            if (!notetypeId) {
              throw new Error(`Notetype ${note.mid} not found`);
            }

            return {
              deckId: deckId!,
              notetypeId: notetypeId,
              fields: processedFields,
              tags: tags,
            };
          }),
        };

        const createNotesResponse = await echoeApi.createNotesBatch(notesData);
        processedNotes += createNotesResponse.data.length;

        // Update progress
        result.notesAdded = processedNotes;
        result.cardsAdded = processedNotes; // Approximate

        // Report progress
        this.reportProgress('notes', processedNotes, totalNotes, `Creating notes ${processedNotes}/${totalNotes}`);
      }

    } catch (error) {
      console.error('APKG import error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMessage);
      result.errorDetails?.push({
        category: 'general',
        message: errorMessage,
      });

      // Add detailed error info for debugging
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }

    return result;
  }

  /**
   * Create deck hierarchy (e.g., "Parent::Child" creates both Parent and Child)
   * Returns the ID of the final (leaf) deck
   */
  private async createDeckHierarchy(deckName: string): Promise<string> {
    // Split by :: to get hierarchy
    const parts = deckName.split('::');

    // For hierarchical names, flatten to single deck name
    // Convert "英语单词::大学四级英语单词" to "英语单词 - 大学四级英语单词"
    const flatName = parts.length > 1 ? parts.join(' - ') : deckName;

    // Check if deck already exists
    const decksResponse = await echoeApi.getDecks();
    const existingDeck = decksResponse.data.find(d => d.name === flatName);

    if (existingDeck) {
      return existingDeck.id;
    }

    // Create new deck
    const response = await echoeApi.createDeck({ name: flatName });

    if (!response.data || !response.data.id) {
      throw new Error(`Failed to create deck: ${flatName}`);
    }

    return response.data.id;
  }

  /**
   * Create all notetypes from APKG
   * Returns a map of Anki notetype ID -> Echoe notetype ID
   */
  private async createNotetypes(): Promise<Map<string, string>> {
    const mapping = new Map<string, string>();
    const models = this.apkgParser.models;

    // Get existing notetypes
    const notetypesResponse = await echoeApi.getNoteTypes();
    const existingNotetypes = notetypesResponse.data;

    for (const model of models) {
      try {
        // Check if notetype with same name already exists
        const existingNotetype = existingNotetypes.find(nt => nt.name === model.name);

        if (existingNotetype) {
          mapping.set(model.id.toString(), existingNotetype.id);
          continue;
        }

        // Create notetype in Echoe with simplified structure
        const createResponse = await echoeApi.createNoteType({
          name: model.name,
          css: model.css || '',
          flds: model.flds.map((f: { name: string; ord: number; sticky?: boolean; rtl?: boolean; font?: string; size?: number; description?: string; plainText?: boolean }) => ({
            name: f.name,
            ord: f.ord,
            sticky: f.sticky || false,
            rtl: f.rtl || false,
            font: f.font || 'Arial',
            size: f.size || 20,
            description: f.description || '',
            mathjax: false,
            hidden: false,
          })),
          tmpls: model.tmpls.map((t: { name: string; ord: number; qfmt: string; afmt: string; bqfmt?: string; bafmt?: string; did?: string }, index: number) => ({
            id: `${model.id}-${index}`,
            name: t.name,
            ord: t.ord,
            qfmt: t.qfmt,
            afmt: t.afmt || '',
            bqfmt: t.bqfmt || '',
            bafmt: t.bafmt || '',
            did: t.did || '',
          })),
        });

        mapping.set(model.id.toString(), createResponse.data.id);
      } catch (error) {
        console.error(`Failed to create notetype: ${model.name}`, error);
        throw error;
      }
    }

    return mapping;
  }

  /**
   * Upload all media files from APKG to server storage
   * Returns a map of original filename -> stored filename and count of failed uploads
   */
  private async uploadMediaFiles(): Promise<{ mediaMapping: Map<string, string>; failedCount: number }> {
    const mapping = new Map<string, string>();
    let failedCount = 0;

    // Get all media files from parser
    const mediaMapping = this.apkgParser.mediaMapping;
    const totalMedia = Object.keys(mediaMapping).length;
    let uploadedCount = 0;

    for (const originalName of Object.values(mediaMapping)) {
      const blob = this.apkgParser.getMediaFileByOriginalName(originalName);

      if (blob) {
        try {
          // Determine MIME type based on file extension
          let mimeType = blob.type || 'application/octet-stream';
          if (!mimeType || mimeType === 'application/octet-stream') {
            const ext = originalName.toLowerCase().split('.').pop();
            if (ext === 'mp3') mimeType = 'audio/mpeg';
            else if (ext === 'wav') mimeType = 'audio/wav';
            else if (ext === 'ogg') mimeType = 'audio/ogg';
            else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
            else if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'gif') mimeType = 'image/gif';
            else if (ext === 'webp') mimeType = 'image/webp';
          }

          // Upload to server
          const file = new File([blob], originalName, { type: mimeType });
          const uploadResponse = await echoeApi.uploadMedia(file);

          if (!uploadResponse.data || !uploadResponse.data.filename) {
            throw new Error('Upload response missing filename');
          }

          // Store filename instead of URL (URL is temporary and will expire)
          mapping.set(originalName, uploadResponse.data.filename);
          uploadedCount++;

          // Report progress every 10 files
          if (uploadedCount % 10 === 0) {
            this.reportProgress('media', uploadedCount, totalMedia, `Uploading media ${uploadedCount}/${totalMedia}`);
          }
        } catch (error) {
          console.error(`Failed to upload media: ${originalName}`, error);
          failedCount++;
          uploadedCount++;
          // Continue with other files instead of failing completely
        }
      }
    }

    return { mediaMapping: mapping, failedCount };
  }

  /**
   * Replace [sound:...] and <img src="..."> references with stored filenames
   * The frontend will dynamically generate access URLs when rendering
   */
  private replaceMediaReferences(
    html: string,
    mediaMapping: Map<string, string>
  ): string {
    let result = html;

    // Replace [sound:filename] with stored filename reference
    const soundRefs = this.apkgParser.extractMediaReferences(html);
    for (const originalFilename of soundRefs) {
      const storedFilename = mediaMapping.get(originalFilename);
      if (storedFilename) {
        // Keep the [sound:...] format but use stored filename
        result = result.replace(
          `[sound:${originalFilename}]`,
          `[sound:${storedFilename}]`
        );
      }
    }

    // Replace <img src="filename"> with stored filename
    result = result.replace(
      /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi,
      (match, src) => {
        const storedFilename = mediaMapping.get(src);
        return storedFilename ? match.replace(src, storedFilename) : match;
      }
    );

    return result;
  }
}
