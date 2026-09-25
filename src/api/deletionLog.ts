import type { DeletionLogEntry } from '../types';

export const deletionLogApi = {
  getAll: (): Promise<DeletionLogEntry[]> => window.api.deletionLog.getAll(),
};