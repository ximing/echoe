import 'reflect-metadata';

import { ErrorCode } from '../constants/error-codes.js';
import { InboxToCardController } from '../controllers/v1/inbox-to-card.controller.js';

// Mock the services
jest.mock('../services/inbox.service.js', () => ({
  InboxService: class MockInboxService {
    findByIdAndUid = jest.fn();
  },
}));

jest.mock('../services/echoe-note.service.js', () => ({
  EchoeNoteService: class MockEchoeNoteService {
    createNote = jest.fn();
    getNoteTypeById = jest.fn();
  },
}));

jest.mock('../services/echoe-deck.service.js', () => ({
  EchoeDeckService: class MockEchoeDeckService {
    getDeckById = jest.fn();
    getAllDecks = jest.fn();
  },
}));

jest.mock('../services/inbox-ai.service.js', () => ({
  InboxAiService: class MockInboxAiService {},
}));

// Import after mocks
import { InboxService } from '../services/inbox.service.js';
import { EchoeNoteService } from '../services/echoe-note.service.js';
import { EchoeDeckService } from '../services/echoe-deck.service.js';
import { InboxAiService } from '../services/inbox-ai.service.js';

describe('InboxToCardController', () => {
  let controller: InboxToCardController;
  let mockInboxService: jest.Mocked<InboxService>;
  let mockEchoeNoteService: jest.Mocked<EchoeNoteService>;
  let mockEchoeDeckService: jest.Mocked<EchoeDeckService>;
  let mockInboxAiService: jest.Mocked<InboxAiService>;

  // Mock user data
  const mockUser = {
    uid: 'test-user-uid',
    email: 'test@example.com',
    nickname: 'Test User',
  };

  // Mock inbox item
  const mockInboxItem = {
    id: 1,
    inboxId: 'i1234567890',
    uid: 'test-user-uid',
    front: 'What is TypeScript?',
    back: 'TypeScript is a typed superset of JavaScript',
    source: 'manual',
    category: 'backend',
    isRead: false,
    deletedAt: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // Mock deck
  const mockDeck = {
    deckId: 'd1234567890',
    id: 'd1234567890',
    uid: 'test-user-uid',
    name: 'Programming',
    conf: 'conf123',
    extendNew: 20,
    extendRev: 200,
    collapsed: false,
    dyn: 0,
    desc: '',
    mid: '',
    mod: 1234567890,
    newCount: 0,
    reviewCount: 0,
    learnCount: 0,
    totalCount: 0,
    matureCount: 0,
    difficultCount: 0,
    averageRetrievability: 0,
    lastStudiedAt: null,
    children: [],
  };

  // Mock notetype
  const mockNotetype = {
    id: 'nt1234567890',
    name: 'Basic',
    mod: 1234567890,
    sortf: 0,
    did: '',
    flds: [
      { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', mathjax: false, hidden: false },
      { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', mathjax: false, hidden: false },
    ],
    tmpls: [
      { id: 't1', name: 'Card 1', ord: 0, qfmt: '', afmt: '', bqfmt: '', bafmt: '', did: '' },
    ],
    css: '',
    type: 0,
    latexPre: '',
    latexPost: '',
    req: '[]',
  };

  // Mock created note with cards
  const mockNoteWithCards = {
    noteId: 'n1234567890',
    id: 'n1234567890',
    uid: 'test-user-uid',
    guid: 'abc123def456',
    mid: 'nt1234567890',
    mod: 1234567890,
    usn: 0,
    tags: [],
    flds: 'What is TypeScript?\x1fTypeScript is a typed superset of JavaScript',
    sfld: 'What is TypeScript?',
    csum: 'checksum123',
    flags: 0,
    data: '{}',
    fields: {
      Front: 'What is TypeScript?',
      Back: 'TypeScript is a typed superset of JavaScript',
    },
    cards: [
      {
        cardId: 'c1234567890',
        id: 'c1234567890',
        noteId: 'n1234567890',
        nid: 'n1234567890',
        deckId: 'd1234567890',
        did: 'd1234567890',
        ord: 0,
        mod: 1234567890,
        type: 0,
        queue: 0,
        due: 0,
        ivl: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
        left: 0,
        usn: 0,
        stability: 0,
        difficulty: 0,
        lastReview: 0,
      },
    ],
  };

  beforeEach(() => {
    // Create mock services
    mockInboxService = {
      findByIdAndUid: jest.fn(),
    } as unknown as jest.Mocked<InboxService>;

    mockEchoeNoteService = {
      createNote: jest.fn(),
      getNoteTypeById: jest.fn(),
    } as unknown as jest.Mocked<EchoeNoteService>;

    mockEchoeDeckService = {
      getDeckById: jest.fn(),
      getAllDecks: jest.fn(),
    } as unknown as jest.Mocked<EchoeDeckService>;

    mockInboxAiService = {} as unknown as jest.Mocked<InboxAiService>;

    const mockMetricsService = {
      trackToCardStart: jest.fn(),
      trackToCardSuccess: jest.fn(),
      trackToCardError: jest.fn(),
    } as any;

    // Create controller with mock services
    controller = new InboxToCardController(
      mockInboxService,
      mockEchoeNoteService,
      mockEchoeDeckService,
      mockInboxAiService,
      mockMetricsService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/inbox/:inboxId/to-card', () => {
    const validDto = {
      inboxId: 'i1234567890',
      deckId: 'd1234567890',
      notetypeId: 'nt1234567890',
    };

    it('should convert inbox item to card successfully', async () => {
      // Setup mocks
      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItem);
      mockEchoeDeckService.getDeckById.mockResolvedValue(mockDeck);
      mockEchoeNoteService.getNoteTypeById.mockResolvedValue(mockNotetype);
      mockEchoeNoteService.createNote.mockResolvedValue(mockNoteWithCards);

      // Call controller
      const result = await controller.convertInboxToCard('i1234567890', validDto, mockUser);

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).toMatchObject({
        noteId: 'n1234567890',
        cardId: 'c1234567890',
        deckId: 'd1234567890',
        notetypeId: 'nt1234567890',
        deckName: 'Programming',
        notetypeName: 'Basic',
        aiRecommended: false,
      });

      // Verify service calls
      expect(mockInboxService.findByIdAndUid).toHaveBeenCalledWith('test-user-uid', 'i1234567890');
      expect(mockEchoeDeckService.getDeckById).toHaveBeenCalledWith('test-user-uid', 'd1234567890');
      expect(mockEchoeNoteService.getNoteTypeById).toHaveBeenCalledWith('test-user-uid', 'nt1234567890');
      expect(mockEchoeNoteService.createNote).toHaveBeenCalledWith('test-user-uid', {
        notetypeId: 'nt1234567890',
        deckId: 'd1234567890',
        fields: {
          Front: 'What is TypeScript?',
          Back: 'TypeScript is a typed superset of JavaScript',
        },
        tags: [],
      });
    });

    it('should use custom field mapping when provided', async () => {
      // Setup mocks
      const customNotetype = {
        ...mockNotetype,
        flds: [
          { name: 'Question', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', mathjax: false, hidden: false },
          { name: 'Answer', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', mathjax: false, hidden: false },
        ],
      };
      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItem);
      mockEchoeDeckService.getDeckById.mockResolvedValue(mockDeck);
      mockEchoeNoteService.getNoteTypeById.mockResolvedValue(customNotetype);
      mockEchoeNoteService.createNote.mockResolvedValue(mockNoteWithCards);

      const dtoWithMapping = {
        ...validDto,
        fieldMapping: {
          front: 'Question',
          back: 'Answer',
        },
      };

      // Call controller
      const result = await controller.convertInboxToCard('i1234567890', dtoWithMapping, mockUser);

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockEchoeNoteService.createNote).toHaveBeenCalledWith('test-user-uid', {
        notetypeId: 'nt1234567890',
        deckId: 'd1234567890',
        fields: {
          Question: 'What is TypeScript?',
          Answer: 'TypeScript is a typed superset of JavaScript',
        },
        tags: [],
      });
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.convertInboxToCard('i1234567890', validDto, undefined);

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(mockInboxService.findByIdAndUid).not.toHaveBeenCalled();
    });

    it('should return not found when inbox item does not exist', async () => {
      mockInboxService.findByIdAndUid.mockResolvedValue(null);

      const result = await controller.convertInboxToCard('i1234567890', validDto, mockUser);

      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(mockEchoeDeckService.getDeckById).not.toHaveBeenCalled();
    });

    it('should return not found when deck does not exist', async () => {
      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItem);
      mockEchoeDeckService.getDeckById.mockResolvedValue(null);

      const result = await controller.convertInboxToCard('i1234567890', validDto, mockUser);

      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(mockEchoeNoteService.getNoteTypeById).not.toHaveBeenCalled();
    });

    it('should return not found when notetype does not exist', async () => {
      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItem);
      mockEchoeDeckService.getDeckById.mockResolvedValue(mockDeck);
      mockEchoeNoteService.getNoteTypeById.mockResolvedValue(null);

      const result = await controller.convertInboxToCard('i1234567890', validDto, mockUser);

      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(mockEchoeNoteService.createNote).not.toHaveBeenCalled();
    });

    it('should return params error when field mapping references non-existent field', async () => {
      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItem);
      mockEchoeDeckService.getDeckById.mockResolvedValue(mockDeck);
      mockEchoeNoteService.getNoteTypeById.mockResolvedValue(mockNotetype);

      const dtoWithInvalidMapping = {
        ...validDto,
        fieldMapping: {
          front: 'NonExistentField',
          back: 'Back',
        },
      };

      const result = await controller.convertInboxToCard('i1234567890', dtoWithInvalidMapping, mockUser);

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(mockEchoeNoteService.createNote).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockInboxService.findByIdAndUid.mockRejectedValue(new Error('Database error'));

      const result = await controller.convertInboxToCard('i1234567890', validDto, mockUser);

      expect(result.code).toBe(ErrorCode.DB_ERROR);
    });

    it('should handle notetype with single field (cloze type)', async () => {
      const clozeNotetype = {
        ...mockNotetype,
        flds: [{ name: 'Text', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', mathjax: false, hidden: false }],
      };
      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItem);
      mockEchoeDeckService.getDeckById.mockResolvedValue(mockDeck);
      mockEchoeNoteService.getNoteTypeById.mockResolvedValue(clozeNotetype);
      mockEchoeNoteService.createNote.mockResolvedValue(mockNoteWithCards);

      const result = await controller.convertInboxToCard('i1234567890', validDto, mockUser);

      // Verify that only front field is used for single-field notetypes
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockEchoeNoteService.createNote).toHaveBeenCalledWith('test-user-uid', {
        notetypeId: 'nt1234567890',
        deckId: 'd1234567890',
        fields: {
          Text: 'What is TypeScript?',
        },
        tags: [],
      });
    });

    // Note: AI recommendation tests are simplified because they require complex database mocking
    // The AI recommendation logic is tested indirectly through manual testing and integration tests
    it('should include aiRecommended flag in response', async () => {
      // When explicit deckId/notetypeId are provided, aiRecommended should be false
      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItem);
      mockEchoeDeckService.getDeckById.mockResolvedValue(mockDeck);
      mockEchoeNoteService.getNoteTypeById.mockResolvedValue(mockNotetype);
      mockEchoeNoteService.createNote.mockResolvedValue(mockNoteWithCards);

      const result = await controller.convertInboxToCard('i1234567890', validDto, mockUser);

      // Verify aiRecommended flag is present in response
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).toHaveProperty('aiRecommended');
      expect(result.data?.aiRecommended).toBe(false); // Explicit deck/notetype provided
    });

    it('should preserve user-provided deckId when only notetypeId is missing', async () => {
      // Mock getAllDecks for AI recommendation
      mockEchoeDeckService.getAllDecks = jest.fn().mockResolvedValue([
        { deckId: 'ai-deck-id', name: 'AI Recommended Deck' },
      ]);
      
      // Mock getAllNotetypes for AI recommendation
      const mockGetAllNotetypes = jest.fn().mockResolvedValue([
        { noteTypeId: 'ai-notetype-id', name: 'AI Recommended Notetype', type: 0 },
      ]);
      (controller as any).getAllNotetypes = mockGetAllNotetypes;

      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItem);
      // User's deck should be validated, not AI's
      mockEchoeDeckService.getDeckById.mockResolvedValue(mockDeck);
      mockEchoeNoteService.getNoteTypeById.mockResolvedValue(mockNotetype);
      mockEchoeNoteService.createNote.mockResolvedValue(mockNoteWithCards);

      // User provides deckId but not notetypeId
      const dtoWithOnlyDeckId = {
        inboxId: 'i1234567890',
        deckId: 'd1234567890', // User's explicit deckId
        // notetypeId is missing - should use AI recommendation
      };

      const result = await controller.convertInboxToCard('i1234567890', dtoWithOnlyDeckId, mockUser);

      // Verify user's deckId was preserved (not AI's)
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockEchoeDeckService.getDeckById).toHaveBeenCalledWith('test-user-uid', 'd1234567890');
      expect(mockEchoeNoteService.createNote).toHaveBeenCalledWith('test-user-uid', expect.objectContaining({
        deckId: 'd1234567890', // User's deckId preserved
      }));
    });

    it('should preserve user-provided notetypeId when only deckId is missing', async () => {
      // Mock getAllDecks for AI recommendation
      mockEchoeDeckService.getAllDecks = jest.fn().mockResolvedValue([
        { deckId: 'ai-deck-id', name: 'AI Recommended Deck' },
      ]);
      
      // Mock getAllNotetypes for AI recommendation
      const mockGetAllNotetypes = jest.fn().mockResolvedValue([
        { noteTypeId: 'ai-notetype-id', name: 'AI Recommended Notetype', type: 0 },
      ]);
      (controller as any).getAllNotetypes = mockGetAllNotetypes;

      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItem);
      mockEchoeDeckService.getDeckById.mockResolvedValue(mockDeck);
      // User's notetype should be validated
      mockEchoeNoteService.getNoteTypeById.mockResolvedValue(mockNotetype);
      mockEchoeNoteService.createNote.mockResolvedValue(mockNoteWithCards);

      // User provides notetypeId but not deckId
      const dtoWithOnlyNotetypeId = {
        inboxId: 'i1234567890',
        // deckId is missing - should use AI recommendation
        notetypeId: 'nt1234567890', // User's explicit notetypeId
      };

      const result = await controller.convertInboxToCard('i1234567890', dtoWithOnlyNotetypeId, mockUser);

      // Verify user's notetypeId was preserved
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockEchoeNoteService.getNoteTypeById).toHaveBeenCalledWith('test-user-uid', 'nt1234567890');
      expect(mockEchoeNoteService.createNote).toHaveBeenCalledWith('test-user-uid', expect.objectContaining({
        notetypeId: 'nt1234567890', // User's notetypeId preserved
      }));
    });
  });
});
