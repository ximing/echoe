/**
 * 步长解析与格式转换工具
 *
 * DTO 层（EchoeFsrsConfigDto）使用 number[]（分钟数），
 * ts-fsrs 运行时使用 string[]（如 "1m", "10m"）。
 * 本模块提供两层之间的统一转换，避免各服务重复实现。
 */

/**
 * 将原始步长（数字或字符串）解析为分钟数。
 *
 * 支持格式：
 * - 纯数字（number | string）：视为分钟数，如 `10` → `10`
 * - 带单位字符串：`"10m"` → `10`，`"1h"` → `60`
 *
 * @returns 正整数/正小数分钟数，输入无效时返回 undefined
 */
export function parseStepToMinutes(step: unknown): number | undefined {
  if (typeof step === 'number') {
    return Number.isFinite(step) && step > 0 ? step : undefined;
  }

  if (typeof step !== 'string') {
    return undefined;
  }

  const match = step.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(m|h)?$/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return match[2] === 'h' ? value * 60 : value;
}

/**
 * 将分钟数组转为 ts-fsrs 格式的字符串数组。
 *
 * 示例：`[1, 10]` → `["1m", "10m"]`
 */
export function minutesToFsrsSteps(minutes: number[]): string[] {
  return minutes.map((m) => `${m}m`);
}
