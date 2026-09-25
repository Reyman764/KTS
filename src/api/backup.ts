import type { BackupCreateResult, BackupRestoreResult } from '../types';

export const backupApi = {
  createNow: (): Promise<BackupCreateResult> => window.api.backup.createNow(),
  restore: (): Promise<BackupRestoreResult> => window.api.backup.restore(),
  relaunch: (): Promise<void> => window.api.backup.relaunch(),
};