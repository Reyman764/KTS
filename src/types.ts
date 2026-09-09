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
  lot_no: string | null;
  rack_no: string | null;
  receiver: string | null;
  issue: number;
  receive: number;
  balance: number;
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
  lotNo?: string;
  rackNo?: string;
  receiver?: string;
  issue: number;
  receive: number;
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
  totalReceived: number;
  totalIssued: number;
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
      };
      reports: {
        query: (params: ReportQueryParams) => Promise<ReportResult>;
        queryAll: (params: Omit<ReportQueryParams, 'page' | 'pageSize'>) => Promise<ReportFullResult>;
      };
    };
  }
}