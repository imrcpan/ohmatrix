using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>Keeps the session of the account across runs (<c>SessionStore</c> of the TypeScript core).</summary>
public interface ISessionStore {
    Task<Session?> Load();
    Task Save(Session session);
    Task Clear();
}

/// <summary>Keeps the preferences across runs (<c>PreferencesStore</c> of the TypeScript core).</summary>
public interface IPreferencesStore {
    Task<Preferences> Load();
    Task Save(Preferences preferences);
}
