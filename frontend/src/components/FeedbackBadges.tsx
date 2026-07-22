import type { FeedbackCategory, FeedbackStatus } from '../types';

export const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  BUG: '버그',
  FEATURE_REQUEST: '기능제안',
  QUESTION: '질문',
  OTHER: '기타',
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  OPEN: '답변대기',
  IN_PROGRESS: '처리중',
  RESOLVED: '완료',
};

export function CategoryBadge({ category }: { category: FeedbackCategory }) {
  return <span className={`feedback-category-badge feedback-category-badge--${category}`}>{CATEGORY_LABEL[category]}</span>;
}

export function StatusBadge({ status }: { status: FeedbackStatus }) {
  return <span className={`feedback-status-badge feedback-status-badge--${status}`}>{STATUS_LABEL[status]}</span>;
}
