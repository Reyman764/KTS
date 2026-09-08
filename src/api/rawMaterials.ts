import type { RawMaterial } from '../types';

export const rawMaterialsApi = {
  getAll: (): Promise<RawMaterial[]> => window.api.rawMaterials.getAll(),
  create: (name: string, unit?: string): Promise<RawMaterial> =>
    window.api.rawMaterials.create({ name, unit }),
};