import {
  OverviewReportSchema,
  ServiceReportSchema,
  SlaReportSchema,
  TrendReportSchema,
  WorkloadReportSchema,
} from '@itsm/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

const report = <T>(path: string, schema: { parse: (v: unknown) => T }) => ({
  queryKey: ['reports', path],
  queryFn: () => apiFetch(`/api/reports/${path}`, schema),
  refetchInterval: 30000,
});
export const useOverview = () => useQuery(report('overview', OverviewReportSchema));
export const useWorkload = () => useQuery(report('workload', WorkloadReportSchema));
export const useServiceReport = () => useQuery(report('services', ServiceReportSchema));
export const useSlaReport = () => useQuery(report('sla', SlaReportSchema));
export const useTrends = () => useQuery(report('trends?days=30', TrendReportSchema));
