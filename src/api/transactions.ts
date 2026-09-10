import type {
  CreateTransactionInput,
  GetTransactionsParams,
  PaginatedTransactions,
  Transaction,
  UpdateTransactionInput,
} from '../types';

export const transactionsApi = {
  getByEntity: (params: GetTransactionsParams): Promise<PaginatedTransactions> =>
    window.api.transactions.getByEntity(params),
  create: (data: CreateTransactionInput): Promise<Transaction> =>
    window.api.transactions.create(data),
  update: (data: UpdateTransactionInput): Promise<Transaction> =>
    window.api.transactions.update(data),
  delete: (id: number): Promise<{ id: number; deleted: boolean }> =>
    window.api.transactions.delete({ id }),
};