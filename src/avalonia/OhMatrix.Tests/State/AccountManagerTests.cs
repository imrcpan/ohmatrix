using Avalonia.Headless.XUnit;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.State;

public class AccountManagerTests {
    private sealed class Engine : IAuthEngine {
        public int Logouts;

        public Task<Session> LoginWithPassword(string homeserver,
            string username, string password)
        {
            return Task.FromResult(new Session(homeserver, $"@{username}:s",
                "D", "T"));
        }

        public Task<Session> Register(string homeserver, string username,
            string password,
            string? token)
        {
            return LoginWithPassword(homeserver, username, password);
        }

        public Task Restore(Session session) => Task.CompletedTask;

        public Task Logout()
        {
            Logouts++;
            return Task.CompletedTask;
        }
    }

    private sealed class Sessions(Session? first = null) : ISessionStore {
        private Session? saved = first;
        public Task<Session?> Load() => Task.FromResult(saved);

        public Task Save(Session session)
        {
            saved = session;
            return Task.CompletedTask;
        }

        public Task Clear()
        {
            saved = null;
            return Task.CompletedTask;
        }
    }

    private sealed class Accounts : IAccountsStore {
        public StoredAccounts? Saved;
        public Task<StoredAccounts?> Load() => Task.FromResult(Saved);

        public Task Save(StoredAccounts accounts)
        {
            Saved = accounts;
            return Task.CompletedTask;
        }
    }

    private static (AccountManager, Accounts, Dictionary<string, Engine>) Make(
        params string[] saved)
    {
        var engines = new Dictionary<string, Engine>();
        var store = new Accounts {
            Saved = saved.Length == 0
                ? null
                : new StoredAccounts(
                    [
                        .. saved.Select(u =>
                            new StoredAccount(u, "/nowhere/" + u))
                    ],
                    saved[0])
        };

        AppController Create(string dir)
        {
            var engine = new Engine();
            engines[dir] = engine;
            var user = dir.StartsWith("/nowhere/", StringComparison.Ordinal)
                ? dir[9..]
                : null;
            return new AppController(engine,
                new Sessions(user is null
                    ? null
                    : new Session("s", user, "D", "T")), null);
        }

        return (new AccountManager("/data", Create, store), store, engines);
    }

    [Fact]
    public async Task
        A_first_start_shows_the_sign_in_and_keeps_the_account_once_signed_in()
    {
        var (manager, store, _) = Make();
        await manager.Start();
        Assert.Empty(manager.Accounts);
        Assert.Equal(AuthStatus.SignedOut, manager.Current.Store.Value.Auth);
        await manager.Current.Login("s", "ann", "pw");
        Assert.Equal(["@ann:s"], manager.Accounts.Select(a => a.UserId));
        Assert.Equal("/data", manager.Accounts[0].Dir);
        Assert.Equal("@ann:s", store.Saved!.Current);
    }

    [Fact]
    public async Task Saved_accounts_all_start_and_the_first_is_in_use()
    {
        var (manager, _, _) = Make("@a:s", "@b:s");
        await manager.Start();
        Assert.Equal(["@a:s", "@b:s"], manager.Accounts.Select(a => a.UserId));
        Assert.Same(manager.Accounts[0].Controller, manager.Current);
        Assert.All(manager.Accounts, a => Assert.Equal(AuthStatus.SignedIn,
            a.Controller.Store.Value.Auth));
    }

    [Fact]
    public async Task
        Another_account_is_added_switched_to_ordered_and_signed_out()
    {
        var (manager, store, engines) = Make("@a:s");
        await manager.Start();
        manager.BeginAdd();
        Assert.True(manager.Adding);
        await manager.Current.Login("s", "b", "pw");
        Assert.Equal(["@a:s", "@b:s"], manager.Accounts.Select(a => a.UserId));
        Assert.Equal("@b:s", manager.CurrentAccount!.UserId);
        manager.SwitchTo("@a:s");
        Assert.Equal("@a:s", manager.CurrentAccount!.UserId);
        await manager.Move("@a:s", 1);
        Assert.Equal(["@b:s", "@a:s"],
            store.Saved!.Accounts.Select(a => a.UserId));
        var bDir = manager.Accounts[0].Dir;
        await manager.Remove("@b:s");
        Assert.Equal(1, engines[bDir].Logouts);
        Assert.Equal(["@a:s"], manager.Accounts.Select(a => a.UserId));
        await manager.Remove("@a:s");
        Assert.Empty(manager.Accounts);
        Assert.Equal(AuthStatus.SignedOut, manager.Current.Store.Value.Auth);
    }

    [Fact]
    public async Task Cancelling_a_sign_in_goes_back_to_the_account_in_use()
    {
        var (manager, _, _) = Make("@a:s");
        await manager.Start();
        manager.BeginAdd();
        manager.CancelAdd();
        Assert.False(manager.Adding);
        Assert.Equal("@a:s", manager.CurrentAccount!.UserId);
    }

    [Theory]
    [InlineData(0, 10, 3, 0)]
    [InlineData(0, 70, 3, 1)]
    [InlineData(1, -200, 3, 0)]
    [InlineData(1, 500, 3, 2)]
    public void A_dragged_row_lands_on_the_row_it_is_over(int from, double dy,
        int count, int to)
    {
        Assert.Equal(to, AccountsPage.DropIndex(from, dy, count));
    }

    [AvaloniaFact]
    public async Task
        The_accounts_page_lists_the_accounts_and_the_root_follows_the_one_in_use()
    {
        var (manager, _, _) = Make("@a:s", "@b:s");
        await manager.Start();
        var window = new Avalonia.Controls.Window {
            Content = new AppRoot(manager, "s", () => false),
            Width = 1000,
            Height = 700,
        };
        window.Show();
        var page = new AccountsPage(manager.Current);
        Assert.Equal(2, page.Rows.Count);
        page.Switch(manager.Accounts[1]);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal("@b:s", manager.CurrentAccount!.UserId);
        page.SetReordering(true);
        Assert.True(page.Reordering);
        Assert.Equal(2, page.Rows.Count);
    }
}
