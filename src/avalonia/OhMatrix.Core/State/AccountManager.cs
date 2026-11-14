using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.State;

/// <summary>An account the app keeps: where its data lives, and the controller that keeps it syncing.</summary>
public sealed class AccountEntry(
    string userId,
    string dir,
    AppController controller) {
    public string UserId { get; } = userId;
    public string Dir { get; } = dir;
    public AppController Controller { get; } = controller;

    /// <summary>The unread count of the chats of the account that are not muted.</summary>
    public int Unread =>
        Controller.Store.Value.Rooms.Where(r => !r.Muted && !r.IsSpace)
            .Sum(r => r.UnreadCount);
}

/// <summary>Where the accounts are kept: user ids with their folders, in the order the person put them in, and the one in use.</summary>
public sealed record StoredAccounts(StoredAccount[] Accounts, string? Current);

public sealed record StoredAccount(string UserId, string Dir);

public interface IAccountsStore {
    Task<StoredAccounts?> Load();
    Task Save(StoredAccounts accounts);
}

/// <summary>
/// Several accounts at once (<c>createAccountManager</c> of the TypeScript state): each has its own controller and data folder, all of them
/// keep syncing, and one is <see cref="Current"/>, the one the screens show. A sign-in that is begun and not finished is a controller too, which
/// becomes an account when it is signed in.
/// </summary>
public sealed class AccountManager(
    string dataDirectory,
    Func<string, AppController> create,
    IAccountsStore store
) {
    private static readonly Logger logger = Logger.GetDefault();

    private readonly List<AccountEntry> accounts = [];
    private AppController? signingIn;
    private string? signingInDir;
    private AppController? current;

    /// <summary>The accounts, in order.</summary>
    public IReadOnlyList<AccountEntry> Accounts => accounts;

    /// <summary>The controller to show: that of the account in use, or the sign-in of a new one.</summary>
    public AppController Current =>
        current ?? throw new InvalidOperationException("Not started.");

    /// <summary>The sign-in of a new account is showing.</summary>
    public bool Adding =>
        signingIn != null && ReferenceEquals(current, signingIn);

    /// <summary>The account in use, null while a new one is being signed in.</summary>
    public AccountEntry? CurrentAccount =>
        accounts.FirstOrDefault(a => ReferenceEquals(a.Controller, current));

    /// <summary>The accounts, or which one is showing, have changed.</summary>
    public event Action? Changed;

    /// <summary>Loads the saved accounts and starts them all; the one in use is ready when this returns.</summary>
    public async Task Start()
    {
        var saved = await store.Load();
        if (saved is { Accounts.Length: > 0 }) {
            foreach (var a in saved.Accounts)
                Add(a.UserId, a.Dir, Make(a.Dir));
            current =
                (accounts.FirstOrDefault(a => a.UserId == saved.Current) ??
                 accounts[0]).Controller;
            // All of them restore their sessions and keep syncing; only the one in use is waited for.
            var starts = accounts.Select(a => a.Controller.Bootstrap())
                .ToList();
            await starts[
                accounts.FindIndex(a =>
                    ReferenceEquals(a.Controller, current))];
            return;
        }

        // The one account of before there were several keeps its folder; it becomes an account when it has signed in.
        signingInDir = dataDirectory;
        signingIn = Make(dataDirectory);
        Watch(signingIn);
        current = signingIn;
        await signingIn.Bootstrap();
    }

    /// <summary>Shows the sign-in of one more account.</summary>
    public void BeginAdd()
    {
        if (signingIn == null) {
            signingInDir = Path.Combine(dataDirectory, "accounts",
                Guid.NewGuid().ToString("N"));
            signingIn = Make(signingInDir);
            Watch(signingIn);
            _ = signingIn.Bootstrap();
        }

        Show(signingIn);
    }

    /// <summary>Goes back from the sign-in of a new account to the one before it.</summary>
    public void CancelAdd()
    {
        if (accounts.Count == 0 || !Adding)
            return;
        Show(accounts[0].Controller);
    }

    /// <summary>Makes an account the one in use.</summary>
    public void SwitchTo(string userId)
    {
        var account = accounts.FirstOrDefault(a => a.UserId == userId);
        if (account == null)
            return;
        Show(account.Controller);
    }

    /// <summary>Signs an account out (on the server too) and forgets it; the next one, or the sign-in, takes over.</summary>
    public async Task Remove(string userId)
    {
        var account = accounts.FirstOrDefault(a => a.UserId == userId);
        if (account == null)
            return;
        try {
            await account.Controller.Logout();
        } catch (Exception e) {
            logger.Exception("sign out on the server", e);
            // The account is forgotten here all the same.
        }

        Forget(account);
    }

    /// <summary>Puts the accounts in this order (user ids); one not named keeps its place after the ones that are.</summary>
    public async Task Reorder(IReadOnlyList<string> ids)
    {
        var ordered = ids
            .Select(id => accounts.FirstOrDefault(a => a.UserId == id))
            .OfType<AccountEntry>()
            .Concat(accounts.Where(a => !ids.Contains(a.UserId))).ToList();
        accounts.Clear();
        accounts.AddRange(ordered);
        Changed?.Invoke();
        await Save();
    }

    /// <summary>Moves an account one place up or down.</summary>
    public Task Move(string userId, int by)
    {
        var ids = accounts.Select(a => a.UserId).ToList();
        var i = ids.IndexOf(userId);
        var to = Math.Clamp(i + by, 0, ids.Count - 1);
        if (i < 0 || to == i)
            return Task.CompletedTask;
        ids.RemoveAt(i);
        ids.Insert(to, userId);
        return Reorder(ids);
    }

    private AppController Make(string dir)
    {
        var controller = create(dir);
        controller.Accounts = this;
        return controller;
    }

    private void Show(AppController next)
    {
        if (ReferenceEquals(current, next))
            return;
        // The preferences (theme, language, zoom) belong to the person, not to the account.
        if (current != null)
            next.SetPreferences(_ => current.Store.Value.Prefs);
        current = next;
        Changed?.Invoke();
        _ = Save();
    }

    private void Add(string userId, string dir, AppController controller)
    {
        var entry = new AccountEntry(userId, dir, controller);
        accounts.Add(entry);
        controller.Store.Changed += s => {
            // Another account's unread badge, or the end of its session.
            if (s.Auth == AuthStatus.SignedOut && accounts.Contains(entry))
                Forget(entry);
            else
                Changed?.Invoke();
        };
    }

    /// <summary>A sign-in becomes an account once it is signed in.</summary>
    private void Watch(AppController controller)
    {
        void OnChanged(AppState s)
        {
            if (s.Auth != AuthStatus.SignedIn || s.UserId == null ||
                signingIn != controller)
                return;
            controller.Store.Changed -= OnChanged;
            var dir = signingInDir!;
            signingIn = null;
            signingInDir = null;
            // The same account signed in twice keeps the first.
            if (accounts.Any(a => a.UserId == s.UserId)) {
                _ = Duplicate(controller, s.UserId);
                return;
            }

            Add(s.UserId, dir, controller);
            Changed?.Invoke();
            _ = Save();
        }

        controller.Store.Changed += OnChanged;
    }

    private async Task Duplicate(AppController controller, string userId)
    {
        await controller.Logout();
        SwitchTo(userId);
    }

    private void Forget(AccountEntry account)
    {
        accounts.Remove(account);
        if (account.Dir != dataDirectory) {
            try {
                Directory.Delete(account.Dir, true);
            } catch (IOException e) {
                logger.Exception("delete the folder of an account", e);
                // A folder that stays is only a little disk.
            }
        }

        if (ReferenceEquals(current, account.Controller)) {
            if (accounts.Count > 0)
                current = accounts[0].Controller;
            else {
                // The sign-in of the first account again, in a folder of its own.
                signingInDir = Path.Combine(dataDirectory, "accounts",
                    Guid.NewGuid().ToString("N"));
                signingIn = Make(signingInDir);
                Watch(signingIn);
                _ = signingIn.Bootstrap();
                current = signingIn;
            }
        }

        Changed?.Invoke();
        _ = Save();
    }

    private Task Save()
    {
        return store.Save(new StoredAccounts(
            [.. accounts.Select(a => new StoredAccount(a.UserId, a.Dir))],
            CurrentAccount?.UserId));
    }
}
