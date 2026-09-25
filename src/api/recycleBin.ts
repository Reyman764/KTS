import type { RecycleBinContents } from '../types';

export const recycleBinApi = {
  list: (): Promise<RecycleBinContents> => window.api.recycleBin.list(),
  restoreRawMaterial: (id: number): Promise<{ id: number; restored: boolean }> =>
    window.api.recycleBin.restoreRawMaterial(id),
  restoreColorCode: (id: number): Promise<{ id: number; restored: boolean }> =>
    window.api.recycleBin.restoreColorCode(id),
  purgeRawMaterial: (id: number): Promise<{ id: number; purged: boolean }> =>
    window.api.recycleBin.purgeRawMaterial(id),
  purgeColorCode: (id: number): Promise<{ id: number; purged: boolean }> =>
    window.api.recycleBin.purgeColorCode(id),
  restoreRawMaterials: (ids: number[]): Promise<{ restoredCount: number }> =>
    window.api.recycleBin.restoreRawMaterials(ids),
  restoreColorCodes: (ids: number[]): Promise<{ restoredCount: number }> =>
    window.api.recycleBin.restoreColorCodes(ids),
  purgeRawMaterials: (ids: number[]): Promise<{ purgedCount: number }> =>
    window.api.recycleBin.purgeRawMaterials(ids),
  purgeColorCodes: (ids: number[]): Promise<{ purgedCount: number }> =>
    window.api.recycleBin.purgeColorCodes(ids),
};