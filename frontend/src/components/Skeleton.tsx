/** paper 톤에 맞춘 회색 로딩 placeholder — 데이터 fetch 중 빈 화면 대신 보여준다. */
export default function Skeleton({ width, height = '1em' }: { width: string; height?: string }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}
