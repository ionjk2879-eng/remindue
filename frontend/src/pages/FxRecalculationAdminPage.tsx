import { useEffect, useState } from 'react';
import axios from 'axios';
import { fetchFxAdminJobs, type FxAdminJobSummary } from '../api/fxRecalculation';

export default function FxRecalculationAdminPage() {
  const [jobs, setJobs] = useState<FxAdminJobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFxAdminJobs()
      .then(setJobs)
      .catch((err) => setError(
        axios.isAxiosError(err) ? err.response?.data?.message ?? '작업 목록을 불러오지 못했습니다.' : '작업 목록을 불러오지 못했습니다.',
      ));
  }, []);

  return (
    <div className="settings-page">
      <section className="settings-section">
        <h1>해외결제 재계산 작업</h1>
        <p className="settings-section__hint">실패·부분 적용 작업을 운영자가 확인하는 화면입니다.</p>
        {error && <p className="form-error">{error}</p>}
        {!error && (
          <div className="table-scroll">
            <table className="pricing-table">
              <thead><tr><th>사용자</th><th>상태</th><th>전체</th><th>준비</th><th>실패</th><th>적용</th><th>생성일</th></tr></thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.userEmail}</td><td>{job.status}</td><td>{job.totalCount}</td>
                    <td>{job.readyCount}</td><td>{job.failedCount}</td><td>{job.appliedCount}</td><td>{job.createdAt}</td>
                  </tr>
                ))}
                {jobs.length === 0 && <tr><td colSpan={7}>재계산 작업이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
