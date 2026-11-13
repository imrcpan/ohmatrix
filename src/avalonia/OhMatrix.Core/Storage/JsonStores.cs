using System.Text.Json;
using System.Text.Json.Serialization;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Storage;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = true
)]
[JsonSerializable(typeof(Session))]
[JsonSerializable(typeof(Preferences))]
[JsonSerializable(typeof(Profile))]
[JsonSerializable(typeof(StoredAccounts))]
internal sealed partial class StorageJson : JsonSerializerContext;

/// <summary>Keeps one value as a JSON file, written through a temporary file so that a crash never leaves half of it.</summary>
internal static class JsonFile {
    // Saves come one after the other, in the order they were asked for: two at once would write the same temporary file.
    private static readonly SemaphoreSlim Gate = new(1, 1);

    public static async Task<T?> Read<T>(string path,
        System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> info)
        where T : class
    {
        if (!File.Exists(path))
            return null;
        try {
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync(stream, info);
        } catch (JsonException) {
            // A file that cannot be read is as good as none: the person signs in again.
            return null;
        }
    }

    // After the saves that were asked for before it, off the thread of the caller.
    public static async Task Delete(string path)
    {
        await Gate.WaitAsync();
        try {
            await Task.Run(() => File.Delete(path));
        } finally {
            Gate.Release();
        }
    }

    public static async Task Write<T>(string path, T value,
        System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> info)
    {
        await Gate.WaitAsync();
        try {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temp = path + ".tmp";
            await using (var stream = File.Create(temp))
                await JsonSerializer.SerializeAsync(stream, value, info);
            File.Move(temp, path, true);
        } finally {
            Gate.Release();
        }
    }
}

/// <summary>The session in <c>session.json</c> of a data directory.</summary>
public sealed class FileSessionStore(string directory) : ISessionStore {
    private string Path => System.IO.Path.Combine(directory, "session.json");

    public Task<Session?> Load()
    {
        return JsonFile.Read(Path, StorageJson.Default.Session);
    }

    public Task Save(Session session)
    {
        return JsonFile.Write(Path, session, StorageJson.Default.Session);
    }

    public Task Clear()
    {
        return JsonFile.Delete(Path);
    }
}

/// <summary>The preferences in <c>preferences.json</c> of a data directory.</summary>
public sealed class FilePreferencesStore(string directory) : IPreferencesStore {
    private string Path =>
        System.IO.Path.Combine(directory, "preferences.json");

    public async Task<Preferences> Load()
    {
        return await JsonFile.Read(Path, StorageJson.Default.Preferences) ??
               new Preferences();
    }

    public Task Save(Preferences preferences)
    {
        return JsonFile.Write(Path, preferences,
            StorageJson.Default.Preferences);
    }
}

/// <summary>The accounts in <c>accounts.json</c> of a data directory.</summary>
public sealed class FileAccountsStore(string directory) : IAccountsStore {
    private string Path => System.IO.Path.Combine(directory, "accounts.json");

    public Task<StoredAccounts?> Load()
    {
        return JsonFile.Read(Path, StorageJson.Default.StoredAccounts);
    }

    public Task Save(StoredAccounts accounts)
    {
        return JsonFile.Write(Path, accounts,
            StorageJson.Default.StoredAccounts);
    }
}
