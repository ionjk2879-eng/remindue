import { apiClient } from './client';

export interface FxRecalculationItem {
  id: number;
  purchaseId: number;
  itemName: string;
  calculationDate: string;
  originalAmount: number;
  originalCurrency: string;
  beforeAmount: number | null;
  proposedAmount: number | null;
  rateSource: 'EXIMBANK' | 'FRANKFURTER' | null;
  rateDate: string | null;
  cardIssuer: string | null;
  cardBrand: string | null;
  formulaVersion: string | null;
  usedFallback: boolean;
  status: 'READY' | 'FAILED' | 'APPLIED';
  errorMessage: string | null;
  retryCount: number;
}

export interface FxRecalculationJob {
  id: number;
  status: string;
  totalCount: number;
  readyCount: number;
  failedCount: number;
  appliedCount: number;
  createdAt: string;
  completedAt: string | null;
  items: FxRecalculationItem[];
}

export interface FxAdminJobSummary {
  id: number;
  userEmail: string;
  status: string;
  totalCount: number;
  readyCount: number;
  failedCount: number;
  appliedCount: number;
  createdAt: string;
}

export async function previewFxRecalculation() {
  const { data } = await apiClient.post<FxRecalculationJob>('/fx-recalculation/preview');
  return data;
}

export async function fetchLatestFxRecalculation() {
  const { data } = await apiClient.get<FxRecalculationJob | null>('/fx-recalculation/latest');
  return data;
}

export async function applyFxRecalculation(jobId: number) {
  const { data } = await apiClient.post<FxRecalculationJob>(`/fx-recalculation/${jobId}/apply`);
  return data;
}

export async function retryFxRecalculation(jobId: number) {
  const { data } = await apiClient.post<FxRecalculationJob>(`/fx-recalculation/${jobId}/retry`);
  return data;
}

export async function fetchFxAdminJobs() {
  const { data } = await apiClient.get<FxAdminJobSummary[]>('/fx-recalculation/admin/jobs');
  return data;
}
