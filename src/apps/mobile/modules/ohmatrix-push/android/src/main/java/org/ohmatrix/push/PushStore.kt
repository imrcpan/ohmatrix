package org.ohmatrix.push

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** What the service may do, and the accounts it may open: the app writes it (PushModule.setState), the service reads it. */
data class PushState(val enabled: Boolean, val content: Boolean, val lang: String?, val key: String, val accounts: List<PushAccount>)

/**
 * The app's copy of what a push needs: the sessions and the database key. It is in the Keystore-protected store of the app
 * already, but reading that from here would mean reading expo-secure-store's private format, so the app hands over its own copy.
 * The copy is encrypted with a Keystore key of its own (AES-GCM, never leaves the Keystore), and the app removes it when the last
 * account signs out.
 */
object PushStore {
    private const val PREFS = "ohmatrix_push"
    private const val VALUE = "state"
    private const val ALIAS = "ohmatrix_push_v1"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    /** An empty json removes the copy. */
    fun write(context: Context, json: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (json.isEmpty()) {
            prefs.edit().remove(VALUE).apply()
            return
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.iv + cipher.doFinal(json.toByteArray(Charsets.UTF_8))
        prefs.edit().putString(VALUE, Base64.encodeToString(sealed, Base64.NO_WRAP)).apply()
    }

    /** Null when there is none, or it cannot be read (the key is gone, the value is damaged). */
    fun read(context: Context): PushState? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(VALUE, null) ?: return null
        return try {
            val bytes = Base64.decode(raw, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12)) }
            val o = JSONObject(String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8))
            val list = o.getJSONArray("accounts")
            PushState(
                enabled = o.optBoolean("enabled", true),
                content = o.optBoolean("content", true),
                lang = o.optString("lang").ifEmpty { null },
                key = o.getString("key"),
                accounts =
                    (0 until list.length()).map {
                        val a = list.getJSONObject(it)
                        PushAccount(
                            userId = a.getString("userId"),
                            homeserver = a.getString("homeserver"),
                            deviceId = a.getString("deviceId"),
                            accessToken = a.getString("accessToken"),
                            refreshToken = a.optString("refreshToken").ifEmpty { null },
                            slidingSyncNative = a.optBoolean("slidingSyncNative", true),
                            dataDir = a.getString("dataDir"),
                            cacheDir = a.getString("cacheDir"),
                            key = o.getString("key"),
                        )
                    },
            )
        } catch (e: Exception) {
            null
        }
    }
}
