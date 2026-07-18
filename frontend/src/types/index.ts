export type PurchaseType = 'ELECTRONICS' | 'ONLINE_ORDER' | 'RECURRING_DELIVERY';

export interface Purchase {
  id: number;
  type: PurchaseType;
  itemName: string;
  baseDate: string; // yyyy-MM-dd
  amount: number | null;
  memo: string | null;
  warrantyMonths: number | null;
  returnDeadlineDays: number | null;
  intervalDays: number | null;
  lastDeliveredDate: string | null;
  deadline: string;
  dDay: number;
  deliveryRound: number | null;
  missedConfirmations: number | null;
  createdAt: string;
}

export interface PurchaseInput {
  type: PurchaseType;
  itemName: string;
  baseDate: string;
  amount?: number;
  memo?: string;
  warrantyMonths?: number;
  returnDeadlineDays?: number;
  intervalDays?: number;
}

export interface AuthResponse {
  accessToken: string;
  nickname: string;
  isPremium: boolean;
}

export type PendingPurchaseSource = 'email' | 'image';
export type PendingPurchaseStatus = 'pending' | 'confirmed' | 'ignored';

export interface PendingPurchase {
  id: number;
  source: PendingPurchaseSource;
  type: PurchaseType;
  itemName: string | null;
  orderDate: string | null; // yyyy-MM-dd
  expectedDeliveryDate: string | null; // yyyy-MM-dd
  /** AI가 추정한 반품/교환 가능 일수. */
  returnDeadlineDays: number | null;
  /** true면 메일에 명시된 값이 아니라 법정 최소 기준(7일)으로 추정한 값. */
  returnDeadlineEstimated: boolean;
  status: PendingPurchaseStatus;
  createdAt: string;
}

export interface PendingPurchasesResponse {
  forwardingEmail: string;
  items: PendingPurchase[];
}
