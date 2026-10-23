package org.ohmatrix.callaudio

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The phone's audio for a call. WebRTC plays the other side's sound and records the microphone, but it leaves the phone's audio mode to the
 * app: without the call mode the sound comes out of the speaker at media volume, the volume keys change the wrong volume, and echo
 * cancellation does not know it is in a call. This sets the mode while a call is on and puts back what it found when the call is over.
 *
 * `start(speaker)` begins it, `setSpeaker(on)` switches between the loudspeaker and the earpiece (a headset, wired or Bluetooth, is used
 * whenever one is connected and the speaker is not asked for), `stop()` ends it. Calling `start` again while it is on only changes the route.
 */
class CallAudioModule : Module() {
  private val context get() = appContext.reactContext ?: throw CodedException("the app is not ready")
  private val audio get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  /** What the phone's audio was before the call: put back at the end. */
  private var savedMode: Int? = null
  private var savedSpeaker: Boolean? = null

  private fun headset(): AudioDeviceInfo? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null
    val wanted = setOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    )
    return audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.type in wanted }
  }

  @Suppress("DEPRECATION")
  private fun route(speaker: Boolean) {
    val am = audio
    val head = if (speaker) null else headset()
    if (head != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // A headset takes the call: the system routes it there when the communication device is set to it.
      am.setCommunicationDevice(head)
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (speaker) {
        am.availableCommunicationDevices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }?.let { am.setCommunicationDevice(it) }
      } else {
        am.clearCommunicationDevice()
      }
    } else {
      am.isSpeakerphoneOn = speaker
    }
  }

  @Suppress("DEPRECATION")
  override fun definition() = ModuleDefinition {
    Name("OhMatrixCallAudio")

    Function("start") { speaker: Boolean ->
      val am = audio
      if (savedMode == null) {
        savedMode = am.mode
        savedSpeaker = am.isSpeakerphoneOn
        am.mode = AudioManager.MODE_IN_COMMUNICATION
      }
      route(speaker)
    }

    Function("setSpeaker") { on: Boolean -> route(on) }

    Function("stop") {
      val am = audio
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.clearCommunicationDevice()
      savedSpeaker?.let { am.isSpeakerphoneOn = it }
      savedMode?.let { am.mode = it }
      savedMode = null
      savedSpeaker = null
    }

    // Whether a headset is connected now, for the button that says "speaker" or "headset".
    Function("hasHeadset") { headset() != null }

    OnDestroy {
      // The app is going away with a call still on: the phone's audio is not left in call mode.
      val am = audio
      savedMode?.let { am.mode = it }
      savedMode = null
    }
  }
}
