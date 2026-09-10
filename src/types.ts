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

declare global {
  interface Window {
    api: {
      rawMaterials: {
        getAll: () => Promise<RawMaterial[]>;
        create: (data: { name: string; unit?: string }) => Promise<RawMaterial>;
      };
      materialCodes: {
        getByRawMaterial: (rawMaterialId: number) => Promise<MaterialCode[]>;
        create: (data: {
          rawMaterialId: number;
          code: string;
          description?: string;
        }) => Promise<MaterialCode>;
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
    };
  }
}