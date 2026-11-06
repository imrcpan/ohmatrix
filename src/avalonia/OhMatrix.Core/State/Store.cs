namespace OhMatrix.Core.State;

/// <summary>
/// A value that tells when it changes. The screens read <see cref="Value"/> and draw again on <see cref="Changed"/>, which comes on the thread
/// that called <see cref="Update"/>: the state is changed on the UI thread only.
/// </summary>
public sealed class Store<T>(T initial)
    where T : class {
    public T Value { get; private set; } = initial;

    public event Action<T>? Changed;

    /// <summary>Replaces the value by what <paramref name="change"/> makes of it; nothing is told when it is the same object.</summary>
    public void Update(Func<T, T> change)
    {
        var next = change(Value);
        if (ReferenceEquals(next, Value))
            return;
        Value = next;
        Changed?.Invoke(next);
    }
}
