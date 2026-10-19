# The Matrix SDK's Kotlin bindings find their parts by name and call the native library through JNA.
-keep class com.sun.jna.** { *; }
-keepclassmembers class * extends com.sun.jna.* { public *; }
-keep class org.matrix.rustcomponents.sdk.** { *; }
-keep class uniffi.** { *; }
-dontwarn java.awt.**
