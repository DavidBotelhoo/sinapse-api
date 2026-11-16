export const IMPORTS_QUEUE = 'imports';

export type ImportsJobName = 'extract' | 'cleanup-stale';

export interface ExtractJobData {
  importJobId: string;
}

export interface CleanupJobData {
  // vazio — contexto global
  _marker?: never;
}

export type ImportsJobData = ExtractJobData | CleanupJobData;

export const CLEANUP_JOB_ID: ImportsJobName = 'cleanup-stale';
