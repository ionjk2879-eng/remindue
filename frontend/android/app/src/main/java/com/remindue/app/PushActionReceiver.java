package com.remindue.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationManagerCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 알림의 "유지하기"/"모두 유지"/"모두 중단" 같은 액션 버튼 처리 — 서비스워커
 * (frontend/src/sw.ts)의 notificationclick과 동일한 역할이다. 앱을 열지 않고 1회용 토큰만으로
 * 서버에 확인 처리를 요청한다(workers/src/routes/push.ts — 인증 불필요, 토큰 소유 자체가 권한).
 */
public class PushActionReceiver extends BroadcastReceiver {

    static final String EXTRA_ACTION = "remindue_action";
    static final String EXTRA_TOKEN = "remindue_action_token";
    static final String EXTRA_NOTIFICATION_ID = "remindue_notification_id";

    // 네이티브 빌드는 Vite 환경변수 주입이 없어 .env.production의 VITE_API_BASE_URL과 동일한
    // 값을 그대로 상수로 둔다 — 그 값이 바뀌면 여기도 같이 바꿔야 한다.
    private static final String API_BASE_URL = "https://remindue.ionjk2879.workers.dev/api";

    private static final ExecutorService EXECUTOR = Executors.newCachedThreadPool();

    @Override
    public void onReceive(Context context, Intent intent) {
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1);
        if (notificationId != -1) {
            NotificationManagerCompat.from(context).cancel(notificationId);
        }

        String action = intent.getStringExtra(EXTRA_ACTION);
        String token = intent.getStringExtra(EXTRA_TOKEN);
        String path = endpointFor(action);
        if (path == null || token == null) return;

        // BroadcastReceiver#onReceive는 빨리 반환해야 하므로 goAsync()로 시스템에 짧은 유예를
        // 요청하고, 실제 네트워크 호출은 별도 스레드에서 수행한 뒤 finish()로 알려준다.
        PendingResult pendingResult = goAsync();
        EXECUTOR.execute(() -> {
            try {
                postJson(API_BASE_URL + path, "{\"token\":\"" + escapeJson(token) + "\"}");
            } catch (Exception ignored) {
                // sw.ts의 fetch(...).catch(() => {})와 동일하게 실패는 조용히 무시한다 — 사용자는
                // 이미 알림을 닫았고, 서버가 실제로 못 받았다면 다음 크론에서 다시 알림이 간다.
            } finally {
                pendingResult.finish();
            }
        });
    }

    private static String endpointFor(String action) {
        if (action == null) return null;
        switch (action) {
            case "later": return null; // 알림만 닫는다(위에서 이미 처리)
            case "confirm": return "/push/confirm-action";
            case "deadline_disable": return "/push/disable-deadline-notifications";
            case "arrival_all_received": return "/push/arrival-batch/all-received";
            case "arrival_not_yet": return "/push/arrival-batch/snooze";
            case "recurring_all_maintain": return "/push/recurring-batch/all-maintain";
            case "recurring_all_discontinue": return "/push/recurring-batch/all-discontinue";
            default: return null;
        }
    }

    private static String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static void postJson(String urlString, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setConnectTimeout(5_000);
            connection.setReadTimeout(5_000);
            connection.setDoOutput(true);
            try (OutputStream os = connection.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
            connection.getResponseCode();
        } finally {
            connection.disconnect();
        }
    }
}
