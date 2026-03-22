import { view, useService } from '@rabjs/react';
import { useEffect, useRef, useState } from 'react';
import { EchoeStudyService } from '../../services/echoe-study.service';
import './TypingPractice.css';

interface TypingPracticeProps {
  words: string[];
  isShowingAnswer: boolean;
}

export const TypingPractice = view(({ words, isShowingAnswer }: TypingPracticeProps) => {
  const studyService = useService(EchoeStudyService);
  const containerRef = useRef<HTMLDivElement>(null);

  // 监听完成状态，触发庆祝动画
  useEffect(() => {
    if (studyService.typingPractice.isCompleted && !isShowingAnswer) {
      triggerCelebration();
    }
  }, [studyService.typingPractice.isCompleted, isShowingAnswer]);

  // 触发粒子庆祝动画
  const triggerCelebration = () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // 生成 10 个粒子
    for (let i = 0; i < 10; i++) {
      const particle = document.createElement('div');
      particle.className = 'typing-particle';

      // 计算随机方向
      const angle = (Math.PI * 2 * i) / 10;
      const distance = 40 + Math.random() * 20; // 40-60px
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;

      particle.style.cssText = `
        --tx: ${tx}px;
        --ty: ${ty}px;
        left: ${centerX}px;
        top: ${centerY}px;
        animation-delay: ${Math.random() * 100}ms;
      `;

      container.appendChild(particle);
    }

    // 1 秒后清理粒子并清空输入
    setTimeout(() => {
      container.querySelectorAll('.typing-particle').forEach((p) => p.remove());
      // 清空输入，方便二次练习
      studyService.clearTypingInput();
    }, 1100);
  };

  // 如果没有单词，不显示
  if (words.length === 0) {
    return null;
  }

  // 正面：显示输入框
  if (!isShowingAnswer) {
    return (
      <div ref={containerRef} className="typing-practice-container">
        <div className="typing-practice-input-area">
          {words.map((word, index) => (
            <TypingInput key={index} word={word} index={index} totalWords={words.length} />
          ))}
        </div>
      </div>
    );
  }

  // 反面：显示结果
  return (
    <div ref={containerRef} className="typing-practice-container">
      <TypingResult />
    </div>
  );
});

// 单个输入框组件
const TypingInput = view(
  ({ word, index, totalWords }: { word: string; index: number; totalWords: number }) => {
    const studyService = useService(EchoeStudyService);
    const inputRef = useRef<HTMLInputElement>(null);
    const [localValue, setLocalValue] = useState('');

    // 自动聚焦第一个输入框
    useEffect(() => {
      if (index === 0 && inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }, [index]);

    // 监听 Service 的 currentInput 变化，如果被清空则清空本地值
    useEffect(() => {
      if (studyService.typingPractice.currentInput === '') {
        setLocalValue('');
      }
    }, [studyService.typingPractice.currentInput]);

    // 计算输入框宽度
    const inputWidth = Math.max(60, word.length * 12);

    // 处理输入
    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalValue(value);

      // 更新服务状态
      const currentWords = studyService.typingPractice.words;
      const newInput = currentWords
        .map((w, i) => {
          if (i === index) return value;
          // 从服务中获取其他输入框的值
          const startPos = currentWords.slice(0, i).join(' ').length + (i > 0 ? 1 : 0);
          const endPos = startPos + w.length;
          return studyService.typingPractice.currentInput.slice(startPos, endPos) || '';
        })
        .join(' ');

      studyService.onTypingInput(newInput);

      // 如果输入完成且正确，自动跳到下一个
      if (value === word && index < totalWords - 1) {
        const nextInput = inputRef.current?.parentElement?.nextElementSibling?.querySelector(
          'input'
        );
        if (nextInput instanceof HTMLInputElement) {
          setTimeout(() => nextInput.focus(), 50);
        }
      }
    };

    // 渲染字符（带颜色）
    const renderChars = () => {
      const chars = [];
      const startPos =
        studyService.typingPractice.words.slice(0, index).join(' ').length + (index > 0 ? 1 : 0);

      for (let i = 0; i < localValue.length; i++) {
        const validation = studyService.typingPractice.validationResults[startPos + i];
        const className = validation?.isCorrect ? 'typing-char-correct' : 'typing-char-error';
        const shouldShake = validation?.shouldShake;

        chars.push(
          <span key={i} className={`${className} ${shouldShake ? 'shake' : ''}`}>
            {localValue[i]}
          </span>
        );
      }

      return chars;
    };

    return (
      <div className="typing-input-wrapper">
        <div className="typing-char-display">{renderChars()}</div>
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={handleInput}
          className="typing-input"
          style={{ width: `${inputWidth}px` }}
          placeholder={'_'.repeat(word.length)}
        />
      </div>
    );
  }
);

// 反面结果展示组件
const TypingResult = view(() => {
  const studyService = useService(EchoeStudyService);
  const { words, currentInput, validationResults } = studyService.typingPractice;

  return (
    <div className="typing-result">
      {words.map((word, wordIndex) => {
        const startPos = words.slice(0, wordIndex).join(' ').length + (wordIndex > 0 ? 1 : 0);
        const endPos = startPos + word.length;
        const typedWord = currentInput.slice(startPos, endPos);

        // 如果没有输入，显示灰色
        if (!typedWord) {
          return (
            <span key={wordIndex} className="typing-result-word typing-result-missing">
              {word}
            </span>
          );
        }

        // 渲染每个字符
        const chars = [];
        for (let i = 0; i < word.length; i++) {
          const charPos = startPos + i;
          const validation = validationResults[charPos];
          const typedChar = typedWord[i] || '';

          if (validation?.isCorrect) {
            chars.push(
              <span key={i} className="typing-result-correct">
                {typedChar}
              </span>
            );
          } else if (typedChar) {
            chars.push(
              <span key={i} className="typing-result-error">
                {typedChar}
              </span>
            );
          } else {
            chars.push(
              <span key={i} className="typing-result-missing">
                {word[i]}
              </span>
            );
          }
        }

        return (
          <span key={wordIndex} className="typing-result-word">
            {chars}
          </span>
        );
      })}
    </div>
  );
});
