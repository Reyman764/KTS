import type { DeleteImpact, RawMaterial } from '../types';

export const rawMaterialsApi = {
  getAll: (): Promise<RawMaterial[]> => window.api.rawMaterials.getAll(),
  create: (name: string, unit?: string): Promise<RawMaterial> =>
    window.api.rawMaterials.create({ name, unit }),
  update: (id: number, name: string, unit?: string): Promise<RawMaterial> =>
    window.api.rawMaterials.update({ id, name, unit }),
  getDeleteImpact: (id: number): Promise<DeleteImpact> =>
    window.api.rawMaterials.getDeleteImpact(id),
  delete: (id: number): Promise<{ id: number; deleted: boolean }> =>
    window.api.rawMaterials.delete(id),
};