declare module 'ali-oss' {
  export interface OSSOptions {
    region: string;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    endpoint?: string;
    secure?: boolean;
  }

  export interface OSSListOptions {
    prefix?: string;
    marker?: string;
  }

  export interface OSSListObject {
    name?: string;
  }

  export interface OSSListResult {
    objects?: OSSListObject[];
    isTruncated?: boolean;
    nextMarker?: string;
  }

  export interface OSSHeadResult {
    meta?: Record<string, any>;
  }

  export interface OSSGetResult {
    content?: Buffer | string | ArrayBuffer | Uint8Array;
  }

  export interface OSSSignatureOptions {
    expires?: number;
    ContentType?: string;
  }

  export default class OSS {
    constructor(options: OSSOptions);
    put(name: string, file: Buffer | string): Promise<unknown>;
    get(name: string): Promise<OSSGetResult>;
    delete(name: string): Promise<unknown>;
    list(options?: OSSListOptions): Promise<OSSListResult>;
    head(name: string): Promise<OSSHeadResult>;
    signatureUrl(name: string, options?: OSSSignatureOptions): Promise<string>;
  }
}
