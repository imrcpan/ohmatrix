namespace OhMatrix.Core.I18n;

/// <summary>A way to put a text of the language in a place that does not know the language: the key and the pairs for its <c>{name}</c>.</summary>
public delegate string Translate(string key, params ReadOnlySpan<Arg> values);
