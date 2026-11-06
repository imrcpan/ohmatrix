using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The controller of one account: it changes the <see cref="Store"/> and talks to the engine (<c>AppController</c> of the TypeScript state).</summary>
public sealed class AppController(
    IAuthEngine engine,
    ISessionStore sessions,
    IPreferencesStore? preferences = null
) {
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
            await engine.Logout();
        } finally {
            await sessions.Clear();
            SignedOut();
        }
    }

    /// <summary>Changes the preferences and keeps them.</summary>
    public void SetPreferences(Func<Preferences, Preferences> change)
    {
        Store.Update(s => s with {
            Prefs = change(s.Prefs)
        });
        SavePreferences();
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

    private void SignedOut(string? error = null, EngineErrorCode? code = null)
    {
        Store.Update(s => s with {
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
