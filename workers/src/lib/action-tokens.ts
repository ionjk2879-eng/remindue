// 푸시 알림 액션 버튼("유지하기"/"나중에")용 1회성 토큰 — 서비스워커는 로그인 세션(accessToken)에
// 접근할 수 없어서(pushsubscriptionchange 핸들러와 같은 이유, sw.ts 주석 참고), 알림을 앱을 열지
// 않고 바로 처리하려면 인증 대신 "추측 불가능한 토큰을 아는 것 자체가 이 액션을 수행할 권한"이라는
// push/unsubscribe와 같은 패턴을 쓴다. 1회용이고(used_at 찍히면 재사용 불가), 24시간 지난 토큰은
// 무효 처리한다(한참 지난 뒤에 오래된 알림을 눌러도 엉뚱한 회차가 확인 처리되지 않게).

export async function createActionToken(db: D1Database, purchaseId: number): Promise<string> {
  const token = crypto.randomUUID();
  await db.prepare('INSERT INTO push_action_tokens (token, purchase_id) VALUES (?, ?)').bind(token, purchaseId).run();
  return token;
}

/** 유효한(미사용, 24시간 이내) 토큰이면 그 자리에서 사용 처리하고 purchase_id를 반환한다. 아니면 null. */
export async function consumeActionToken(db: D1Database, token: string): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT purchase_id FROM push_action_tokens
        WHERE token = ? AND used_at IS NULL AND created_at > datetime('now', '-1 day')`
    )
    .bind(token)
    .first<{ purchase_id: number }>();
  if (!row) return null;

  await db.prepare(`UPDATE push_action_tokens SET used_at = datetime('now') WHERE token = ?`).bind(token).run();
  return row.purchase_id;
}
