import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { fetchFeedbackDetail, replyToFeedback } from '../api/feedback';
import { CategoryBadge, STATUS_LABEL, StatusBadge } from '../components/FeedbackBadges';
import type { FeedbackDetail, FeedbackStatus } from '../types';

const STATUS_OPTIONS: FeedbackStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

function formatDateTime(dateStr: string): string {
  return dateStr.replace('T', ' ').slice(0, 16);
}

export default function FeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const feedbackId = Number(id);

  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyStatus, setReplyStatus] = useState<FeedbackStatus | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const data = await fetchFeedbackDetail(feedbackId);
    setDetail(data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackId]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await replyToFeedback(feedbackId, replyContent, replyStatus || undefined);
      setDetail(updated);
      setReplyContent('');
      setReplyStatus('');
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(message ?? '답글을 남기지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!detail) return null;

  const canReply = detail.isMine || detail.viewerIsAdmin;

  return (
    <div className="feedback-detail">
      <Link to="/feedback" className="btn-text">
        ← 목록으로
      </Link>

      <div className="feedback-detail__post">
        <div className="feedback-list-item__top">
          <CategoryBadge category={detail.category} />
          <StatusBadge status={detail.status} />
        </div>
        <h1>{detail.title}</h1>
        <p className="feedback-detail__meta">
          {detail.authorNickname} · {formatDateTime(detail.createdAt)}
        </p>
        <p className="feedback-detail__content">{detail.content}</p>
      </div>

      {detail.replies.length > 0 && (
        <div className="feedback-thread">
          {detail.replies.map((reply) => (
            <div key={reply.id} className={`feedback-reply ${reply.isAdmin ? 'feedback-reply--admin' : ''}`}>
              <div className="feedback-reply__meta">
                {reply.isAdmin ? '운영자' : detail.authorNickname} · {formatDateTime(reply.createdAt)}
              </div>
              <p>{reply.content}</p>
            </div>
          ))}
        </div>
      )}

      {canReply && (
        <form className="feedback-reply-form" onSubmit={handleReply}>
          <div className="field">
            <label>답글</label>
            <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} rows={4} required />
          </div>
          {detail.viewerIsAdmin && (
            <div className="field">
              <label>상태 변경</label>
              <select value={replyStatus} onChange={(e) => setReplyStatus(e.target.value as FeedbackStatus | '')}>
                <option value="">변경 안 함</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-sm" disabled={submitting}>
            {submitting ? '등록 중...' : '답글 남기기'}
          </button>
        </form>
      )}
    </div>
  );
}
