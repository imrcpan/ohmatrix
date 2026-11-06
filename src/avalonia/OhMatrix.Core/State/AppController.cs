using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The controller of one account: it changes the <see cref="Store"/> and talks to the engine (<c>AppController</c> of the TypeScript state).</summary>
public sealed class AppController(
    IAuthEngine engine,
    ISessionStore sessions,
    IPreferencesStore? preferences = null,
    TimeProvider? clock = null,
    IRoomsEngine? rooms = null
) {
    /// <summary>How long a zoom is tried before it goes back by itself.</summary>
    public static readonly TimeSpan ZoomTrialTime = TimeSpan.FromSeconds(15);

    private readonly TimeProvider time = clock ?? TimeProvider.System;
    private ITimer? zoomTimer;

    // The engine tells of changes from its own threads; the store is changed on the thread the controller was made on (the UI thread).
    private readonly SynchronizationContext? context = SynchronizationContext.Current;
    private bool roomsHooked;

    public Store<AppState> Store { get; } = new(new AppState());

    /// <summary>Restores the saved session, if there is one. Called once at the start.</summary>
    public async Task Bootstrap()
    {
        try {
            if (preferences is not null) {
                var saved = await Quietly(preferences.Load);
                if (saved is not null)
                    Store.Update(s => s with {
                        Prefs = saved
                    });
            }

            var session = await sessions.Load();
            if (session is null) {
                SignedOut();
                return;
            }

            await engine.Restore(session);
            Store.Update(s => s with {
                Auth = AuthStatus.SignedIn,
                UserId = session.UserId,
                Homeserver = session.Homeserver,
            });
            StartRooms();
        } catch (Exception e) {
            var code = (e as EngineException)?.Code;
            // A session the server no longer takes, or whose keys are gone, is not kept.
            if (code is EngineErrorCode.Unauthorized or EngineErrorCode.KeysLost)
                await sessions.Clear();
            SignedOut(code == EngineErrorCode.Unauthorized ? null : e.Message, code);
        }
    }

    public Task Login(string homeserver, string username, string password)
    {
        return SignIn(homeserver, () => engine.LoginWithPassword(homeserver, username, password));
    }

    /// <summary>Creates an account on the server and signs in as it (see <see cref="IAuthEngine.Register"/>).</summary>
    public Task Register(string homeserver, string username, string password, string? token = null)
    {
        return SignIn(homeserver, () => engine.Register(homeserver, username, password, token));
    }

    public async Task Logout()
    {
        try {
            if (rooms is not null)
                await Quietly(rooms.StopSync);
            await engine.Logout();
        } finally {
            await sessions.Clear();
            SignedOut();
        }
    }

    /// <summary>Opens a chat, or closes the open one with null.</summary>
    public void SelectRoom(string? roomId)
    {
        Store.Update(s => s with {
            SelectedRoomId = roomId
        });
    }

    /// <summary>Changes the preferences and keeps them.</summary>
    public void SetPreferences(Func<Preferences, Preferences> change)
    {
        Store.Update(s => s with {
            Prefs = change(s.Prefs)
        });
        SavePreferences();
    }

    /// <summary>
    /// Draws the interface at <paramref name="scale"/> without keeping it: it goes back by itself after <see cref="ZoomTrialTime"/> unless
    /// <see cref="KeepZoom"/> is called. The size already kept ends any trial.
    /// </summary>
    public void TryZoom(double scale)
    {
        var from = Store.Value.Prefs.UiScale;
        StopZoomTimer();
        if (scale == from) {
            Store.Update(s => s with {
                ZoomTrial = null
            });
            return;
        }

        var until = time.GetUtcNow() + ZoomTrialTime;
        Store.Update(s => s with {
            ZoomTrial = new ZoomTrial(from, scale, until)
        });
        zoomTimer = time.CreateTimer(
            _ => Store.Update(s => s with {
                ZoomTrial = null
            }),
            null,
            ZoomTrialTime,
            Timeout.InfiniteTimeSpan
        );
    }

    /// <summary>Keeps the size being tried: it is saved as the preference.</summary>
    public void KeepZoom()
    {
        var trial = Store.Value.ZoomTrial;
        if (trial is null)
            return;
        StopZoomTimer();
        Store.Update(s => s with {
            ZoomTrial = null
        });
        SetPreferences(p => p with {
            UiScale = trial.To
        });
    }

    /// <summary>Goes back to the size that was kept.</summary>
    public void RevertZoom()
    {
        StopZoomTimer();
        Store.Update(s => s with {
            ZoomTrial = null
        });
    }

    private void StopZoomTimer()
    {
        zoomTimer?.Dispose();
        zoomTimer = null;
    }

    // Signing in and registering end the same way: keep the session, remember the server.
    private async Task SignIn(string homeserver, Func<Task<Session>> start)
    {
        Store.Update(s => s with {
            Auth = AuthStatus.SigningIn,
            AuthError = null,
            AuthErrorCode = null,
        });
        try {
            var session = await start();
            await sessions.Save(session);
            Store.Update(s => s with {
                Auth = AuthStatus.SignedIn,
                UserId = session.UserId,
                Homeserver = session.Homeserver,
            });
            StartRooms();
            // Offered again the next time the sign-in screen is shown (after signing out, or on another account).
            var typed = homeserver.Trim();
            if (Store.Value.Prefs.LastHomeserver != typed) {
                Store.Update(s => s with {
                    Prefs = s.Prefs with {
                        LastHomeserver = typed
                    }
                });
                SavePreferences();
            }
        } catch (Exception e) {
            SignedOut(e.Message, (e as EngineException)?.Code);
        }
    }

    private void StartRooms()
    {
        if (rooms is null)
            return;
        if (!roomsHooked) {
            roomsHooked = true;
            rooms.RoomsChanged += list => Post(() => Store.Update(s => s with {
                Rooms = Order(list)
            }));
            rooms.SyncChanged += state => Post(() => Store.Update(s => s with {
                SyncState = state
            }));
        }

        _ = Quietly(rooms.StartSync);
    }

    private void Post(Action change)
    {
        if (context is null)
            change();
        else
            context.Post(_ => change(), null);
    }

    /// <summary>Pinned chats first, then the latest activity first.</summary>
    public static IReadOnlyList<RoomSummary> Order(IEnumerable<RoomSummary> list)
    {
        return list.OrderByDescending(r => r.Pinned).ThenByDescending(r => r.LastActivityTs)
            .ToList();
    }

    private void SignedOut(string? error = null, EngineErrorCode? code = null)
    {
        Store.Update(s => s with {
            Rooms = [],
            SyncState = SyncState.Stopped,
            SelectedRoomId = null,
            Auth = AuthStatus.SignedOut,
            AuthError = error,
            AuthErrorCode = code,
            UserId = null,
            Homeserver = null,
        });
    }

    // A preference that cannot be saved is not worth stopping for: it is what the person has set until the app is closed.
    private void SavePreferences()
    {
        if (preferences is null)
            return;
        var now = Store.Value.Prefs;
        _ = Quietly(() => preferences.Save(now));
    }

    private static async Task<T?> Quietly<T>(Func<Task<T>> run)
    {
        try {
            return await run();
        } catch {
            return default;
        }
    }

    private static async Task<bool> Quietly(Func<Task> run)
    {
        try {
            await run();
            return true;
        } catch {
            return false;
        }
    }
}
