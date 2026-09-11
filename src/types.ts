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
export type EntryType = 'NORMAL' | 'DRYING_LOSS' | 'AUDIT_ADJUSTMENT';

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
    };
  }
}