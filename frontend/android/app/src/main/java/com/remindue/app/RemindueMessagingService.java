package com.remindue.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 워커(workers/src/lib/fcm.ts)가 data-only 메시지로 보내는 이유: 알림에 "유지하기" 같은 액션
 * 버튼을 붙이려면(sw.ts의 Web Push와 동등하게) 우리가 직접 NotificationCompat으로 그려야
 * 하는데, FCM 메시지에 최상위 "notification" 필드가 있으면 앱이 백그라운드/종료 상태일 때
 * Play Services가 onMessageReceived 호출 전에 알림을 자체적으로 그려버려 버튼을 붙일 기회가
 * 없다. data-only로 보내면 앱 상태와 무관하게 항상 이 서비스가 호출된다.
 *
 * AndroidManifest.xml에서 @capacitor/push-notifications가 기본 제공하는 MessagingService를
 * tools:node="remove"로 지우고 이 클래스로 교체했다 — FCM은 앱당 MessagingService 하나만
 * 허용한다. onNewToken은 원래 서비스와 동일하게 플러그인으로 그대로 전달해 기존 토큰
 * 등록 흐름(frontend/src/lib/native.ts registerNativePush)을 그대로 유지한다.
 */
public class RemindueMessagingService extends FirebaseMessagingService {

    private static final String CHANNEL_ID = "remindue_default";

    // PushActionReceiver.java와 동일한 값 — 네이티브 빌드는 Vite 환경변수 주입이 없다.
    private static final String API_BASE_URL = "https://remindue.ionjk2879.workers.dev/api";
    private static final ExecutorService EXECUTOR = Executors.newCachedThreadPool();

    // 서비스워커(frontend/src/sw.ts)의 notificationclick과 동일한 목록 — 여기 있는 액션은
    // 앱을 열지 않고 PushActionReceiver가 곧바로 서버에 확인 처리를 요청한다. 그 외
    // (예: "일부 유지")는 앱을 열어 대시보드의 후속 모달로 넘어간다
    // (frontend/src/features/dashboard/DashboardConfirmationModals.tsx).
    private static final Set<String> BACKGROUND_ACTIONS = new HashSet<>(Arrays.asList(
        "later", "confirm", "deadline_disable", "arrival_all_received", "arrival_not_yet",
        "recurring_all_maintain", "recurring_all_discontinue"
    ));

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String title = data.get("title");
        String body = data.get("body");
        if (title == null && body == null) return;

        try {
            showRichNotification(remoteMessage, data, title, body);
        } catch (Exception e) {
            // 커스텀 알림(버튼 등) 구성 중 어디선가 실패해도 알림 자체는 뜨게 한다 — 버튼 없는
            // 기본 알림이라도 뜨는 게 "알림이 아예 안 온다"보다 낫다.
            reportClientError("showRichNotification failed: " + e);
            showFallbackNotification(title, body);
        }
    }

    private void showRichNotification(RemoteMessage remoteMessage, Map<String, String> data, String title, String body) {
        ensureChannel();

        int notificationId = (int) System.nanoTime();
        // PushNotificationsPlugin#handleOnNewIntent는 "google.message_id" 키의 존재로 앱이
        // 알림을 통해 열렸는지 판단한다 — FCM이 알림을 직접 그렸을 때 자동으로 채워주는 값을
        // 우리가 만든 Intent에도 그대로 심어서 같은 경로(JS의 pushNotificationActionPerformed)를
        // 그대로 재사용한다(frontend/src/lib/native.ts).
        String messageId = remoteMessage.getMessageId() != null ? remoteMessage.getMessageId() : UUID.randomUUID().toString();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : ""))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(buildOpenAppPendingIntent(data, messageId, notificationId, "content"));

        Integer color = colorFor(data.get("notificationKind"));
        if (color != null) builder.setColor(color);

        for (NotificationCompat.Action action : buildActions(data, messageId, notificationId)) {
            builder.addAction(action);
        }

        NotificationManagerCompat.from(this).notify(notificationId, builder.build());
    }

    private void showFallbackNotification(String title, String body) {
        try {
            ensureChannel();
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this, (int) System.nanoTime(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(title != null ? title : "Remindue")
                .setContentText(body != null ? body : "")
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);
            NotificationManagerCompat.from(this).notify((int) System.nanoTime(), builder.build());
        } catch (Exception e) {
            reportClientError("showFallbackNotification also failed: " + e);
        }
    }

    /**
     * showRichNotification이 실패했을 때만 서버로 보고한다 — 기기에 adb로 붙지 않아도
     * wrangler tail로 원인을 확인할 수 있다. 정상 동작 시에는 호출되지 않는다.
     */
    private void reportClientError(String message) {
        EXECUTOR.execute(() -> {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(API_BASE_URL + "/push/client-error").openConnection();
                try {
                    connection.setRequestMethod("POST");
                    connection.setRequestProperty("Content-Type", "application/json");
                    connection.setConnectTimeout(3_000);
                    connection.setReadTimeout(3_000);
                    connection.setDoOutput(true);
                    JSONObject body = new JSONObject();
                    body.put("message", message);
                    try (OutputStream os = connection.getOutputStream()) {
                        os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                    }
                    connection.getResponseCode();
                } finally {
                    connection.disconnect();
                }
            } catch (Exception ignored) {
            }
        });
    }

    // 대시보드의 유형 배지 팔레트(frontend/src/styles.css --type-*)와 맞춘다 — 예전에
    // workers/src/lib/fcm.ts에 있던 것과 동일한 매핑을 그대로 옮겼다(이제 payload로는 안
    // 보내고 kind만 보내 여기서 색을 결정한다).
    private static Integer colorFor(String kind) {
        if (kind == null) return null;
        switch (kind) {
            case "DEADLINE": return Color.parseColor("#6A7BA8");
            case "RENEWAL": return Color.parseColor("#C47B6A");
            case "ARRIVAL": return Color.parseColor("#8A9B6A");
            case "WEEKLY_SUMMARY": return Color.parseColor("#7B6FA3");
            default: return null;
        }
    }

    private NotificationCompat.Action[] buildActions(Map<String, String> data, String messageId, int notificationId) {
        String actionsJson = data.get("actions");
        if (actionsJson == null || actionsJson.isEmpty()) return new NotificationCompat.Action[0];

        try {
            JSONArray parsed = new JSONArray(actionsJson);
            NotificationCompat.Action[] actions = new NotificationCompat.Action[parsed.length()];
            for (int i = 0; i < parsed.length(); i++) {
                JSONObject entry = parsed.getJSONObject(i);
                String actionId = entry.getString("action");
                String actionTitle = entry.getString("title");
                PendingIntent pendingIntent = BACKGROUND_ACTIONS.contains(actionId)
                    ? buildBackgroundActionPendingIntent(actionId, data.get("actionToken"), notificationId, i)
                    : buildOpenAppPendingIntent(data, messageId, notificationId, "action_" + i);
                actions[i] = new NotificationCompat.Action.Builder(R.drawable.ic_stat_notify, actionTitle, pendingIntent).build();
            }
            return actions;
        } catch (JSONException e) {
            return new NotificationCompat.Action[0];
        }
    }

    private PendingIntent buildOpenAppPendingIntent(Map<String, String> data, String messageId, int notificationId, String slot) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("google.message_id", messageId);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }
        // PendingIntent는 extras가 아니라 (requestCode + Intent 시그니처)로 동일성을 판단한다 —
        // 알림 하나에 여러 PendingIntent(본문 탭 + 버튼별)를 같은 컴포넌트로 만들 때 requestCode를
        // 다르게 주지 않으면 나중에 만든 것의 extras가 앞의 것도 덮어써 전부 같은 화면이 열린다.
        int requestCode = (notificationId * 31) + slot.hashCode();
        return PendingIntent.getActivity(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent buildBackgroundActionPendingIntent(String actionId, String actionToken, int notificationId, int index) {
        Intent intent = new Intent(this, PushActionReceiver.class);
        intent.putExtra(PushActionReceiver.EXTRA_ACTION, actionId);
        intent.putExtra(PushActionReceiver.EXTRA_TOKEN, actionToken);
        intent.putExtra(PushActionReceiver.EXTRA_NOTIFICATION_ID, notificationId);
        int requestCode = (notificationId * 31) + index + 1;
        return PendingIntent.getBroadcast(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Remindue 알림", NotificationManager.IMPORTANCE_DEFAULT));
    }
}
