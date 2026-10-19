package org.ohmatrix.appicon

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The launcher icon of the app is the one of the activity alias that is enabled (see plugins/withAppIcons.js). The list of ids and
 * aliases is in the manifest, as meta-data "id=alias,id=alias": the plugin writes it, this reads it, and nothing is written twice.
 */
class AppIconModule : Module() {
  private val context get() = appContext.reactContext ?: throw CodedException("the app is not ready")

  /** (id, the alias's class name) in the order of the list. */
  private fun icons(): List<Pair<String, String>> {
    val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
    val raw = info.metaData?.getString(META_KEY) ?: throw CodedException("the app has no list of icons")
    return raw.split(",").filter { it.contains("=") }.map { it.substringBefore("=") to it.substringAfter("=") }
  }

  private fun component(alias: String) = ComponentName(context.packageName, "${context.packageName}.$alias")

  /**
   * The app must always have a launcher entry. A state in which every alias is disabled (the system keeps an alias's setting across
   * updates, and an alias that was disabled stays so) leaves no icon on the home screen and no way to choose one from there, so on
   * start, when the system finds no launcher entry for the app, the default alias is enabled. The question is asked the way a launcher
   * asks it (the activities that answer MAIN/LAUNCHER, which are the enabled ones), not by reading each alias's own setting: an alias
   * that was never touched has no setting of its own and takes the manifest's.
   */
  private fun ensureLauncherEntry() {
    val pm = context.packageManager
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.packageName)
    if (pm.queryIntentActivities(launcher, 0).isNotEmpty()) return
    val list = icons()
    val target = (list.firstOrNull { it.first == DEFAULT_ID } ?: list.first()).second
    pm.setComponentEnabledSetting(component(target), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
  }

  override fun definition() = ModuleDefinition {
    Name("OhMatrixAppIcon")

    OnCreate {
      try {
        ensureLauncherEntry()
      } catch (e: Exception) {
        // Not being able to check must not stop the app from starting.
      }
    }

    /** The id of the icon that is showing: the first enabled alias. */
    Function("getIcon") {
      val pm = context.packageManager
      icons().firstOrNull { (_, alias) -> pm.getComponentEnabledSetting(component(alias)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED }?.first
        ?: icons().first().first
    }

    /**
     * Show the icon `id`. The new alias is enabled before the others are disabled, so there is never a moment without a way to start the
     * app, and DONT_KILL_APP keeps the app running (a launcher may still take a few seconds to draw the new icon).
     */
    Function("setIcon") { id: String ->
      val list = icons()
      val target = list.firstOrNull { it.first == id } ?: throw CodedException("unknown icon '$id'")
      val pm = context.packageManager
      pm.setComponentEnabledSetting(component(target.second), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
      for ((other, alias) in list) {
        if (other != id) pm.setComponentEnabledSetting(component(alias), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      }
    }
  }

  private companion object {
    const val META_KEY = "org.ohmatrix.app.ICONS"
    const val DEFAULT_ID = "default"
  }
}
