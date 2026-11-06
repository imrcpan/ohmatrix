using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using Xunit;

namespace OhMatrix.Tests.State;

// The cases of state.test.ts of the TypeScript state package that are about signing in and out.
public class AppControllerTests {
    private sealed class FakeEngine : IAuthEngine {
        public Func<string, string, Task<Session>>? OnRegister;
        public Func<Session, Task>? OnRestore;
        public int Logouts;

        public Task<Session> LoginWithPassword(string homeserver, string username, string password)
        {
            return Task.FromResult(Make(homeserver, username));
        }

        public Task<Session> Register(string homeserver, string username, string password,
            string? token)
        {
            return OnRegister is null
                ? Task.FromResult(Make(homeserver, username))
                : OnRegister(homeserver, username);
        }

        public Task Restore(Session session)
        {
            return OnRestore?.Invoke(session) ?? Task.CompletedTask;
        }

        public Task Logout()
        {
            Logouts++;
            return Task.CompletedTask;
        }

        private static Session Make(string homeserver, string username)
        {
            var host = homeserver.Trim();
            return new Session(host, $"@{username}:{host}", "DEVICE", "token");
        }
    }

    private sealed class MemorySessions(Session? first = null) : ISessionStore {
        public Session? Saved = first;

        public Task<Session?> Load()
        {
            return Task.FromResult(Saved);
        }

        public Task Save(Session session)
        {
            Saved = session;
            return Task.CompletedTask;
        }

        public Task Clear()
        {
            Saved = null;
            return Task.CompletedTask;
        }
    }

    private sealed class MemoryPreferences : IPreferencesStore {
        public Preferences? Saved;
        public int Saves;

        public Task<Preferences> Load()
        {
            return Task.FromResult(Saved ?? new Preferences());
        }

        public Task Save(Preferences preferences)
        {
            Saved = preferences;
            Saves++;
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task
        Bootstrap_without_a_session_is_signed_out_and_login_signs_in_and_keeps_the_session()
    {
        var sessions = new MemorySessions();
        var app = new AppController(new FakeEngine(), sessions);
        await app.Bootstrap();
        Assert.Equal(AuthStatus.SignedOut, app.Store.Value.Auth);
        await app.Login("http://localhost:8008", "test", "123456");
        Assert.Equal(AuthStatus.SignedIn, app.Store.Value.Auth);
        Assert.Equal("@test:http://localhost:8008", app.Store.Value.UserId);
        Assert.Equal("@test:http://localhost:8008", sessions.Saved!.UserId);
    }

    [Fact]
    public async Task The_server_signed_in_to_is_remembered_and_only_saved_when_it_changes()
    {
        var prefs = new MemoryPreferences();
        var app = new AppController(new FakeEngine(), new MemorySessions(), prefs);
        await app.Bootstrap();
        Assert.Null(app.Store.Value.Prefs.LastHomeserver);
        await app.Login(" chat.example.org ", "test", "123456");
        Assert.Equal("chat.example.org", app.Store.Value.Prefs.LastHomeserver);
        await app.Logout();
        // It outlives the session.
        Assert.Equal("chat.example.org", app.Store.Value.Prefs.LastHomeserver);
        await app.Register("chat.example.org", "newbie", "123456");
        Assert.Equal(AuthStatus.SignedIn, app.Store.Value.Auth);
        Assert.Equal("@newbie:chat.example.org", app.Store.Value.UserId);
        Assert.Equal(1, prefs.Saves);
        await app.Logout();
        await app.Register("other.example.org", "newbie", "123456");
        Assert.Equal("other.example.org", prefs.Saved!.LastHomeserver);
    }

    [Fact]
    public async Task A_failed_registration_stays_signed_out_with_the_reason_and_forgets_nothing()
    {
        var engine = new FakeEngine {
            OnRegister = (_, _) => throw new EngineException(
                EngineErrorCode.Forbidden, "Registration has been disabled"),
        };
        var app = new AppController(engine, new MemorySessions());
        await app.Bootstrap();
        await app.Register("closed.example.org", "x", "123456");
        var s = app.Store.Value;
        Assert.Equal(AuthStatus.SignedOut, s.Auth);
        Assert.Equal(EngineErrorCode.Forbidden, s.AuthErrorCode);
        Assert.Equal("Registration has been disabled", s.AuthError);
        Assert.Null(s.Prefs.LastHomeserver);
    }

    [Fact]
    public async Task The_sign_in_goes_through_signing_in_and_clears_the_last_error()
    {
        var seen = new List<AuthStatus>();
        var engine = new FakeEngine();
        var app = new AppController(engine, new MemorySessions());
        app.Store.Changed += s => seen.Add(s.Auth);
        engine.OnRegister = (_, _) => throw new EngineException(EngineErrorCode.Conflict, "taken");
        await app.Register("a.org", "x", "1");
        Assert.Equal(EngineErrorCode.Conflict, app.Store.Value.AuthErrorCode);
        await app.Login("a.org", "x", "1");
        Assert.Null(app.Store.Value.AuthError);
        Assert.Null(app.Store.Value.AuthErrorCode);
        Assert.Equal(
            [
                AuthStatus.SigningIn,
                AuthStatus.SignedOut,
                AuthStatus.SigningIn,
                AuthStatus.SignedIn,
                AuthStatus.SignedIn,
            ],
            seen
        );
    }

    [Fact]
    public async Task Bootstrap_restores_a_saved_session()
    {
        var session = new Session("a.org", "@x:a.org", "D", "t");
        var app = new AppController(new FakeEngine(), new MemorySessions(session));
        await app.Bootstrap();
        Assert.Equal(AuthStatus.SignedIn, app.Store.Value.Auth);
        Assert.Equal("@x:a.org", app.Store.Value.UserId);
    }

    [Fact]
    public async Task A_dead_token_clears_the_session_and_shows_no_error()
    {
        var sessions = new MemorySessions(new Session("a.org", "@x:a.org", "D", "t"));
        var engine = new FakeEngine {
            OnRestore = _ =>
                throw new EngineException(EngineErrorCode.Unauthorized, "M_UNKNOWN_TOKEN"),
        };
        var app = new AppController(engine, sessions);
        await app.Bootstrap();
        Assert.Equal(AuthStatus.SignedOut, app.Store.Value.Auth);
        Assert.Null(app.Store.Value.AuthError);
        Assert.Null(sessions.Saved);
    }

    [Fact]
    public async Task Lost_keys_clear_the_session_and_say_why()
    {
        var sessions = new MemorySessions(new Session("a.org", "@x:a.org", "D", "t"));
        var engine = new FakeEngine {
            OnRestore = _ => throw new EngineException(EngineErrorCode.KeysLost, "keys lost"),
        };
        var app = new AppController(engine, sessions);
        await app.Bootstrap();
        Assert.Null(sessions.Saved);
        Assert.Equal(EngineErrorCode.KeysLost, app.Store.Value.AuthErrorCode);
        Assert.Equal("keys lost", app.Store.Value.AuthError);
    }

    [Fact]
    public async Task A_network_failure_while_restoring_keeps_the_session()
    {
        var sessions = new MemorySessions(new Session("a.org", "@x:a.org", "D", "t"));
        var engine = new FakeEngine {
            OnRestore = _ => throw new EngineException(EngineErrorCode.Network, "offline"),
        };
        var app = new AppController(engine, sessions);
        await app.Bootstrap();
        Assert.NotNull(sessions.Saved);
        Assert.Equal(AuthStatus.SignedOut, app.Store.Value.Auth);
    }

    [Fact]
    public async Task Logout_clears_the_session_even_when_the_engine_fails()
    {
        var sessions = new MemorySessions();
        var app = new AppController(new FailingLogoutEngine(), sessions);
        await app.Login("a.org", "x", "1");
        await Assert.ThrowsAsync<InvalidOperationException>(app.Logout);
        Assert.Null(sessions.Saved);
        Assert.Equal(AuthStatus.SignedOut, app.Store.Value.Auth);
    }

    private sealed class FailingLogoutEngine : IAuthEngine {
        public Task<Session> LoginWithPassword(string homeserver, string username, string password)
        {
            return Task.FromResult(new Session(homeserver, $"@{username}:{homeserver}", "D", "t"));
        }

        public Task<Session> Register(string h, string u, string p, string? t)
        {
            return LoginWithPassword(h, u, p);
        }

        public Task Restore(Session session)
        {
            return Task.CompletedTask;
        }

        public Task Logout()
        {
            throw new InvalidOperationException("network");
        }
    }
}
