using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>Search of message text (<c>search</c> of the TypeScript core): the server searches the rooms it can read.</summary>
public interface ISearchEngine {
    /// <summary>Messages with the term, in one room or all of them, newest first; <paramref name="from"/> is the <c>Next</c> of the page before.</summary>
    Task<SearchPage> Messages(string term, string? roomId, string? from);
}
