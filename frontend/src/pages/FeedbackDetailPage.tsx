import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { deleteFeedback, fetchFeedbackDetail, replyToFeedback, updateFeedback } from '../api/feedback';
import { CATEGORY_LABEL, CategoryBadge, STATUS_LABEL, StatusBadge } from '../components/FeedbackBadges';
import type { FeedbackCategory, FeedbackDetail, FeedbackStatus } from '../types';

const CATEGORY_OPTIONS: FeedbackCategory[] = ['BUG', 'FEATURE_REQUEST', 'QUESTION', 'OTHER'];
const STATUS_OPTIONS: FeedbackStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

function formatDateTime(dateStr: string): string {
  return dateStr.replace('T', ' ').slice(0, 16);
}

export default function FeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const feedbackId = Number(id);
  const navigate = useNavigate();

  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyStatus, setReplyStatus] = useState<FeedbackStatus | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editCategory, setEditCategory] = useState<FeedbackCategory>('QUESTION');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const data = await fetchFeedbackDetail(feedbackId);
    setDetail(data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackId]);

  const handleReply = async (e: FormEvent) => {
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

  const handleEditClick = () => {
    if (!detail) return;
    setEditCategory(detail.category);
    setEditTitle(detail.title);
    setEditContent(detail.content);
    setEditError(null);
    setEditing(true);
  };

  const handleEditSave = async (e: FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setSavingEdit(true);
    try {
      const updated = await updateFeedback(feedbackId, { category: editCategory, title: editTitle, content: editContent });
      setDetail(updated);
      setEditing(false);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setEditError(message ?? '수정하지 못했어요.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('이 문의를 삭제할까요? 답글도 함께 삭제되며 되돌릴 수 없어요.')) return;
    setDeleting(true);
    try {
      await deleteFeedback(feedbackId);
      navigate('/feedback');
    } catch (err) {
      console.error(err);
      setDeleting(false);
    }
  };

  if (!detail) return null;

  const canReply = detail.isMine || detail.viewerIsAdmin;
  const canDelete = detail.isMine || detail.viewerIsAdmin;

  return (
    <div className="feedback-detail">
      <Link to="/feedback" className="btn-text">
        ← 목록으로
      </Link>

      <div className="feedback-detail__post">
        <div className="feedback-detail__post-top">
          <div className="feedback-list-item__top">
            <CategoryBadge category={detail.category} />
            <StatusBadge status={detail.status} />
          </div>
          {!editing && canDelete && (
            <div className="feedback-detail__owner-actions">
              {detail.isMine && (
                <button type="button" className="btn-text" onClick={handleEditClick}>
                  수정
                </button>
              )}
              {canDelete && (
                <button type="button" className="btn-text" onClick={handleDelete} disabled={deleting}>
                  {deleting ? '삭제 중...' : '삭제'}
                </button>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <form className="feedback-form" onSubmit={handleEditSave}>
            <div className="field">
              <label>카테고리</label>
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as FeedbackCategory)}>
                {CATEGORY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>제목</label>
              <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={100} required />
            </div>
            <div className="field">
              <label>내용</label>
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={5} required />
            </div>
            {editError && <p className="form-error">{editError}</p>}
            <div className="feedback-detail__owner-actions">
              <button type="button" className="btn-text" onClick={() => setEditing(false)} disabled={savingEdit}>
                취소
              </button>
              <button type="submit" className="btn btn-sm" disabled={savingEdit}>
                {savingEdit ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <h1>{detail.title}</h1>
            <p className="feedback-detail__meta">
              {detail.authorNickname} · {formatDateTime(detail.createdAt)}
            </p>
            <p className="feedback-detail__content">{detail.content}</p>
          </>
        )}
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
