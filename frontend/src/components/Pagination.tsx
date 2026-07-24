interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** 페이지 번호 버튼 목록 — 목록 데이터는 이미 클라이언트에 있으므로 페이지 전환은 상태만 바뀌고
 *  해당 목록만 다시 그려진다(라우팅 없음, 새로고침 없음). */
export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="페이지">
      <button
        type="button"
        className="pagination__btn pagination__btn--nav"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="이전 페이지"
      >
        ‹
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          type="button"
          key={p}
          className={`pagination__btn${p === page ? ' pagination__btn--active' : ''}`}
          onClick={() => onPageChange(p)}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        className="pagination__btn pagination__btn--nav"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="다음 페이지"
      >
        ›
      </button>
    </nav>
  );
}
