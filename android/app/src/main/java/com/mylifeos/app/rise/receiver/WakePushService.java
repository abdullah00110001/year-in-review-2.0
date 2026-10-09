package com.mylifeos.app.rise.receiver;

import android.util.Log;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.mylifeos.app.rise.scheduler.RiseAlarmScheduler;

import java.util.Map;

/**
 * Receives FCM pushes natively — even when the app is closed/killed.
 *
 * When a group member sends a wake-up call the server sends a DATA-ONLY,
 * high-priority message with type=WAKE_UP_CALL. We immediately schedule a real
 * Rise alarm 2 seconds out through the normal alarm engine, so the phone rings
 * exactly like a regular alarm (full screen, loud, mission).
 *
 * Extends Capacitor's MessagingService so JS listeners and token refresh keep
 * working (super is always called). Capacitor's own service is removed from
 * the merged manifest so only this one receives MESSAGING_EVENT.
 */
public class WakePushService extends MessagingService {

    private static final String TAG = "WakePushService";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        try {
            Map<String, String> d = msg.getData();
            String type = d.get("type");
            if ("WAKE_UP_CALL".equals(type) || "wakeup".equals(type)) {
                String title = d.containsKey("title") ? d.get("title") : "⏰ Wake Up Call!";
                String body  = d.containsKey("body")  ? d.get("body")  : "Someone is calling you to wake up";
                long now = System.currentTimeMillis();
                String uuid = "wakeup-" + now;
                int id = (int) (now % 1_000_000_000L);
                boolean ok = RiseAlarmScheduler.scheduleAlarm(
                        getApplicationContext(), id, now + 2000, title, body, uuid, true, null, -1);
                Log.d(TAG, "Wake-up call alarm scheduled=" + ok);
            }
        } catch (Exception e) {
            Log.e(TAG, "wake push handling failed", e);
        }
        super.onMessageReceived(msg);
    }
}
