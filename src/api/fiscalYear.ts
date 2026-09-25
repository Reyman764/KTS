import type {
  ArchivedEntity,
  EntityType,
  FiscalYearClosure,
  FiscalYearCloseResult,
  FiscalYearPreview,
  PaginatedArchivedTransactions,
} from '../types';

export const fiscalYearApi = {
  preview: (): Promise<FiscalYearPreview> => window.api.fiscalYear.preview(),
  close: (label: string, openingDate: string): Promise<FiscalYearCloseResult> =>
    window.api.fiscalYear.close({ label, openingDate }),
  list: (): Promise<FiscalYearClosure[]> => window.api.fiscalYear.list(),
  getArchivedTransactions: (
    entityType: EntityType,
    entityId: number,
    fiscalYearLabel: string,
    page?: number,
    pageSize?: number
  ): Promise<PaginatedArchivedTransactions> =>
    window.api.fiscalYear.getArchivedTransactions({
      entityType,
      entityId,
      fiscalYearLabel,
      page,
      pageSize,
    }),
  getArchivedEntities: (fiscalYearLabel: string): Promise<ArchivedEntity[]> =>
    window.api.fiscalYear.getArchivedEntities({ fiscalYearLabel }),
};