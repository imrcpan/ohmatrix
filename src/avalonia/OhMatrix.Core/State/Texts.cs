using OhMatrix.Core.I18n;

namespace OhMatrix.Core.State;

/// <summary>The text of the interface in the language of the account: <c>controller.T("members", ("n", count))</c>.</summary>
public static class Texts {
    public static string T(this AppController controller, string key)
    {
        return Strings.T(controller.Store.Value.Locale, key);
    }

    /// <summary>With values for the <c>{name}</c> of the text: pairs of a name and a text or a whole number, kept on the stack.</summary>
    public static string T(this AppController controller, string key,
        params ReadOnlySpan<Arg> values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }
}
