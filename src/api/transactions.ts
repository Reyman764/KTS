import type {
  CreateTransactionInput,
  GetTransactionsParams,
  PaginatedTransactions,
  Transaction,
} from '../types';

export const transactionsApi = {
  getByEntity: (params: GetTransactionsParams): Promise<PaginatedTransactions> =>
    window.api.transactions.getByEntity(params),
  create: (data: CreateTransactionInput): Promise<Transaction> =>
    window.api.transactions.create(data),
};