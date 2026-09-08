import type { MaterialCode } from '../types';

export const materialCodesApi = {
  getByRawMaterial: (rawMaterialId: number): Promise<MaterialCode[]> =>
    window.api.materialCodes.getByRawMaterial(rawMaterialId),
  create: (rawMaterialId: number, code: string, description?: string): Promise<MaterialCode> =>
    window.api.materialCodes.create({ rawMaterialId, code, description }),
};