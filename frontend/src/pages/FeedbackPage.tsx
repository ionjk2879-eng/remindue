import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { createFeedback, fetchFeedbackList } from '../api/feedback';
import { CATEGORY_LABEL, CategoryBadge, StatusBadge } from '../components/FeedbackBadges';
import type { FeedbackCategory, FeedbackListItem } from '../types';

const CATEGORY_OPTIONS: FeedbackCategory[] = ['BUG', 'FEATURE_REQUEST', 'QUESTION', 'OTHER'];

function formatDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackListItem[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('QUESTION');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const data = await fetchFeedbackList();
    setItems(data);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createFeedback({ category, title, content });
      setTitle('');
      setContent('');
      setCategory('QUESTION');
      setShowForm(false);
      await load();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(message ?? '등록하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="feedback-page">
      <div className="feedback-header">
        <h1>문의/제안</h1>
        <button type="button" className="btn btn-sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '취소' : '새 문의 작성'}
        </button>
      </div>

      {showForm && (
        <form className="feedback-form" onSubmit={handleSubmit}>
          <div className="field">
            <label>카테고리</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)}>
              {CATEGORY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>제목</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
          </div>
          <div className="field">
            <label>내용</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} required />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? '등록 중...' : '등록하기'}
          </button>
        </form>
      )}

      {items === null ? null : items.length === 0 ? (
        <p className="empty-state">아직 등록된 문의가 없어요.</p>
      ) : (
        <ul className="feedback-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/feedback/${item.id}`} className="feedback-list-item">
                <div className="feedback-list-item__top">
                  <CategoryBadge category={item.category} />
                  <StatusBadge status={item.status} />
                </div>
                <div className="feedback-list-item__title">{item.title}</div>
                <div className="feedback-list-item__meta">
                  <span>{item.authorNickname}</span>
                  <span>{formatDate(item.createdAt)}</span>
                  {item.replyCount > 0 && <span>답글 {item.replyCount}개</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
