import { view, useService } from '@rabjs/react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, RotateCcw, Save } from 'lucide-react';

import { getDeck, getDeckConfig, updateDeckConfig } from '../../api/echoe';
import { ToastService } from '../../services/toast.service';
import type { EchoeFsrsConfigDto } from '@echoe/dto';

type FsrsConfigFormState = {
  requestRetention: string;
  maxInterval: string;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: string;
  relearningSteps: string;
};

const DEFAULT_FSRS_CONFIG: EchoeFsrsConfigDto = {
  requestRetention: 0.9,
  maxInterval: 36500,
  enableFuzz: true,
  enableShortTerm: false,
  learningSteps: [1, 10],
  relearningSteps: [10],
};

const FSRS_FIELD_HINTS: Array<{ key: keyof EchoeFsrsConfigDto; title: string; description: string }> = [
  {
    key: 'requestRetention',
    title: 'requestRetention',
    description: '目标记忆保持率，越高越保守。推荐范围 0.80-0.95。',
  },
  {
    key: 'maxInterval',
    title: 'maxInterval',
    description: '复习间隔上限（天）。避免间隔无限增长。',
  },
  {
    key: 'enableFuzz',
    title: 'enableFuzz',
    description: '启用后会给间隔加入微扰，避免大量卡片扎堆同一天。',
  },
  {
    key: 'enableShortTerm',
    title: 'enableShortTerm',
    description: '启用短期调度分支。建议仅在需要更激进短期记忆策略时开启。',
  },
  {
    key: 'learningSteps',
    title: 'learningSteps',
    description: '新卡学习步长（分钟），例如 1,10。',
  },
  {
    key: 'relearningSteps',
    title: 'relearningSteps',
    description: '遗忘后重学步长（分钟），例如 10。',
  },
];

const toFormState = (config: EchoeFsrsConfigDto): FsrsConfigFormState => ({
  requestRetention: config.requestRetention.toString(),
  maxInterval: config.maxInterval.toString(),
  enableFuzz: config.enableFuzz,
  enableShortTerm: config.enableShortTerm,
  learningSteps: config.learningSteps.join(', '),
  relearningSteps: config.relearningSteps.join(', '),
});

const parseStepToken = (rawToken: string): number | null => {
  const token = rawToken.trim().toLowerCase();
  if (!token) {
    return null;
  }

  const match = token.match(/^(\d+(?:\.\d+)?)(m|h)?$/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return match[2] === 'h' ? value * 60 : value;
};

const parseStepList = (input: string): number[] | null => {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const steps: number[] = [];
  for (const part of parts) {
    const parsed = parseStepToken(part);
    if (parsed === null) {
      return null;
    }
    steps.push(parsed);
  }

  return steps;
};

export default function DeckConfigPage() {
  return <DeckConfigPageContent />;
}

const DeckConfigPageContent = view(() => {
  const navigate = useNavigate();
  const params = useParams();
  const toastService = useService(ToastService);

  const deckId = useMemo(() => {
    const parsed = Number(params.deckId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [params.deckId]);

  const [deckName, setDeckName] = useState('');
  const [configName, setConfigName] = useState('');
  const [formState, setFormState] = useState<FsrsConfigFormState>(toFormState(DEFAULT_FSRS_CONFIG));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (deckId === null) {
        setError('无效的卡组 ID');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [deckRes, configRes] = await Promise.all([getDeck(deckId), getDeckConfig(deckId)]);

        if (!mounted) {
          return;
        }

        if (deckRes.code === 0 && deckRes.data) {
          setDeckName(deckRes.data.name);
        }

        if (configRes.code !== 0 || !configRes.data) {
          setError('加载卡组配置失败');
          return;
        }

        const config = configRes.data;
        const fsrsConfig = config.fsrsConfig ?? DEFAULT_FSRS_CONFIG;
        setConfigName(config.name);
        setFormState(toFormState(fsrsConfig));
      } catch {
        if (mounted) {
          setError('加载卡组配置失败');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [deckId]);

  const handleFieldChange = <K extends keyof FsrsConfigFormState>(key: K, value: FsrsConfigFormState[K]) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleRestoreDefaults = () => {
    setFormState(toFormState(DEFAULT_FSRS_CONFIG));
    toastService.info('已恢复默认参数，请点击保存生效');
  };

  const handleSave = async () => {
    if (deckId === null) {
      toastService.error('无效的卡组 ID');
      return;
    }

    const requestRetention = Number(formState.requestRetention);
    const maxInterval = Number(formState.maxInterval);
    const learningSteps = parseStepList(formState.learningSteps);
    const relearningSteps = parseStepList(formState.relearningSteps);

    if (!Number.isFinite(requestRetention) || requestRetention < 0.7 || requestRetention > 0.99) {
      toastService.error('requestRetention 需在 0.7 到 0.99 之间');
      return;
    }

    if (!Number.isInteger(maxInterval) || maxInterval < 1 || maxInterval > 36500) {
      toastService.error('maxInterval 需为 1 到 36500 之间的整数');
      return;
    }

    if (!learningSteps || !relearningSteps) {
      toastService.error('学习步长格式错误，请使用逗号分隔的分钟值（如 1,10）');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateDeckConfig(deckId, {
        fsrsConfig: {
          requestRetention,
          maxInterval,
          enableFuzz: formState.enableFuzz,
          enableShortTerm: formState.enableShortTerm,
          learningSteps,
          relearningSteps,
        },
      });

      if (res.code !== 0 || !res.data) {
        toastService.error('保存失败，请稍后重试');
        return;
      }

      const fsrsConfig = res.data.fsrsConfig ?? DEFAULT_FSRS_CONFIG;
      setConfigName(res.data.name);
      setFormState(toFormState(fsrsConfig));
      toastService.success('FSRS 配置已保存');
    } catch {
      toastService.error('保存失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-dark-900">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/cards')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回卡组
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">FSRS 配置</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {deckName ? `${deckName} · 配置 ${configName || '--'}` : '按卡组调优学习调度参数'}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-8 text-center text-gray-500 dark:text-gray-400">
            加载中...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    requestRetention
                  </label>
                  <input
                    type="number"
                    min="0.7"
                    max="0.99"
                    step="0.01"
                    value={formState.requestRetention}
                    onChange={(e) => handleFieldChange('requestRetention', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    maxInterval (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="36500"
                    step="1"
                    value={formState.maxInterval}
                    onChange={(e) => handleFieldChange('maxInterval', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    learningSteps (minutes)
                  </label>
                  <input
                    type="text"
                    value={formState.learningSteps}
                    onChange={(e) => handleFieldChange('learningSteps', e.target.value)}
                    placeholder="1, 10"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    relearningSteps (minutes)
                  </label>
                  <input
                    type="text"
                    value={formState.relearningSteps}
                    onChange={(e) => handleFieldChange('relearningSteps', e.target.value)}
                    placeholder="10"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formState.enableFuzz}
                    onChange={(e) => handleFieldChange('enableFuzz', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  enableFuzz
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formState.enableShortTerm}
                    onChange={(e) => handleFieldChange('enableShortTerm', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  enableShortTerm
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={handleRestoreDefaults}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-dark-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  恢复默认
                </button>

                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? '保存中...' : '保存配置'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-3">参数说明</h2>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                {FSRS_FIELD_HINTS.map((item) => (
                  <div key={item.key}>
                    <div className="font-medium text-gray-800 dark:text-gray-200">{item.title}</div>
                    <div>{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
