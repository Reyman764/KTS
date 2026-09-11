import type { QuickOption, QuickOptionField } from '../types';

export const quickOptionsApi = {
  getAll: (): Promise<QuickOption[]> => window.api.quickOptions.getAll(),
  create: (field: QuickOptionField, value: string): Promise<QuickOption> =>
    window.api.quickOptions.create({ field, value }),
  delete: (id: number): Promise<{ id: number; deleted: boolean }> =>
    window.api.quickOptions.delete({ id }),
};