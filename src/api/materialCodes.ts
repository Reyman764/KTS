import type { DeleteImpact, MaterialCode } from '../types';

export const materialCodesApi = {
  getByRawMaterial: (rawMaterialId: number): Promise<MaterialCode[]> =>
    window.api.materialCodes.getByRawMaterial(rawMaterialId),
  create: (rawMaterialId: number, code: string, description?: string): Promise<MaterialCode> =>
    window.api.materialCodes.create({ rawMaterialId, code, description }),
  update: (id: number, code: string, description?: string): Promise<MaterialCode> =>
    window.api.materialCodes.update({ id, code, description }),
  getDeleteImpact: (id: number): Promise<DeleteImpact> =>
    window.api.materialCodes.getDeleteImpact(id),
  delete: (id: number): Promise<{ id: number; deleted: boolean }> =>
    window.api.materialCodes.delete(id),
};