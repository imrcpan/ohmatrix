using System.Globalization;
using System.Text;

namespace OhMatrix.Core.I18n;

/// <summary>
/// A value for a <c>{name}</c> of a text: a text or a whole number. It is a pair in the call, <c>T("members", ("n", count))</c>, so the call
/// reads as it did, and it holds the number as a number, which goes into the text without a string being made of it.
/// </summary>
public readonly struct Arg {
    private readonly string? text;
    private readonly long number;

    public Arg(string name, string? text)
    {
        Name = name;
        this.text = text ?? "";
    }

    public Arg(string name, long number)
    {
        Name = name;
        this.number = number;
    }

    public string Name { get; }

    public static implicit operator Arg((string Name, string? Value) pair)
    {
        return new Arg(pair.Name, pair.Value);
    }

    public static implicit operator Arg((string Name, long Value) pair)
    {
        return new Arg(pair.Name, pair.Value);
    }

    internal void AppendTo(StringBuilder sb)
    {
        if (text is not null) {
            sb.Append(text);
            return;
        }

        // The digits go straight into the text: no string of the number.
        Span<char> digits = stackalloc char[24];
        if (number.TryFormat(digits, out var written,
                provider: CultureInfo.InvariantCulture))
            sb.Append(digits[..written]);
        else
            sb.Append(number);
    }
}
