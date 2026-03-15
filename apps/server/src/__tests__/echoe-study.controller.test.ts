import 'reflect-metadata';

jest.mock('../services/echoe-study.service.js', () => ({
  EchoeStudyService: class EchoeStudyService {},
}));

import { ErrorCode } from '../constants/error-codes.js';
import { EchoeStudyController } from '../controllers/v1/echoe-study.controller.js';

const mockUser = { uid: 'user-001', email: 'test@test.com', nickname: 'Test' };

describe('EchoeStudyController submitReview validation', () => {
  let controller: EchoeStudyController;
  let submitReviewMock: jest.Mock;

  const createDto = (overrides: Partial<{ cardId: string; rating: number; timeTaken: number }> = {}) => ({
    cardId: 'ec_test_card_001',
    rating: 3,
    timeTaken: 1500,
    ...overrides,
  });

  beforeEach(() => {
    submitReviewMock = jest.fn().mockResolvedValue({ reviewId: 'erl_test_review_001' });
    controller = new EchoeStudyController({
      submitReview: submitReviewMock,
    } as any);
  });

  it('should allow timeTaken=0 and call study service', async () => {
    const dto = createDto({ timeTaken: 0 });

    const response = await controller.submitReview(dto as any, mockUser);

    expect(response.code).toBe(ErrorCode.SUCCESS);
    expect(response.data).toEqual({ reviewId: 'erl_test_review_001' });
    expect(submitReviewMock).toHaveBeenCalledWith(mockUser.uid, dto);
  });

  it('should reject negative timeTaken', async () => {
    const dto = createDto({ timeTaken: -1 });

    const response = await controller.submitReview(dto as any, mockUser);

    expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
    expect(response.msg).toBe('timeTaken must be a non-negative number');
    expect(submitReviewMock).not.toHaveBeenCalled();
  });

  it('should reject NaN timeTaken', async () => {
    const dto = createDto({ timeTaken: Number.NaN });

    const response = await controller.submitReview(dto as any, mockUser);

    expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
    expect(response.msg).toBe('timeTaken must be a non-negative number');
    expect(submitReviewMock).not.toHaveBeenCalled();
  });
});

describe('EchoeStudyController undo ownership check', () => {
  let controller: EchoeStudyController;
  let undoMock: jest.Mock;

  beforeEach(() => {
    undoMock = jest.fn().mockResolvedValue({ success: true, message: 'Review undone' });
    controller = new EchoeStudyController({
      undo: undoMock,
    } as any);
  });

  it('should return UNAUTHORIZED when no user is authenticated', async () => {
    const response = await controller.undo(undefined, undefined);

    expect(response.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(undoMock).not.toHaveBeenCalled();
  });

  it('should call undo with uid and reviewId when user is authenticated', async () => {
    const response = await controller.undo('erl_test_review_42', mockUser);

    expect(response.code).toBe(ErrorCode.SUCCESS);
    expect(undoMock).toHaveBeenCalledWith(mockUser.uid, 'erl_test_review_42');
  });

  it('should propagate permission denied error from service', async () => {
    undoMock.mockResolvedValue({
      success: false,
      message: 'Permission denied: this review does not belong to you',
    });

    const response = await controller.undo('erl_test_review_99', mockUser);

    expect(response.code).toBe(ErrorCode.PARAMS_ERROR);
    expect(response.msg).toBe('Permission denied: this review does not belong to you');
  });
});
