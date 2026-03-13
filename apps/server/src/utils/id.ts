import { customAlphabet } from 'nanoid';

import { OBJECT_TYPE } from '../models/constant/type.js';
const typeid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 23);

let _revlogLastMs = 0;
let _revlogSeq = 0;

export const generateUid = () => {
  return generateTypeId(OBJECT_TYPE.USER);
};

export const generateTagId = () => {
  return generateTypeId(OBJECT_TYPE.TAG);
};

export const generateTypeId = (type: (typeof OBJECT_TYPE)[keyof typeof OBJECT_TYPE]) => {
  switch (type) {
    case OBJECT_TYPE.MEMO: {
      return `m${typeid()}`;
    }
    case OBJECT_TYPE.PAGE: {
      return `p${typeid()}`;
    }
    case OBJECT_TYPE.ANNOTATION: {
      return `a${typeid()}`;
    }
    case OBJECT_TYPE.INBOX: {
      return `i${typeid()}`;
    }
    case OBJECT_TYPE.FILE: {
      return `f${typeid()}`;
    }
    case OBJECT_TYPE.SPACE: {
      return `s${typeid()}`;
    }
    case OBJECT_TYPE.NOTE: {
      return `n${typeid()}`;
    }
    case OBJECT_TYPE.LIBRARY: {
      return `l${typeid()}`;
    }
    case OBJECT_TYPE.USER: {
      return `u${typeid()}`;
    }
    case OBJECT_TYPE.TIMELINE: {
      return `tl${typeid()}`;
    }
    case OBJECT_TYPE.CATEGORY: {
      return `c${typeid()}`;
    }
    case OBJECT_TYPE.RELATION: {
      return `r${typeid()}`;
    }
    case OBJECT_TYPE.CONVERSATION: {
      return `conv${typeid()}`;
    }
    case OBJECT_TYPE.MESSAGE: {
      return `msg${typeid()}`;
    }
    case OBJECT_TYPE.RECOMMENDATION: {
      return `rec${typeid()}`;
    }
    case OBJECT_TYPE.TAG: {
      return `t${typeid()}`;
    }
    case OBJECT_TYPE.PUSH_RULE: {
      return `push${typeid()}`;
    }
    case OBJECT_TYPE.REVIEW_SESSION: {
      return `rev${typeid()}`;
    }
    case OBJECT_TYPE.REVIEW_ITEM: {
      return `ri${typeid()}`;
    }
    case OBJECT_TYPE.SR_RULE: {
      return `srr${typeid()}`;
    }
    case OBJECT_TYPE.NOTIFICATION: {
      return `notif${typeid()}`;
    }
  }
  throw new Error(`Invalid type: ${type}`);
};

/**
 * 生成唯一的 revlog ID。
 * 格式：ms * 1000 + seq（与 Anki revlog.id "ms*1000+random" 语义对齐）。
 * 同一毫秒内最多支持 1000 个唯一值（seq 0–999），超出后 seq 回绕仍保持唯一性（ms 必然已推进）。
 */
export function generateRevlogId(): number {
  const ms = Date.now();
  if (ms === _revlogLastMs) {
    _revlogSeq = (_revlogSeq + 1) % 1000;
  } else {
    _revlogLastMs = ms;
    _revlogSeq = 0;
  }
  return ms * 1000 + _revlogSeq;
}
