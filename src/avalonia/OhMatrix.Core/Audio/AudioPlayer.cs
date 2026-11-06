namespace OhMatrix.Core.Audio;

public enum PlayState {
    Idle,
    Playing,
    Paused,
    Ended,
    Error,
}

/// <summary>
/// Plays one audio file (<c>useAudioPlayer</c> of the React Native app): play, pause, seek, and where it is. Only one plays at a time: starting
/// a clip pauses the one that was playing.
/// </summary>
public sealed class AudioPlayer : IDisposable {
    private static AudioPlayer? active;
    private IntPtr player;
    private bool opened;

    /// <summary>The system has a library to play with.</summary>
    public static bool Available => LibVlc.Available;

    public string Path { get; }

    public AudioPlayer(string path)
    {
        Path = path;
    }

    public PlayState State {
        get {
            if (player == IntPtr.Zero)
                return PlayState.Idle;
            return LibVlc.libvlc_media_player_get_state(player) switch {
                LibVlc.Playing => PlayState.Playing,
                LibVlc.Paused => PlayState.Paused,
                LibVlc.Ended => PlayState.Ended,
                LibVlc.Error => PlayState.Error,
                // Opening, buffering and the rest count as playing once started.
                _ => opened ? PlayState.Playing : PlayState.Idle,
            };
        }
    }

    public long PositionMs => player == IntPtr.Zero
        ? 0
        : Math.Max(0, LibVlc.libvlc_media_player_get_time(player));

    /// <summary>The length of the file; 0 until the library has read it.</summary>
    public long DurationMs => player == IntPtr.Zero
        ? 0
        : Math.Max(0, LibVlc.libvlc_media_player_get_length(player));

    /// <summary>Starts, or goes on from where it paused, or starts again when it had ended.</summary>
    public bool Play()
    {
        if (!Available)
            return false;
        if (active is { } other && !ReferenceEquals(other, this))
            other.Pause();
        active = this;
        if (player != IntPtr.Zero && State == PlayState.Ended) {
            LibVlc.libvlc_media_player_stop(player);
            opened = false;
        }

        if (player == IntPtr.Zero) {
            var media = LibVlc.libvlc_media_new_path(LibVlc.Instance(), LibVlc.Utf8(Path));
            if (media == IntPtr.Zero)
                return false;
            player = LibVlc.libvlc_media_player_new_from_media(media);
            LibVlc.libvlc_media_release(media);
            if (player == IntPtr.Zero)
                return false;
        }

        if (!opened) {
            opened = true;
            return LibVlc.libvlc_media_player_play(player) == 0;
        }

        LibVlc.libvlc_media_player_set_pause(player, 0);
        return true;
    }

    public void Pause()
    {
        if (player != IntPtr.Zero && State == PlayState.Playing)
            LibVlc.libvlc_media_player_set_pause(player, 1);
    }

    public void Seek(long ms)
    {
        if (player != IntPtr.Zero)
            LibVlc.libvlc_media_player_set_time(player, Math.Max(0, ms));
    }

    public void Dispose()
    {
        if (ReferenceEquals(active, this))
            active = null;
        if (player == IntPtr.Zero)
            return;
        LibVlc.libvlc_media_player_stop(player);
        LibVlc.libvlc_media_player_release(player);
        player = IntPtr.Zero;
    }
}
