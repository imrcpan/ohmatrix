package org.ohmatrix.share

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.IntentCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * What other apps share to this one, through the system's share sheet (the intent filters are put on MainActivity by plugins/withShareTarget.js).
 *
 * A share that arrives while the app is running comes as a new intent: it is kept, and JavaScript is told (`onShare`). One that starts the app is
 * the activity's own intent. `take()` gives whichever there is, once: the text, and the files, each copied into the app's cache (the address a
 * sharing app gives is only good while its activity is alive, and for the app that is given it), so that the rest of the app reads it as it would
 * a file it had picked itself.
 */
class ShareModule : Module() {
  private val context get() = appContext.reactContext ?: throw CodedException("the app is not ready")

  /** A share that has come as a new intent and has not been taken. */
  @Volatile
  private var pending: Intent? = null

  /**
   * A share. One that the system hands back when the app is opened from the recent apps (after it was closed, the activity gets the intent that
   * started it first) is not a new one: the person has seen it already.
   */
  private fun isShare(intent: Intent?) =
    intent != null &&
      (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) &&
      (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0

  override fun definition() = ModuleDefinition {
    Name("OhMatrixShare")

    Events("onShare")

    OnNewIntent { intent ->
      if (isShare(intent)) {
        // A copy, so that what the activity does with its own is not ours to undo; the permission to read what is shared goes with the activity.
        pending = Intent(intent)
        sendEvent("onShare", mapOf<String, Any?>())
      }
    }

    // The activity is attached to the app only once it is resumed, which can be after JavaScript has started and asked (`take` then finds no
    // activity): the share that started the app is announced again here, and `take` finds it on the activity's intent.
    OnActivityEntersForeground {
      if (isShare(appContext.currentActivity?.intent)) sendEvent("onShare", mapOf<String, Any?>())
    }

    /**
     * The share that has come and has not been taken. `ready` says whether the answer can be trusted: while the app starts there is no activity
     * yet, and a share that started it cannot be seen, so JavaScript asks again until there is one.
     */
    AsyncFunction("take") {
      val activity = appContext.currentActivity
      val intent = pending ?: activity?.intent?.takeIf { isShare(it) } ?: return@AsyncFunction mapOf<String, Any?>("ready" to (activity != null))
      pending = null
      // Taken: the activity's own intent is not offered again.
      if (isShare(activity?.intent)) activity?.intent = Intent(Intent.ACTION_MAIN)
      read(intent)
    }

    /** Copies what `take` described (the addresses, and the names to give the copies); null for a file that could not be read. */
    AsyncFunction("copy") { uris: List<String>, names: List<String> -> copyAll(uris, names) }
  }

  private fun read(intent: Intent): Map<String, Any?> {
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    val uris = LinkedHashSet<Uri>()
    if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
      IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { uris.addAll(it) }
    } else {
      IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { uris.add(it) }
    }
    // Some apps give the files only as the intent's clip.
    val clip = intent.clipData
    if (uris.isEmpty() && clip != null) for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) }

    val type = intent.type
    return mapOf("ready" to true, "text" to text, "files" to uris.map { describe(it, type) })
  }

  /** A file of a share as the sharing app gave it (a `content://` address, readable while the app runs): its name, type and size, as far as the app knows. */
  private fun describe(uri: Uri, intentType: String?): Map<String, Any?> {
    val resolver = context.contentResolver
    var name: String? = null
    var size = 0L
    if (uri.scheme == "content") {
      try {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
          if (c.moveToFirst()) {
            if (!c.isNull(0)) name = c.getString(0)
            if (!c.isNull(1)) size = c.getLong(1)
          }
        }
      } catch (e: Exception) {
        // The name and size are only for showing; the copy will say if the file cannot be read.
      }
    }
    val fileName = (name ?: uri.lastPathSegment ?: "file").replace(Regex("[\\\\/]"), "_").ifEmpty { "file" }
    val type = (try { resolver.getType(uri) } catch (e: Exception) { null }) ?: intentType?.takeIf { it != "*/*" } ?: "application/octet-stream"
    return mapOf("uri" to uri.toString(), "name" to fileName, "mimeType" to type, "size" to size)
  }

  /** Copies the files into the app's cache under their names, one folder for the lot; each answer is the copy's `file://` address, or null if it could not be read. */
  private fun copyAll(uris: List<String>, names: List<String>): List<String?> {
    val dir = File(context.cacheDir, "share-${System.currentTimeMillis()}")
    tidy(dir.parentFile)
    val resolver = context.contentResolver
    return uris.mapIndexed { i, address ->
      try {
        dir.mkdirs()
        val fileName = names.getOrNull(i)?.ifEmpty { null } ?: "file"
        val target = File(dir, fileName).let { f -> if (f.exists()) File(dir, "${System.nanoTime()}-$fileName") else f }
        resolver.openInputStream(Uri.parse(address))?.use { input -> target.outputStream().use { input.copyTo(it) } } ?: return@mapIndexed null
        Uri.fromFile(target).toString()
      } catch (e: Exception) {
        null
      }
    }
  }

  /** What shares left in the cache more than a day ago is removed. */
  private fun tidy(cache: File?) {
    val old = System.currentTimeMillis() - 24L * 60 * 60 * 1000
    cache?.listFiles { f -> f.isDirectory && f.name.startsWith("share-") && f.lastModified() < old }?.forEach { it.deleteRecursively() }
  }
}
