package org.ohmatrix.push

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app's side of push: it hands over what the service needs (see PushStore), and says whether its own engine is running. While it
 * is, the engine syncs and raises the notifications itself, and the service stays out (two clients must not use one database).
 */
class PushModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("OhMatrixPush")

        OnCreate { running = true }
        OnDestroy { running = false }

        /** The json of PushStore; empty removes it. */
        Function("setState") { json: String ->
            val context = appContext.reactContext ?: throw CodedException("the app is not ready")
            PushStore.write(context, json)
        }
    }

    companion object {
        /** True while the app's JavaScript (and so its Matrix engine) is alive in this process. */
        @Volatile
        var running = false
    }
}
