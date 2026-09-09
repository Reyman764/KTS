import type { ReportFullResult, ReportQueryParams, ReportResult } from '../types';

export const reportsApi = {
  query: (params: ReportQueryParams): Promise<ReportResult> =>
    window.api.reports.query(params),
  queryAll: (params: Omit<ReportQueryParams, 'page' | 'pageSize'>): Promise<ReportFullResult> =>
    window.api.reports.queryAll(params),
};