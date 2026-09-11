import type { CrossReportFilters, CrossReportResult } from '../types';

export const crossReportApi = {
  search: (filters: CrossReportFilters): Promise<CrossReportResult> =>
    window.api.crossReport.search(filters),
};