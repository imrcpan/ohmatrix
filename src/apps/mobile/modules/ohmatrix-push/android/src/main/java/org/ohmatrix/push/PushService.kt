package org.ohmatrix.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * A push from the gateway names a room and an event (format event_id_only) and, from the pusher's default payload, the account. With
 * the app not running, this reads the event itself (PushFetch.kt) and shows the notification. A message that is not such a push goes
 * on to expo-notifications, whose service this extends.
 */
class PushService : ExpoFirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        val roomId = data["room_id"]
        val eventId = data["event_id"]
        if (roomId == null || eventId == null) return super.onMessageReceived(remoteMessage)
        val state = PushStore.read(this) ?: return
        if (!state.enabled) return
        val account = state.accounts.firstOrNull { it.userId == data["user_id"] } ?: state.accounts.singleOrNull() ?: return
        if (PushModule.running) {
            // The app's own engine is alive in this process: it syncs and raises the notifications itself (a second client here would use
            // its database at the same time), and in the foreground the user is looking at it. In the background the sync may be asleep, so
            // the push says that a message came; the app's own notification for the chat, when it comes, takes the place of this one.
            if (!inForeground(this)) show(this, state, account.userId, roomId, Fetched.Unknown)
            return
        }
        val result = fetchNotification(account, roomId, eventId, FETCH_TIMEOUT_MS)
        show(this, state, account.userId, roomId, result)
    }

    private companion object {
        /** A service has about twenty seconds for a message; the SDK's short sync is given most of that. */
        const val FETCH_TIMEOUT_MS = 14_000L
    }
}

private const val TAG = "OhMatrixPush"

private fun inForeground(context: Context): Boolean {
    val info = android.app.ActivityManager.RunningAppProcessInfo()
    android.app.ActivityManager.getMyMemoryState(info)
    return info.importance <= android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
}
private const val CHANNEL = "messages" // the channel the app's own notifications use (platform.ts)

private fun zh(lang: String?) = (lang ?: java.util.Locale.getDefault().toLanguageTag()).startsWith("zh")

private fun words(lang: String?, kind: Kind): String {
    val cn = zh(lang)
    return when (kind) {
        Kind.PHOTO -> if (cn) "[图片]" else "Photo"
        Kind.VIDEO -> if (cn) "[视频]" else "Video"
        Kind.VOICE -> if (cn) "[语音]" else "Voice message"
        Kind.AUDIO -> if (cn) "[音频]" else "Audio"
        Kind.FILE -> if (cn) "[文件]" else "File"
        Kind.LOCATION -> if (cn) "[位置]" else "Location"
        else -> if (cn) "新消息" else "New message"
    }
}

private fun show(context: Context, state: PushState, userId: String, roomId: String, r: Fetched) {
    val lang = state.lang
    val (title, body) =
        when (r) {
            is Fetched.Skip -> return
            is Fetched.Unknown -> "OhMatrix" to words(lang, Kind.OTHER)
            is Fetched.Invite -> "OhMatrix" to (if (zh(lang)) "${r.sender} 邀请了你" else "${r.sender} invited you")
            is Fetched.Message -> {
                // The setting "FCM message content" off: only that a message came, and where from.
                val what = if (state.content) (r.text ?: words(lang, r.kind)) else words(lang, Kind.OTHER)
                r.room.let { if (r.direct) r.sender else it } to (if (r.direct || !state.content) what else "${r.sender}: $what")
            }
        }
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Messages", NotificationManager.IMPORTANCE_HIGH))
    }
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val tap = launch?.let { PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
    val icon = context.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
    val n =
        NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .apply { if (tap != null) setContentIntent(tap) }
            .build()
    try {
        // The same tag and id the app's own notifications use (one per chat and account), so the app replaces this one when it runs.
        NotificationManagerCompat.from(context).notify("$userId$roomId", 0, n)
    } catch (e: SecurityException) {
        Log.w(TAG, "no permission to notify", e) // Android 13+: the user has not allowed notifications
    }
}
