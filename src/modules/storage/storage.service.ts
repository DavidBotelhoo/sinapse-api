export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export abstract class StorageService {
  abstract putObject(input: PutObjectInput): Promise<void>;
  abstract getObject(key: string): Promise<Buffer>;
  abstract deleteObject(key: string): Promise<void>;
  abstract publicUrl(key: string): string;
}
