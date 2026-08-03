import type { FxCardBrand, FxCardIssuer } from './fx-card';

export interface FxCalculationEvidence {
  amountKrw: number;
  rate: number;
  rateSource: 'EXIMBANK' | 'FRANKFURTER';
  rateDate: string;
  cardIssuer: FxCardIssuer | null;
  cardBrand: FxCardBrand | null;
  formulaVersion: string;
  usedFallback: boolean;
}

export async function recordFxCalculationAudit(
  db: D1Database,
  input: {
    purchaseId: number;
    jobId?: number | null;
    calculationDate: string;
    originalAmount: number;
    originalCurrency: string;
    previousAmount: number | null;
    evidence: FxCalculationEvidence;
  },
): Promise<void> {
  const { evidence } = input;
  await db.prepare(
    `INSERT INTO fx_calculation_history
      (purchase_id, job_id, calculation_date, original_amount, original_currency,
       previous_amount, calculated_amount, exchange_rate, rate_source, rate_date,
       card_issuer, card_brand, formula_version, used_fallback)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    input.purchaseId,
    input.jobId ?? null,
    input.calculationDate,
    input.originalAmount,
    input.originalCurrency,
    input.previousAmount,
    evidence.amountKrw,
    evidence.rate,
    evidence.rateSource,
    evidence.rateDate,
    evidence.cardIssuer,
    evidence.cardBrand,
    evidence.formulaVersion,
    evidence.usedFallback ? 1 : 0,
  ).run();
}
