package org.ohmatrix.push

import android.util.Log
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.matrix.rustcomponents.sdk.ClientBuilder
import org.matrix.rustcomponents.sdk.CrossProcessLockConfig
import org.matrix.rustcomponents.sdk.MessageLikeEventContent
import org.matrix.rustcomponents.sdk.MessageType
import org.matrix.rustcomponents.sdk.NotificationEvent
import org.matrix.rustcomponents.sdk.NotificationProcessSetup
import org.matrix.rustcomponents.sdk.NotificationStatus
import org.matrix.rustcomponents.sdk.Session
import org.matrix.rustcomponents.sdk.SlidingSyncVersion
import org.matrix.rustcomponents.sdk.SlidingSyncVersionBuilder
import org.matrix.rustcomponents.sdk.SqliteStoreBuilder
import org.matrix.rustcomponents.sdk.TimelineEventContent

/** One signed-in account as the app hands it over (see PushStore): what is needed to open its database and restore its session. */
data class PushAccount(
    val userId: String,
    val homeserver: String,
    val deviceId: String,
    val accessToken: String,
    val refreshToken: String?,
    val slidingSyncNative: Boolean,
    val dataDir: String,
    val cacheDir: String,
    /** The 32-byte key of the stores, as 64 hex digits. */
    val key: String,
)

enum class Kind { TEXT, PHOTO, VIDEO, VOICE, AUDIO, FILE, LOCATION, OTHER }

/** What the SDK found for a push. */
sealed class Fetched {
    /** Nothing to show: the account's push rules say no, the message was redacted, or it is the account's own. */
    object Skip : Fetched()

    /** It could not be read (no network, the event is not there, it cannot be decrypted): the plain "new message" is shown. */
    object Unknown : Fetched()

    data class Message(val room: String, val sender: String, val direct: Boolean, val kind: Kind, val text: String?) : Fetched()

    data class Invite(val sender: String) : Fetched()
}

private const val TAG = "OhMatrixPush"

/**
 * Asks the Matrix SDK for the event a push named: opens the account's database with its own client, restores the session, and
 * uses the notification client (a short sliding sync, or a /context request), which also decrypts. The client is closed again
 * before this returns. Only for a process in which the app's own engine is not running: two clients must not use one database.
 */
fun fetchNotification(a: PushAccount, roomId: String, eventId: String, timeoutMs: Long): Fetched =
    try {
        runBlocking { withTimeoutOrNull(timeoutMs) { fetch(a, roomId, eventId) } ?: Fetched.Unknown }
    } catch (e: Throwable) {
        Log.w(TAG, "could not read the notification", e)
        Fetched.Unknown
    }

private suspend fun fetch(a: PushAccount, roomId: String, eventId: String): Fetched {
    val sliding = if (a.slidingSyncNative) SlidingSyncVersion.NATIVE else SlidingSyncVersion.NONE
    val client =
        ClientBuilder()
            .homeserverUrl(a.homeserver)
            .sqliteStore(SqliteStoreBuilder(a.dataDir, a.cacheDir).key(a.key.chunked(2).map { it.toInt(16).toByte() }.toByteArray()))
            // The multi-process lock needs session delegates, which are not set up here (nor in the app): the service opens the database
            // only when the app is not running, so there is no other process to take turns with.
            .crossProcessLockConfig(CrossProcessLockConfig.SingleProcess)
            // A refreshed token would only be known here, not to the app: the app does the refreshing.
            .disableAutomaticTokenRefresh()
            .slidingSyncVersionBuilder(if (a.slidingSyncNative) SlidingSyncVersionBuilder.NATIVE else SlidingSyncVersionBuilder.NONE)
            .build()
    try {
        client.restoreSession(
            Session(
                accessToken = a.accessToken,
                refreshToken = a.refreshToken,
                userId = a.userId,
                deviceId = a.deviceId,
                homeserverUrl = a.homeserver,
                oauthData = null,
                slidingSyncVersion = sliding,
            ),
        )
        val notifications = client.notificationClient(NotificationProcessSetup.MultipleProcesses)
        try {
            return read(a.userId, notifications.getNotification(roomId, eventId))
        } finally {
            notifications.close()
        }
    } finally {
        client.close()
    }
}

private fun read(me: String, status: NotificationStatus): Fetched =
    when (status) {
        is NotificationStatus.Event -> {
            val item = status.item
            when (val event = item.event) {
                is NotificationEvent.Invite -> Fetched.Invite(item.senderInfo.displayName ?: event.sender)
                is NotificationEvent.Timeline -> {
                    val e = event.event
                    val sender = e.senderId()
                    if (sender == me) {
                        Fetched.Skip
                    } else {
                        val name = item.senderInfo.displayName ?: sender.removePrefix("@").substringBefore(":")
                        val (kind, text) = describe(e.content())
                        Fetched.Message(item.roomInfo.displayName, name, item.roomInfo.isDirect, kind, text)
                    }
                }
            }
        }
        is NotificationStatus.EventNotFound -> Fetched.Unknown
        is NotificationStatus.EventFilteredOut -> Fetched.Skip
        is NotificationStatus.EventRedacted -> Fetched.Skip
    }

private fun describe(content: TimelineEventContent): Pair<Kind, String?> {
    val like = (content as? TimelineEventContent.MessageLike)?.content as? MessageLikeEventContent.RoomMessage ?: return Kind.OTHER to null
    return when (val m = like.messageType) {
        is MessageType.Text -> Kind.TEXT to m.content.body
        is MessageType.Notice -> Kind.TEXT to m.content.body
        is MessageType.Emote -> Kind.TEXT to m.content.body
        is MessageType.Image -> Kind.PHOTO to null
        is MessageType.Video -> Kind.VIDEO to null
        is MessageType.Audio -> (if (m.content.voice != null) Kind.VOICE else Kind.AUDIO) to null
        is MessageType.File -> Kind.FILE to null
        is MessageType.Location -> Kind.LOCATION to null
        else -> Kind.OTHER to null
    }
}
