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
                new Sessions(user == null
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

    [AvaloniaFact]
    public async Task
        The_pages_of_an_account_left_let_go_of_its_store_and_their_timers()
    {
        var (manager, _, _) = Make("@a:s", "@b:s");
        await manager.Start();
        var first = manager.Current;
        var before = first.Store.Watchers;
        var window = new Avalonia.Controls.Window {
            Content = new AppRoot(manager, "s", () => false),
            Width = 1000,
            Height = 700,
        };
        window.Show();
        // The pages hook onto the store: many more than before.
        Assert.True(first.Store.Watchers > before + 10);

        var chooser = new AccountsPage(first);
        chooser.Switch(manager.Accounts[1]);
        // The page that asked is the test's own.
        Lifetime.Release(chooser);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal("@b:s", manager.CurrentAccount!.UserId);
        // Of the old account nothing of the old pages is left.
        Assert.Equal(before, first.Store.Watchers);
        var second = manager.Current;
        Assert.True(second.Store.Watchers > before + 10);

        // And back: the pages of the other account go in their turn.
        chooser = new AccountsPage(second);
        chooser.Switch(manager.Accounts[0]);
        Lifetime.Release(chooser);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(before, second.Store.Watchers);
        Assert.True(first.Store.Watchers > before + 10);
    }

    [AvaloniaFact]
    public async Task
        Dialogs_left_open_close_and_the_old_page_can_be_collected()
    {
        var (manager, _, _) = Make("@a:s", "@b:s");
        await manager.Start();
        var root = new AppRoot(manager, "s", () => false);
        var window = new Avalonia.Controls.Window {
            Content = root,
            Width = 1000,
            Height = 700,
        };
        window.Show();
        var old = OpenDialogsAndSwitch(manager, root, window);
        for (var i = 0; i < 4; i++) {
            Avalonia.Threading.Dispatcher.UIThread.RunJobs();
            GC.Collect();
            GC.WaitForPendingFinalizers();
        }

        Assert.False(old.TryGetTarget(out _));
        GC.KeepAlive(root);
        GC.KeepAlive(window);
    }

    [System.Runtime.CompilerServices.MethodImpl(
        System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
    private static WeakReference<MainScreen> OpenDialogsAndSwitch(
        AccountManager manager, AppRoot root, Avalonia.Controls.Window window)
    {
        var colors = OhMatrix.Core.Theming.Themes.Get("light")!.Colors;
        var screen = Assert.IsType<MainScreen>(root.Page);
        var layer = Avalonia.Controls.Primitives.OverlayLayer
            .GetOverlayLayer(window)!;
        var baseline = layer.Children.Count;

        // A dialog of a chat, a prompt of the explore page and a menu of the
        // settings are open when the account is switched.
        screen.Wide.GroupDialog.Show(window, colors, "t");
        screen.ExploreScreen.AddPrompt.Show(window, colors, "en", "t", "m", [],
            "ok", _ => Task.CompletedTask);
        screen.SettingsScreen.DownloadMenu.Show(screen.SettingsScreen, window,
        [
            new MenuItem("a", () => {
            })
        ]);
        Assert.True(layer.Children.Count >= baseline + 3);

        var chooser = new AccountsPage(manager.Current);
        chooser.Switch(manager.Accounts[1]);
        Lifetime.Release(chooser);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        Assert.False(screen.Wide.GroupDialog.IsOpen);
        Assert.False(screen.ExploreScreen.AddPrompt.Dialog.IsOpen);
        Assert.False(screen.SettingsScreen.DownloadMenu.IsOpen);
        Assert.Equal(baseline, layer.Children.Count);
        return new WeakReference<MainScreen>(screen);
    }

    [AvaloniaFact]
    public async Task An_answer_that_comes_late_does_not_open_a_dialog_again()
    {
        var (manager, _, _) = Make("@a:s", "@b:s");
        await manager.Start();
        var root = new AppRoot(manager, "s", () => false);
        var window = new Avalonia.Controls.Window {
            Content = root,
            Width = 1000,
            Height = 700,
        };
        window.Show();
        var (old, dialog) = LeaveWithDialogsPending(manager, root, window);
        for (var i = 0; i < 4; i++) {
            Avalonia.Threading.Dispatcher.UIThread.RunJobs();
            GC.Collect();
            GC.WaitForPendingFinalizers();
        }

        // The request of the old page ends after the switch and shows its
        // dialog; nothing is shown and the old page can still go.
        Assert.False(dialog.IsOpen);
        Assert.False(old.TryGetTarget(out _));
        GC.KeepAlive(root);
        GC.KeepAlive(window);
    }

    private static (WeakReference<MainScreen>, Dialog) LeaveWithDialogsPending(
        AccountManager manager, AppRoot root, Avalonia.Controls.Window window)
    {
        var colors = OhMatrix.Core.Theming.Themes.Get("light")!.Colors;
        var screen = Assert.IsType<MainScreen>(root.Page);
        var layer = Avalonia.Controls.Primitives.OverlayLayer
            .GetOverlayLayer(window)!;
        var baseline = layer.Children.Count;
        var chooser = new AccountsPage(manager.Current);
        chooser.Switch(manager.Accounts[1]);
        Lifetime.Release(chooser);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();

        // What the old page's request does when it returns.
        var dialogs = new Dialog[] {
            screen.Wide.GroupDialog, screen.SpaceScreen.SpaceDialog,
            screen.EncryptionScreen.KeyDialog, screen.Wide.Forwarding.Dialog,
        };
        foreach (var d in dialogs)
            d.Show(window, colors, "late");
        screen.ExploreScreen.AddPrompt.Show(window, colors, "en", "t", "m", [],
            "ok", _ => Task.CompletedTask);
        screen.SettingsScreen.DownloadMenu.Show(screen.SettingsScreen, window,
        [
            new MenuItem("a", () => {
            })
        ]);
        Assert.Equal(baseline, layer.Children.Count);
        return (new WeakReference<MainScreen>(screen), dialogs[0]);
    }
}
