import type { EchoeFsrsConfigDto } from '@echoe/dto';

const DEFAULT_LEARNING_STEP_MINUTES = [1, 10] as const;
const DEFAULT_RELEARNING_STEP_MINUTES = [10] as const;

const toFsrsStepToken = (minutes: number): string => `${minutes}m`;

export const DEFAULT_FSRS_RUNTIME_CONFIG = {
  learningSteps: DEFAULT_LEARNING_STEP_MINUTES.map(toFsrsStepToken),
  relearningSteps: DEFAULT_RELEARNING_STEP_MINUTES.map(toFsrsStepToken),
  maxInterval: 36500,
  requestRetention: 0.9,
  enableFuzz: true,
  enableShortTerm: false,
} as const;

export const DEFAULT_FSRS_DTO_CONFIG: EchoeFsrsConfigDto = {
  requestRetention: DEFAULT_FSRS_RUNTIME_CONFIG.requestRetention,
  maxInterval: DEFAULT_FSRS_RUNTIME_CONFIG.maxInterval,
  enableFuzz: DEFAULT_FSRS_RUNTIME_CONFIG.enableFuzz,
  enableShortTerm: DEFAULT_FSRS_RUNTIME_CONFIG.enableShortTerm,
  learningSteps: [...DEFAULT_LEARNING_STEP_MINUTES],
  relearningSteps: [...DEFAULT_RELEARNING_STEP_MINUTES],
};
