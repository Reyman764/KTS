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
        getByEntity: (params: {
          entityType: EntityType;
          entityId: number;
        }) => Promise<Transaction[]>;
        create: (data: CreateTransactionInput) => Promise<Transaction>;
      };
    };
  }
}