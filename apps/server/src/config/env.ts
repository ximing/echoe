import path from 'node:path';

import dotenv from 'dotenv';

import { logger } from '../utils/logger.js';

// 获取当前环境
const environment = process.env.NODE_ENV || 'development';

// 获取项目根路径
// In Jest/CommonJS, __dirname is available as a global
// In ESM runtime, we need to derive it from import.meta.url, but we can't reference
// import.meta in a file that Jest will transform to CommonJS, so we just use __dirname
// which will be available in both contexts (Node provides it, Jest injects it)
const projectRoot = path.resolve(__dirname, '../..');

// 加载环境变量
const loadEnvironment = () => {
  // 基础配置文件
  const baseEnvironmentPath = path.resolve(projectRoot, '.env');
  logger.debug('Base env path:', baseEnvironmentPath);
  // 环境特定的配置文件
  const environmentPath = path.resolve(projectRoot, `.env.${environment}`);

  logger.info('Loading environment variables...');
  logger.debug('Base env path:', baseEnvironmentPath);
  logger.debug('Environment specific path:', environmentPath);

  // 先加载基础配置
  const baseResult = dotenv.config({ path: baseEnvironmentPath });
  if (baseResult.error) {
    logger.debug('No base .env file found');
  } else {
    logger.debug('Base .env file loaded');
  }

  // 再加载环境特定配置（会覆盖基础配置中的同名变量）
  const environmentResult = dotenv.config({ path: environmentPath });
  if (environmentResult.error) {
    logger.debug(`No ${environment} specific .env file found`);
  } else {
    logger.debug(`${environment} specific .env file loaded`);
  }
};

export { loadEnvironment as loadEnv };
