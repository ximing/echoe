import { bindServices, view, useService } from '@rabjs/react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { EchoeStudyService } from '../../services/echoe-study.service';
import { ToastService } from '../../services/toast.service';
import { diffStrings } from '../../utils/echoe/diff';
import {
  ChevronLeft,
  MoreVertical,
  RotateCcw,
  CheckCircle,
  Clock,
  Brain,
} from 'lucide-react';
import type { StudyQueueItemDto } from '@echoe/dto';

/**
 * Process media tags:
 * - [sound:filename.mp3] -> hidden <audio> + custom play button
 * - <img src="filename.jpg"> -> <img src="/api/v1/media/filename.jpg">
 */
function processAudio(template: string): string {
  let audioIndex = 0;
  let result = template;

  // Process audio tags [sound:filename.mp3]
  result = result.replace(/\[sound:([^\]]+)\]/g, (_, filename) => {
    // Reject invalid filenames with path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return ''; // Reject invalid filenames
    }
    // URL encode the filename but keep slashes and colons
    const encodedFilename = encodeURIComponent(filename);
    const audioId = `audio-${Date.now()}-${audioIndex++}`;

    return `
      <span class="inline-flex items-center gap-2">
        <audio id="${audioId}" class="cards-audio hidden" src="/api/v1/media/${encodedFilename}"></audio>
        <button
          class="audio-play-button inline-flex items-center gap-1 px-2 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
          data-audio-id="${audioId}"
          title="Play audio"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/>
          </svg>
          <span class="audio-filename text-xs">${escapeHtml(filename)}</span>
        </button>
      </span>
    `;
  });

  // Process image tags <img src="filename.jpg">
  // Ensure image src points to the media API endpoint
  result = result.replace(/<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi, (match, before, src, after) => {
    // Skip if already an absolute URL or API path
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/api/v1/media/')) {
      return match;
    }

    // Reject invalid filenames with path traversal
    if (src.includes('..')) {
      return match;
    }

    // URL encode the filename
    const encodedSrc = encodeURIComponent(src);

    return `<img${before} src="/api/v1/media/${encodedSrc}"${after}>`;
  });

  return result;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Render diff for type-in-answer
 */
function renderTypeAnswerDiff(typedValue: string, correctValue: string): string {
  if (!typedValue) return '';

  const segments = diffStrings(typedValue, correctValue);

  let diffHtml = '<span class="type-answer-diff">';
  for (const segment of segments) {
    let className = '';
    switch (segment.type) {
      case 'equal':
        className = 'diff-equal';
        break;
      case 'insert':
        className = 'diff-insert';
        break;
      case 'delete':
        className = 'diff-delete';
        break;
      case 'missing':
        className = 'diff-missing';
        break;
    }
    diffHtml += `<span class="${className}">${escapeHtml(segment.value)}</span>`;
  }
  diffHtml += '</span>';

  return diffHtml;
}

/**
 * CardContent component - renders card front/back with type-answer support
 */
function CardContent({
  card,
  isShowingAnswer,
  typedAnswers,
  onTypeAnswer,
  autoplay = 'never',
  ttsSpeed = 1,
}: {
  card: StudyQueueItemDto;
  isShowingAnswer: boolean;
  typedAnswers: Record<string, string>;
  onTypeAnswer: (field: string, value: string) => void;
  autoplay?: string;
  ttsSpeed?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract correct answers from front HTML (from placeholder attributes)
  const correctAnswers = useMemo(() => {
    const fieldAnswers: Record<string, string> = {};
    if (!card.front) return fieldAnswers;

    const inputRegex = /<input[^>]*class="type-answer"[^>]*data-field="([^"]+)"[^>]*placeholder="([^"]*)"[^>]*>/g;

    let match;
    while ((match = inputRegex.exec(card.front)) !== null) {
      const [, fieldName, placeholder] = match;
      // Decode HTML entities in placeholder
      const decoded = placeholder
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
      fieldAnswers[fieldName] = decoded;
    }

    return fieldAnswers;
  }, [card.front]);

  // Handle input changes
  useEffect(() => {
    if (isShowingAnswer || !containerRef.current) return;

    const container = containerRef.current;
    const inputs = container.querySelectorAll<HTMLInputElement>('input.type-answer');

    inputs.forEach((input) => {
      const fieldName = input.getAttribute('data-field');
      if (!fieldName) return;

      // Set initial value
      input.value = typedAnswers[fieldName] || '';

      const handleInput = () => {
        onTypeAnswer(fieldName, input.value);
      };

      input.addEventListener('input', handleInput);
      return () => {
        input.removeEventListener('input', handleInput);
      };
    });
  }, [isShowingAnswer, typedAnswers, onTypeAnswer, card]);

  // Auto-focus first input on front
  useEffect(() => {
    if (!isShowingAnswer && containerRef.current) {
      const input = containerRef.current.querySelector('input.type-answer') as HTMLInputElement | null;
      if (input) {
        setTimeout(() => input.focus(), 100);
      }
    }
  }, [isShowingAnswer, card]);

  // Attach audio play button click handlers
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const playButtons = container.querySelectorAll<HTMLButtonElement>('button.audio-play-button');

    playButtons.forEach((button) => {
      const audioId = button.getAttribute('data-audio-id');
      if (!audioId) return;

      const audio = document.getElementById(audioId) as HTMLAudioElement;
      if (!audio) return;

      const handlePlay = () => {
        audio.currentTime = 0;
        audio.play().catch(() => {
          // Ignore play errors
        });
      };

      button.addEventListener('click', handlePlay);
      (button as HTMLButtonElement & { _audioHandler?: () => void })._audioHandler = handlePlay;
    });

    return () => {
      playButtons.forEach((button) => {
        const handler = (button as HTMLButtonElement & { _audioHandler?: () => void })._audioHandler;
        if (handler) {
          button.removeEventListener('click', handler);
        }
      });
    };
  }, [card, isShowingAnswer]);

  // Auto-play audio based on autoplay setting and side
  useEffect(() => {
    if (!containerRef.current || autoplay === 'never') return;

    const shouldPlayFront = autoplay === 'front' || autoplay === 'both';
    const shouldPlayBack = autoplay === 'back' || autoplay === 'both';

    if ((!isShowingAnswer && !shouldPlayFront) || (isShowingAnswer && !shouldPlayBack)) {
      return;
    }

    const container = containerRef.current;
    const audioElements = container.querySelectorAll<HTMLAudioElement>('audio.cards-audio');

    if (audioElements.length > 0) {
      // Play all audio elements
      const playPromises = Array.from(audioElements).map((audio) => {
        audio.currentTime = 0;
        return audio.play().catch(() => {
          // Ignore play errors (user may have muted)
        });
      });
      Promise.all(playPromises);
    }
  }, [card, isShowingAnswer, autoplay]);

  // Attach TTS button click handlers
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const ttsButtons = container.querySelectorAll<HTMLButtonElement>('button.tts-button');

    const handleTtsClick = (button: HTMLButtonElement) => {
      const text = decodeURIComponent(button.getAttribute('data-text') || '');
      const lang = decodeURIComponent(button.getAttribute('data-lang') || 'en-US');

      if (!text) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = ttsSpeed;

      window.speechSynthesis.speak(utterance);
    };

    ttsButtons.forEach((button) => {
      const handler = () => handleTtsClick(button);
      button.addEventListener('click', handler);

      // Store handler for cleanup
      (button as HTMLButtonElement & { _ttsHandler?: () => void })._ttsHandler = handler;
    });

    return () => {
      ttsButtons.forEach((button) => {
        const handler = (button as HTMLButtonElement & { _ttsHandler?: () => void })._ttsHandler;
        if (handler) {
          button.removeEventListener('click', handler);
        }
      });
    };
  }, [card, ttsSpeed]);

  // Determine content to show
  let content: string;

  if (!isShowingAnswer) {
    // Front side - process audio tags
    content = processAudio(card.front);
  } else {
    // Back side - process type-answer diff
    let backHtml = processAudio(card.back);

    // Replace type-answer inputs with diff display
    backHtml = backHtml.replace(
      /<input[^>]*class="type-answer"[^>]*>/g,
      () => {
        return '<span class="type-answer-replaced"></span>';
      }
    );

    // For each field, show the diff
    for (const [fieldName, typedValue] of Object.entries(typedAnswers)) {
      const correctValue = correctAnswers[fieldName] || '';

      if (typedValue && correctValue) {
        const diffHtml = renderTypeAnswerDiff(typedValue, correctValue);
        // Replace the placeholder in back HTML with diff
        backHtml = backHtml.replace(
          new RegExp(`(<span class="type-answer-replaced"></span>)`),
          `<div class="type-answer-diff-container">${diffHtml}</div>`
        );
      }
    }

    content = backHtml;
  }

  return (
    <div ref={containerRef} className="p-8 min-h-[240px] flex items-center justify-center">
      <div
        className="prose prose-sm dark:prose-invert max-w-none w-full"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}

/**
 * Study Session Page
 * Route: /echoe/study/:deckId?
 */
const StudyPageContent = view(() => {
  const { deckId } = useParams<{ deckId?: string }>();
  const navigate = useNavigate();
  const studyService = useService(EchoeStudyService);
  const toastService = useService(ToastService);

  const [menuOpen, setMenuOpen] = useState(false);
  const [timer, setTimer] = useState('00:00');

  // Load queue on mount
  useEffect(() => {
    studyService.loadQueue(deckId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // Timer interval
  useEffect(() => {
    if (studyService.queue.length === 0 || studyService.isSessionComplete()) return;

    const interval = setInterval(() => {
      setTimer(studyService.getElapsedTime());
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyService.queue.length, studyService.isSessionComplete()]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (studyService.isLoading) return;

      // Space or Enter to show answer
      if ((e.code === 'Space' || e.code === 'Enter') && !studyService.isShowingAnswer) {
        e.preventDefault();
        studyService.showAnswer();
      }

      // 1-4 for ratings
      if (studyService.isShowingAnswer) {
        if (e.code === 'Digit1' || e.code === 'Numpad1') {
          e.preventDefault();
          handleRating(1);
        } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
          e.preventDefault();
          handleRating(2);
        } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
          e.preventDefault();
          handleRating(3);
        } else if (e.code === 'Digit4' || e.code === 'Numpad4') {
          e.preventDefault();
          handleRating(4);
        }
      }

      // Escape to go back
      if (e.code === 'Escape') {
        navigate('/cards');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyService.isShowingAnswer, studyService.isLoading]);

  // Handle rating
  const handleRating = async (rating: 1 | 2 | 3 | 4) => {
    const success = await studyService.submitReview(rating);
    if (!success) {
      toastService.error('Failed to submit review');
    } else if (studyService.lastReviewWasLeech) {
      toastService.warning('Leech! Card suspended.');
      studyService.lastReviewWasLeech = false; // Reset for next review
    }
  };

  // Handle undo
  const handleUndo = async () => {
    const success = await studyService.undo();
    if (success) {
      toastService.success('Undo successful');
    } else {
      toastService.error('Nothing to undo');
    }
    setMenuOpen(false);
  };

  // Handle bury
  const handleBury = async (mode: 'card' | 'note') => {
    const success = await studyService.buryCard(mode);
    if (success) {
      toastService.success('Card buried');
    } else {
      toastService.error('Failed to bury card');
    }
    setMenuOpen(false);
  };

  // Handle forget
  const handleForget = async () => {
    const success = await studyService.forgetCard();
    if (success) {
      toastService.success('Card reset to new');
    } else {
      toastService.error('Failed to reset card');
    }
    setMenuOpen(false);
  };

  // Get current card
  const currentCard = studyService.getCurrentCard();
  const progress = studyService.getProgress();

  // Loading state
  if (studyService.isLoading && studyService.queue.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-dark-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading cards...</p>
        </div>
      </div>
    );
  }

  // Session complete
  if (studyService.isSessionComplete()) {
    return <SessionCompleteView studyService={studyService} navigate={navigate} />;
  }

  // No cards to study
  if (!currentCard) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-dark-900">
        <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          All caught up!
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          No more cards to review right now.
        </p>
        <button
          onClick={() => navigate('/cards')}
          className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          Back to Decks
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-dark-900">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/cards')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {progress.current} / {progress.total}
          </span>
        </div>

        {/* Retrievability Display - use real-time value from /study/options */}
        {studyService.currentRetrievability !== null && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-dark-700 rounded-full">
            <Brain className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {Math.round(studyService.currentRetrievability * 100)}%
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {timer}
          </span>

          <button
            onClick={handleUndo}
            disabled={!studyService.canUndo()}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg shadow-lg py-1 z-20">
                  <button
                    onClick={() => handleBury('card')}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700"
                  >
                    Bury Card
                  </button>
                  <button
                    onClick={() => handleBury('note')}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700"
                  >
                    Bury Note
                  </button>
                  <button
                    onClick={handleForget}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700"
                  >
                    Forget
                  </button>
                  <hr className="my-1 border-gray-200 dark:border-dark-700" />
                  <button
                    onClick={() => navigate('/cards')}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700"
                  >
                    Exit Study
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Card Area */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div className="w-full max-w-2xl">
          <div
            className={`bg-white dark:bg-dark-800 rounded-xl shadow-lg overflow-hidden transition-all duration-300 ${
              studyService.isShowingAnswer ? 'card-flipped' : ''
            }`}
          >
            {/* Card Content */}
            <CardContent
              card={currentCard}
              isShowingAnswer={studyService.isShowingAnswer}
              typedAnswers={studyService.getTypedAnswers()}
              onTypeAnswer={(field, value) => studyService.setTypedAnswer(field, value)}
              autoplay={studyService.autoplay}
              ttsSpeed={studyService.ttsSpeed}
            />
          </div>
        </div>
      </div>

      {/* Typing Practice Area */}
      {/* TODO: 系统优化打印组件体验 */}
      {/* <div className="px-4 py-2 bg-white dark:bg-dark-800 border-t border-gray-200 dark:border-dark-700">
        <div className="max-w-2xl mx-auto">
          <TypingPractice
            words={studyService.typingPractice.words}
            isShowingAnswer={studyService.isShowingAnswer}
          />
        </div>
      </div> */}

      {/* Action Area */}
      <div className="px-4 py-4 bg-white dark:bg-dark-800">
        <div className="max-w-2xl mx-auto">
          {!studyService.isShowingAnswer ? (
            <button
              onClick={() => studyService.showAnswer()}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white text-lg font-medium rounded-xl transition-colors"
            >
              Show Answer
            </button>
          ) : (
            <>
              <div className="h-4 mb-2 text-center text-xs text-gray-500 dark:text-gray-400">
                {studyService.isLoadingStudyOptions
                  ? 'Loading next intervals...'
                  : studyService.studyOptionsError
                    ? 'Failed to load next intervals'
                    : ''}
              </div>
              <div className="grid grid-cols-4 gap-3">
                <button
                  onClick={() => handleRating(1)}
                  className="py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex flex-col items-center"
                >
                  <span className="font-medium">Again</span>
                  <span className="text-xs opacity-80 min-h-4">{studyService.getNextIntervalText(1)}</span>
                </button>
                <button
                  onClick={() => handleRating(2)}
                  className="py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex flex-col items-center"
                >
                  <span className="font-medium">Hard</span>
                  <span className="text-xs opacity-80 min-h-4">{studyService.getNextIntervalText(2)}</span>
                </button>
                <button
                  onClick={() => handleRating(3)}
                  className="py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex flex-col items-center"
                >
                  <span className="font-medium">Good</span>
                  <span className="text-xs opacity-80 min-h-4">{studyService.getNextIntervalText(3)}</span>
                </button>
                <button
                  onClick={() => handleRating(4)}
                  className="py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex flex-col items-center"
                >
                  <span className="font-medium">Easy</span>
                  <span className="text-xs opacity-80 min-h-4">{studyService.getNextIntervalText(4)}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="px-4 py-2 text-center text-xs text-gray-400 dark:text-gray-500">
        Press {studyService.isShowingAnswer ? '1-4' : 'Space'} to answer • Esc to exit
      </div>
    </div>
  );
});

/**
 * Session Complete View
 */
function SessionCompleteView({
  studyService,
  navigate,
}: {
  studyService: EchoeStudyService;
  navigate: (path: string) => void;
}) {
  const summary = studyService.getSessionSummary();

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-dark-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-dark-800 rounded-xl shadow-lg p-8">
        <div className="text-center mb-6">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Session Complete!
          </h2>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-primary-500" />
              <span className="text-gray-700 dark:text-gray-300">Cards Studied</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {summary.studied}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700 rounded-lg">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-primary-500" />
              <span className="text-gray-700 dark:text-gray-300">Time Spent</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {summary.totalTime}
            </span>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
            Rating Breakdown
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="text-lg font-bold text-red-600 dark:text-red-400">
                {summary.again}
              </div>
              <div className="text-xs text-red-600 dark:text-red-400">Again</div>
            </div>
            <div className="text-center p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {summary.hard}
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-400">Hard</div>
            </div>
            <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {summary.good}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400">Good</div>
            </div>
            <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {summary.easy}
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400">Easy</div>
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/cards')}
          className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
        >
          Back to Decks
        </button>
      </div>
    </div>
  );
}

const StudyPage = bindServices(StudyPageContent, [EchoeStudyService]);
export default StudyPage;
