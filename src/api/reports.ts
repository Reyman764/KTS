import type { ReportQueryParams, ReportResult } from '../types';

export const reportsApi = {
  query: (params: ReportQueryParams): Promise<ReportResult> =>
    window.api.reports.query(params),
};