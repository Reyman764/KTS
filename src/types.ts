export interface RawMaterial {
  id: number;
  name: string;
  unit: string;
  created_at: string;
}

export interface MaterialCode {
  id: number;
  raw_material_id: number;
  code: string;
  description: string | null;
  created_at: string;
}

export type EntityType = 'RAW_MATERIAL' | 'COLOR_CODE';
export type EntryType = 'NORMAL' | 'DRYING_LOSS' | 'AUDIT_ADJUSTMENT' | 'BALANCE_BROUGHT_DOWN';

export interface Transaction {
  id: number;
  entity_type: EntityType;
  entity_id: number;
  entry_type: EntryType;
  date: string;
  description: string | null;
  buyer: string | null;
  order_no: string | null;
  lot_no: string | null;
  rack_no: string | null;
  receive_from_dye: number;
  knitting_distribution: number;
  return_qty: number;
  balance: number;
  assorted: number;
  wastage: number;
  remark: string | null;
  created_at: string;
}

export interface CreateTransactionInput {
  entityType: EntityType;
  entityId: number;
  entryType: EntryType;
  date: string;
  description?: string;
  buyer?: string;
  orderNo?: string;
  lotNo?: string;
  rackNo?: string;
  receiveFromDye: number;
  knittingDistribution: number;
  returnQty: number;
  assorted?: number;
  wastage?: number;
  remark?: string;
}

export interface UpdateTransactionInput {
  id: number;
  entryType: EntryType;
  date: string;
  description?: string;
  buyer?: string;
  orderNo?: string;
  lotNo?: string;
  rackNo?: string;
  receiveFromDye: number;
  knittingDistribution: number;
  returnQty: number;
  assorted?: number;
  wastage?: number;
  remark?: string;
}

export interface GetTransactionsParams {
  entityType: EntityType;
  entityId: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedTransactions {
  rows: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportQueryParams {
  entityType: EntityType;
  entityId: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportTotals {
  totalReceivedFromDye: number;
  totalKnittingDistribution: number;
  totalReturnQty: number;
  totalAssorted: number;
  totalWastage: number;
  totalDryingLoss: number;
}

export interface ReportResult {
  rows: Transaction[];
  totals: ReportTotals;
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportFullResult {
  rows: Transaction[];
  totals: ReportTotals;
}

// Impact of deleting a raw material or color code — how many dependent rows
// would be cascade-deleted along with it. colorCodeCount only applies to
// raw materials (a color code has no child codes of its own).
export interface DeleteImpact {
  colorCodeCount?: number;
  transactionCount: number;
}

// Saved dropdown values for the ledger entry form's combo-box fields.
export type QuickOptionField = 'description' | 'buyer' | 'rack_no' | 'lot_no' | 'order_no';

export interface QuickOption {
  id: number;
  field: QuickOptionField;
  value: string;
  created_at: string;
}

// Cross-entity search report ("what did this buyer/order/lot/rack/
// description touch across every raw material and color code"). At least
// one filter must be supplied.
export interface CrossReportFilters {
  description?: string;
  buyer?: string;
  orderNo?: string;
  lotNo?: string;
  rackNo?: string;
  startDate?: string;
  endDate?: string;
}

export interface CrossReportGroup {
  entityType: EntityType;
  entityId: number;
  label: string;
  unit: string;
  transactionCount: number;
  totals: ReportTotals;
  // The entity's actual current stock balance (from its full history) —
  // NOT derived from the filtered/matched rows, and intentionally excluded
  // from the grand total below, since summing balances across different
  // entities has no real-world meaning.
  currentBalance: number;
}

export interface CrossReportResult {
  groups: CrossReportGroup[];
  grandTotal: ReportTotals;
  matchedTransactionCount: number;
}

// Fiscal year closure ("Balance Brought Down") — see main.js for the full
// operation. Preview is a dry run (no writes); close performs the real
// archive-and-carry-forward operation for every raw material and color
// code that has any transaction history.
export interface FiscalYearPreviewEntity {
  entityType: EntityType;
  entityId: number;
  label: string;
  unit: string;
  currentBalance: number;
  transactionCount: number;
}

export interface FiscalYearPreview {
  totalEntities: number;
  entitiesWithTransactions: number;
  totalTransactionCount: number;
  entities: FiscalYearPreviewEntity[];
}

export interface FiscalYearCloseResult {
  closureId: number;
  label: string;
  entityCount: number;
  transactionCount: number;
  backupPath: string;
}

export interface FiscalYearClosure {
  id: number;
  label: string;
  closed_at: string;
  entity_count: number;
  transaction_count: number;
  backup_path: string | null;
}

// Same shape as Transaction, but with the extra fields archived_transactions
// carries (which closure archived it, under which fiscal year label).
export interface ArchivedTransaction extends Transaction {
  closure_id: number;
  fiscal_year_label: string;
  original_transaction_id: number | null;
}

// One raw material or color code that has archived data for a given past
// fiscal year — feeds the archive browser's picker.
export interface ArchivedEntity {
  entityType: EntityType;
  entityId: number;
  label: string;
  unit: string;
}

declare global {
  interface Window {
    api: {
      rawMaterials: {
        getAll: () => Promise<RawMaterial[]>;
        create: (data: { name: string; unit?: string }) => Promise<RawMaterial>;
        update: (data: { id: number; name: string; unit?: string }) => Promise<RawMaterial>;
        getDeleteImpact: (id: number) => Promise<DeleteImpact>;
        delete: (id: number) => Promise<{ id: number; deleted: boolean }>;
      };
      materialCodes: {
        getByRawMaterial: (rawMaterialId: number) => Promise<MaterialCode[]>;
        create: (data: {
          rawMaterialId: number;
          code: string;
          description?: string;
        }) => Promise<MaterialCode>;
        update: (data: { id: number; code: string; description?: string }) => Promise<MaterialCode>;
        getDeleteImpact: (id: number) => Promise<DeleteImpact>;
        delete: (id: number) => Promise<{ id: number; deleted: boolean }>;
      };
      transactions: {
        getByEntity: (params: GetTransactionsParams) => Promise<PaginatedTransactions>;
        create: (data: CreateTransactionInput) => Promise<Transaction>;
        update: (data: UpdateTransactionInput) => Promise<Transaction>;
        delete: (data: { id: number }) => Promise<{ id: number; deleted: boolean }>;
      };
      reports: {
        query: (params: ReportQueryParams) => Promise<ReportResult>;
        queryAll: (params: Omit<ReportQueryParams, 'page' | 'pageSize'>) => Promise<ReportFullResult>;
      };
      quickOptions: {
        getAll: () => Promise<QuickOption[]>;
        create: (data: { field: QuickOptionField; value: string }) => Promise<QuickOption>;
        delete: (data: { id: number }) => Promise<{ id: number; deleted: boolean }>;
      };
      crossReport: {
        search: (filters: CrossReportFilters) => Promise<CrossReportResult>;
      };
      fiscalYear: {
        preview: () => Promise<FiscalYearPreview>;
        close: (data: { label: string; openingDate: string }) => Promise<FiscalYearCloseResult>;
        list: () => Promise<FiscalYearClosure[]>;
        getArchivedTransactions: (params: {
          entityType: EntityType;
          entityId: number;
          fiscalYearLabel: string;
        }) => Promise<ArchivedTransaction[]>;
        getArchivedEntities: (params: { fiscalYearLabel: string }) => Promise<ArchivedEntity[]>;
      };
    };
  }
}