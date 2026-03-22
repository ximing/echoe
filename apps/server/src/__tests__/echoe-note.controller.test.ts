import 'reflect-metadata';

jest.mock('../services/echoe-note.service.js', () => ({
  EchoeNoteService: class EchoeNoteService {},
}));

import { ErrorCode } from '../constants/error-codes.js';
import { EchoeNoteController } from '../controllers/v1/echoe-note.controller.js';

import type {
  EchoeNoteDto,
  EchoeNoteWithCardsDto,
  EchoeCardWithNoteDto,
  EchoeCardListItemDto,
  EchoeNoteTypeDto,
} from '@echoe/dto';

const mockUser = { uid: 'user-001', email: 'test@test.com', nickname: 'Test' };

describe('EchoeNoteController - Notes', () => {
  describe('GET /notes', () => {
    let controller: EchoeNoteController;
    let getNotesMock: jest.Mock;

    beforeEach(() => {
      getNotesMock = jest.fn().mockResolvedValue({ notes: [], total: 0 });
      controller = new EchoeNoteController({
        getNotes: getNotesMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const response = await controller.getNotes(undefined, undefined, undefined, undefined, undefined, undefined, undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(getNotesMock).not.toHaveBeenCalled();
    });

    it('should return empty array when no notes exist', async () => {
      const response = await controller.getNotes(undefined, undefined, undefined, undefined, undefined, undefined, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual({ notes: [], total: 0 });
      expect(getNotesMock).toHaveBeenCalledWith(mockUser.uid, {
        deckId: undefined,
        tags: undefined,
        q: undefined,
        status: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('should call service with correct params when filters are provided', async () => {
      const mockNotes: EchoeNoteDto[] = [
        { id: 'en_001', notetypeId: 'ent_001', deckId: 'ed_001', fields: {}, tags: [] } as unknown as EchoeNoteDto,
      ];
      getNotesMock.mockResolvedValue({ notes: mockNotes, total: 1 });

      const response = await controller.getNotes('ed_001', 'tag1,tag2', 'search query', 'new', 2, 50, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual({ notes: mockNotes, total: 1 });
      expect(getNotesMock).toHaveBeenCalledWith(mockUser.uid, {
        deckId: 'ed_001',
        tags: 'tag1,tag2',
        q: 'search query',
        status: 'new',
        page: 2,
        limit: 50,
      });
    });

    it('should handle status filters correctly', async () => {
      const statuses: Array<'new' | 'learn' | 'review' | 'suspended' | 'buried'> = ['new', 'learn', 'review', 'suspended', 'buried'];

      for (const status of statuses) {
        getNotesMock.mockClear();
        await controller.getNotes(undefined, undefined, undefined, status, undefined, undefined, mockUser);

        expect(getNotesMock).toHaveBeenCalledWith(mockUser.uid, expect.objectContaining({ status }));
      }
    });

    it('should use default page and limit when not provided', async () => {
      await controller.getNotes(undefined, undefined, undefined, undefined, undefined, undefined, mockUser);

      expect(getNotesMock).toHaveBeenCalledWith(mockUser.uid, expect.objectContaining({
        page: 1,
        limit: 20,
      }));
    });
  });

  describe('GET /notes/:id', () => {
    let controller: EchoeNoteController;
    let getNoteByIdMock: jest.Mock;

    beforeEach(() => {
      getNoteByIdMock = jest.fn().mockResolvedValue(null);
      controller = new EchoeNoteController({
        getNoteById: getNoteByIdMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const response = await controller.getNoteById('en_001', undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(getNoteByIdMock).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND when note does not exist', async () => {
      const response = await controller.getNoteById('en_nonexistent', mockUser);

      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(getNoteByIdMock).toHaveBeenCalledWith(mockUser.uid, 'en_nonexistent');
    });

    it('should return note when found', async () => {
      const mockNote: EchoeNoteWithCardsDto = {
        id: 'en_001',
        notetypeId: 'ent_001',
        deckId: 'ed_001',
        fields: { Front: 'Question', Back: 'Answer' },
        tags: ['tag1'],
        cards: [],
      } as unknown as EchoeNoteWithCardsDto;
      getNoteByIdMock.mockResolvedValue(mockNote);

      const response = await controller.getNoteById('en_001', mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual(mockNote);
    });
  });

  describe('POST /notes', () => {
    let controller: EchoeNoteController;
    let createNoteMock: jest.Mock;

    beforeEach(() => {
      createNoteMock = jest.fn().mockResolvedValue({
        id: 'en_001',
        notetypeId: 'ent_001',
        deckId: 'ed_001',
        fields: {},
        tags: [],
        cards: [],
      });
      controller = new EchoeNoteController({
        createNote: createNoteMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const dto = { notetypeId: 'ent_001', deckId: 'ed_001', fields: {} } as any;
      const response = await controller.createNote(dto, undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when notetypeId is missing', async () => {
      const dto = { deckId: 'ed_001', fields: {} } as any;
      const response = await controller.createNote(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when deckId is missing', async () => {
      const dto = { notetypeId: 'ent_001', fields: {} } as any;
      const response = await controller.createNote(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when fields is missing', async () => {
      const dto = { notetypeId: 'ent_001', deckId: 'ed_001' } as any;
      const response = await controller.createNote(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    it('should create note when all required fields are provided', async () => {
      const dto = { notetypeId: 'ent_001', deckId: 'ed_001', fields: { Front: 'Q', Back: 'A' } } as any;
      const response = await controller.createNote(dto, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(createNoteMock).toHaveBeenCalledWith(mockUser.uid, dto);
    });

    it('should return PARAMS_ERROR when deck or notetype not found', async () => {
      const dto = { notetypeId: 'ent_001', deckId: 'ed_001', fields: {} } as any;
      createNoteMock.mockRejectedValue(new Error('Deck not found'));

      const response = await controller.createNote(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(response.msg).toBe('Deck not found');
    });
  });

  describe('POST /notes/batch', () => {
    let controller: EchoeNoteController;
    let createNotesBatchMock: jest.Mock;

    beforeEach(() => {
      createNotesBatchMock = jest.fn().mockResolvedValue([]);
      controller = new EchoeNoteController({
        createNotesBatch: createNotesBatchMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const dto = { notes: [{ notetypeId: 'ent_001', deckId: 'ed_001', fields: {} }] } as any;
      const response = await controller.createNotesBatch(dto, undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(createNotesBatchMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when notes array is empty', async () => {
      const dto = { notes: [] } as any;
      const response = await controller.createNotesBatch(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(response.msg).toBe('No notes provided');
      expect(createNotesBatchMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when notes field is missing', async () => {
      const dto = {} as any;
      const response = await controller.createNotesBatch(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(response.msg).toBe('No notes provided');
      expect(createNotesBatchMock).not.toHaveBeenCalled();
    });

    it('should create multiple notes when valid data is provided', async () => {
      const mockNotes = [
        { id: 'en_001', notetypeId: 'ent_001', deckId: 'ed_001', fields: {}, tags: [], cards: [] },
        { id: 'en_002', notetypeId: 'ent_001', deckId: 'ed_001', fields: {}, tags: [], cards: [] },
      ] as unknown as EchoeNoteWithCardsDto[];
      createNotesBatchMock.mockResolvedValue(mockNotes);

      const dto = {
        notes: [
          { notetypeId: 'ent_001', deckId: 'ed_001', fields: { Front: 'Q1' } },
          { notetypeId: 'ent_001', deckId: 'ed_001', fields: { Front: 'Q2' } },
        ],
      } as any;

      const response = await controller.createNotesBatch(dto, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual(mockNotes);
      expect(createNotesBatchMock).toHaveBeenCalledWith(mockUser.uid, dto);
    });
  });

  describe('PUT /notes/:id', () => {
    let controller: EchoeNoteController;
    let updateNoteMock: jest.Mock;

    beforeEach(() => {
      updateNoteMock = jest.fn().mockResolvedValue(null);
      controller = new EchoeNoteController({
        updateNote: updateNoteMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const dto = { fields: { Front: 'Updated' } } as any;
      const response = await controller.updateNote('en_001', dto, undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(updateNoteMock).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND when note does not exist', async () => {
      const dto = { fields: { Front: 'Updated' } } as any;
      const response = await controller.updateNote('en_nonexistent', dto, mockUser);

      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(updateNoteMock).toHaveBeenCalledWith(mockUser.uid, 'en_nonexistent', dto);
    });

    it('should update note when found', async () => {
      const mockNote: EchoeNoteDto = {
        id: 'en_001',
        notetypeId: 'ent_001',
        deckId: 'ed_001',
        fields: { Front: 'Updated' },
        tags: [],
      } as unknown as EchoeNoteDto;
      updateNoteMock.mockResolvedValue(mockNote);

      const dto = { fields: { Front: 'Updated' } } as any;
      const response = await controller.updateNote('en_001', dto, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual(mockNote);
    });
  });

  describe('DELETE /notes/:id', () => {
    let controller: EchoeNoteController;
    let deleteNoteMock: jest.Mock;

    beforeEach(() => {
      deleteNoteMock = jest.fn().mockResolvedValue(false);
      controller = new EchoeNoteController({
        deleteNote: deleteNoteMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const response = await controller.deleteNote('en_001', undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(deleteNoteMock).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND when note does not exist', async () => {
      const response = await controller.deleteNote('en_nonexistent', mockUser);

      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(deleteNoteMock).toHaveBeenCalledWith(mockUser.uid, 'en_nonexistent');
    });

    it('should return success when note is deleted', async () => {
      deleteNoteMock.mockResolvedValue(true);

      const response = await controller.deleteNote('en_001', mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual({ success: true });
    });
  });
});

describe('EchoeNoteController - Cards', () => {
  describe('GET /cards/:id', () => {
    let controller: EchoeNoteController;
    let getCardByIdMock: jest.Mock;

    beforeEach(() => {
      getCardByIdMock = jest.fn().mockResolvedValue(null);
      controller = new EchoeNoteController({
        getCardById: getCardByIdMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const response = await controller.getCardById('ec_001', undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(getCardByIdMock).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND when card does not exist', async () => {
      const response = await controller.getCardById('ec_nonexistent', mockUser);

      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(getCardByIdMock).toHaveBeenCalledWith(mockUser.uid, 'ec_nonexistent');
    });

    it('should return card with note data when found', async () => {
      const mockCard: EchoeCardWithNoteDto = {
        id: 'ec_001',
        noteId: 'en_001',
        deckId: 'ed_001',
        ord: 0,
        type: 0,
        queue: 0,
        note: { id: 'en_001', fields: {}, tags: [] } as any,
      } as EchoeCardWithNoteDto;
      getCardByIdMock.mockResolvedValue(mockCard);

      const response = await controller.getCardById('ec_001', mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual(mockCard);
    });
  });

  describe('GET /cards', () => {
    let controller: EchoeNoteController;
    let getCardsMock: jest.Mock;

    beforeEach(() => {
      getCardsMock = jest.fn().mockResolvedValue({ cards: [], total: 0 });
      controller = new EchoeNoteController({
        getCards: getCardsMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const response = await controller.getCards(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(getCardsMock).not.toHaveBeenCalled();
    });

    it('should return empty array when no cards exist', async () => {
      const response = await controller.getCards(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual({ cards: [], total: 0 });
      expect(getCardsMock).toHaveBeenCalledWith(mockUser.uid, {
        deckId: undefined,
        q: undefined,
        status: undefined,
        tag: undefined,
        sort: undefined,
        order: undefined,
        page: 1,
        limit: 50,
      });
    });

    it('should call service with correct params when filters are provided', async () => {
      const mockCards: EchoeCardListItemDto[] = [
        { id: 'ec_001', noteId: 'en_001', deckId: 'ed_001', ord: 0, type: 0, queue: 0 } as EchoeCardListItemDto,
      ];
      getCardsMock.mockResolvedValue({ cards: mockCards, total: 1 });

      const response = await controller.getCards('ed_001', 'search', 'new', 'tag1', 'added', 'desc', 2, 100, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual({ cards: mockCards, total: 1 });
      expect(getCardsMock).toHaveBeenCalledWith(mockUser.uid, {
        deckId: 'ed_001',
        q: 'search',
        status: 'new',
        tag: 'tag1',
        sort: 'added',
        order: 'desc',
        page: 2,
        limit: 100,
      });
    });

    it('should handle all status filters including leech', async () => {
      const statuses: Array<'new' | 'learn' | 'review' | 'suspended' | 'buried' | 'leech'> = ['new', 'learn', 'review', 'suspended', 'buried', 'leech'];

      for (const status of statuses) {
        getCardsMock.mockClear();
        await controller.getCards(undefined, undefined, status, undefined, undefined, undefined, undefined, undefined, mockUser);

        expect(getCardsMock).toHaveBeenCalledWith(mockUser.uid, expect.objectContaining({ status }));
      }
    });

    it('should handle sort parameters correctly', async () => {
      const sortOptions: Array<'added' | 'due' | 'mod'> = ['added', 'due', 'mod'];
      const orderOptions: Array<'asc' | 'desc'> = ['asc', 'desc'];

      for (const sort of sortOptions) {
        for (const order of orderOptions) {
          getCardsMock.mockClear();
          await controller.getCards(undefined, undefined, undefined, undefined, sort, order, undefined, undefined, mockUser);

          expect(getCardsMock).toHaveBeenCalledWith(mockUser.uid, expect.objectContaining({ sort, order }));
        }
      }
    });

    it('should use default page and limit when not provided', async () => {
      await controller.getCards(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, mockUser);

      expect(getCardsMock).toHaveBeenCalledWith(mockUser.uid, expect.objectContaining({
        page: 1,
        limit: 50,
      }));
    });
  });

  describe('POST /cards/bulk', () => {
    let controller: EchoeNoteController;
    let bulkCardOperationMock: jest.Mock;

    beforeEach(() => {
      bulkCardOperationMock = jest.fn().mockResolvedValue({ success: true, affected: 0 });
      controller = new EchoeNoteController({
        bulkCardOperation: bulkCardOperationMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const dto = { cardIds: ['ec_001'], action: 'suspend' } as any;
      const response = await controller.bulkCardOperation(dto, undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(bulkCardOperationMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when cardIds is empty', async () => {
      const dto = { cardIds: [], action: 'suspend' } as any;
      const response = await controller.bulkCardOperation(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(bulkCardOperationMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when cardIds is missing', async () => {
      const dto = { action: 'suspend' } as any;
      const response = await controller.bulkCardOperation(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(bulkCardOperationMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when action is missing', async () => {
      const dto = { cardIds: ['ec_001'] } as any;
      const response = await controller.bulkCardOperation(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(bulkCardOperationMock).not.toHaveBeenCalled();
    });

    it('should perform bulk operation successfully', async () => {
      bulkCardOperationMock.mockResolvedValue({ success: true, affected: 5 });

      const dto = { cardIds: ['ec_001', 'ec_002', 'ec_003'], action: 'suspend' } as any;
      const response = await controller.bulkCardOperation(dto, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual({ success: true, affected: 5 });
      expect(bulkCardOperationMock).toHaveBeenCalledWith(mockUser.uid, dto);
    });

    it('should handle all bulk actions', async () => {
      const actions = ['suspend', 'unsuspend', 'bury', 'unbury', 'forget', 'move', 'addTag', 'removeTag'];

      for (const action of actions) {
        bulkCardOperationMock.mockClear();
        const dto = { cardIds: ['ec_001'], action } as any;
        await controller.bulkCardOperation(dto, mockUser);

        expect(bulkCardOperationMock).toHaveBeenCalledWith(mockUser.uid, dto);
      }
    });

    it('should return FORBIDDEN when moving cards to another users deck', async () => {
      const dto = { cardIds: ['ec_001'], action: 'move', deckId: 'ed_other_user' } as any;
      bulkCardOperationMock.mockRejectedValue(new Error('FORBIDDEN: Cannot move cards to another user\'s deck'));

      const response = await controller.bulkCardOperation(dto, mockUser);

      expect(response.code).toBe(ErrorCode.FORBIDDEN);
      expect(response.msg).toBe('Cannot move cards to another user\'s deck');
    });

    it('should return PARAMS_ERROR when service throws non-FORBIDDEN error', async () => {
      const dto = { cardIds: ['ec_001'], action: 'move' } as any;
      bulkCardOperationMock.mockRejectedValue(new Error('Deck not found'));

      const response = await controller.bulkCardOperation(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(response.msg).toBe('Deck not found');
    });
  });
});

describe('EchoeNoteController - Note Types', () => {
  describe('GET /notetypes', () => {
    let controller: EchoeNoteController;
    let getAllNoteTypesMock: jest.Mock;

    beforeEach(() => {
      getAllNoteTypesMock = jest.fn().mockResolvedValue([]);
      controller = new EchoeNoteController({
        getAllNoteTypes: getAllNoteTypesMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const response = await controller.getAllNoteTypes(undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(getAllNoteTypesMock).not.toHaveBeenCalled();
    });

    it('should return empty array when no note types exist', async () => {
      const response = await controller.getAllNoteTypes(mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual([]);
      expect(getAllNoteTypesMock).toHaveBeenCalledWith(mockUser.uid);
    });

    it('should return all note types', async () => {
      const mockNoteTypes: EchoeNoteTypeDto[] = [
        { id: 'ent_001', name: 'Basic', fields: [], templates: [] } as unknown as EchoeNoteTypeDto,
        { id: 'ent_002', name: 'Cloze', fields: [], templates: [] } as unknown as EchoeNoteTypeDto,
      ];
      getAllNoteTypesMock.mockResolvedValue(mockNoteTypes);

      const response = await controller.getAllNoteTypes(mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual(mockNoteTypes);
    });
  });

  describe('GET /notetypes/:id', () => {
    let controller: EchoeNoteController;
    let getNoteTypeByIdMock: jest.Mock;

    beforeEach(() => {
      getNoteTypeByIdMock = jest.fn().mockResolvedValue(null);
      controller = new EchoeNoteController({
        getNoteTypeById: getNoteTypeByIdMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const response = await controller.getNoteTypeById('ent_001', undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(getNoteTypeByIdMock).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND when note type does not exist', async () => {
      const response = await controller.getNoteTypeById('ent_nonexistent', mockUser);

      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(getNoteTypeByIdMock).toHaveBeenCalledWith(mockUser.uid, 'ent_nonexistent');
    });

    it('should return note type when found', async () => {
      const mockNoteType: EchoeNoteTypeDto = {
        id: 'ent_001',
        name: 'Basic',
        fields: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
        templates: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Back}}', ord: 0 }],
      } as unknown as EchoeNoteTypeDto;
      getNoteTypeByIdMock.mockResolvedValue(mockNoteType);

      const response = await controller.getNoteTypeById('ent_001', mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual(mockNoteType);
    });
  });

  describe('POST /notetypes', () => {
    let controller: EchoeNoteController;
    let createNoteTypeMock: jest.Mock;

    beforeEach(() => {
      createNoteTypeMock = jest.fn().mockResolvedValue({
        id: 'ent_001',
        name: 'Basic',
        fields: [],
        templates: [],
      });
      controller = new EchoeNoteController({
        createNoteType: createNoteTypeMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const dto = { name: 'Basic' } as any;
      const response = await controller.createNoteType(dto, undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(createNoteTypeMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when name is missing', async () => {
      const dto = {} as any;
      const response = await controller.createNoteType(dto, mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(createNoteTypeMock).not.toHaveBeenCalled();
    });

    it('should create note type when name is provided', async () => {
      const mockNoteType: EchoeNoteTypeDto = {
        id: 'ent_001',
        name: 'Custom Type',
        fields: [{ name: 'Question', ord: 0 }],
        templates: [{ name: 'Card', qfmt: '{{Question}}', afmt: '{{Answer}}', ord: 0 }],
      } as unknown as EchoeNoteTypeDto;
      createNoteTypeMock.mockResolvedValue(mockNoteType);

      const dto = {
        name: 'Custom Type',
        fields: [{ name: 'Question', ord: 0 }],
        templates: [{ name: 'Card', qfmt: '{{Question}}', afmt: '{{Answer}}', ord: 0 }],
      } as any;

      const response = await controller.createNoteType(dto, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual(mockNoteType);
      expect(createNoteTypeMock).toHaveBeenCalledWith(mockUser.uid, dto);
    });
  });

  describe('PUT /notetypes/:id', () => {
    let controller: EchoeNoteController;
    let updateNoteTypeMock: jest.Mock;

    beforeEach(() => {
      updateNoteTypeMock = jest.fn().mockResolvedValue(null);
      controller = new EchoeNoteController({
        updateNoteType: updateNoteTypeMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const dto = { name: 'Updated' } as any;
      const response = await controller.updateNoteType('ent_001', dto, undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(updateNoteTypeMock).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND when note type does not exist', async () => {
      const dto = { name: 'Updated' } as any;
      const response = await controller.updateNoteType('ent_nonexistent', dto, mockUser);

      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(updateNoteTypeMock).toHaveBeenCalledWith(mockUser.uid, 'ent_nonexistent', dto);
    });

    it('should update note type when found', async () => {
      const mockNoteType: EchoeNoteTypeDto = {
        id: 'ent_001',
        name: 'Updated Type',
        fields: [],
        templates: [],
      } as unknown as EchoeNoteTypeDto;
      updateNoteTypeMock.mockResolvedValue(mockNoteType);

      const dto = { name: 'Updated Type' } as any;
      const response = await controller.updateNoteType('ent_001', dto, mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual(mockNoteType);
    });
  });

  describe('DELETE /notetypes/:id', () => {
    let controller: EchoeNoteController;
    let deleteNoteTypeMock: jest.Mock;

    beforeEach(() => {
      deleteNoteTypeMock = jest.fn().mockResolvedValue({ success: false, message: 'Note type not found' });
      controller = new EchoeNoteController({
        deleteNoteType: deleteNoteTypeMock,
      } as any);
    });

    it('should return UNAUTHORIZED when no user is authenticated', async () => {
      const response = await controller.deleteNoteType('ent_001', undefined);

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(deleteNoteTypeMock).not.toHaveBeenCalled();
    });

    it('should return PARAMS_ERROR when note type does not exist', async () => {
      deleteNoteTypeMock.mockResolvedValue({ success: false, message: 'Note type not found' });

      const response = await controller.deleteNoteType('ent_nonexistent', mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(response.msg).toBe('Note type not found');
      expect(deleteNoteTypeMock).toHaveBeenCalledWith(mockUser.uid, 'ent_nonexistent');
    });

    it('should return PARAMS_ERROR with message when note type has notes', async () => {
      deleteNoteTypeMock.mockResolvedValue({
        success: false,
        message: 'Cannot delete note type: 5 notes are using this type',
      });

      const response = await controller.deleteNoteType('ent_001', mockUser);

      expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(response.msg).toBe('Cannot delete note type: 5 notes are using this type');
    });

    it('should return success when note type is deleted', async () => {
      deleteNoteTypeMock.mockResolvedValue({ success: true });

      const response = await controller.deleteNoteType('ent_001', mockUser);

      expect(response.code).toBe(ErrorCode.SUCCESS);
      expect(response.data).toEqual({ success: true });
    });
  });
});
