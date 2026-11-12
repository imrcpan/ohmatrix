using Avalonia.Controls;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Media;

namespace OhMatrix.Core.Ui;

/// <summary>Parameters for constructing a <see cref="Bubble"/>.</summary>
public sealed record BubbleParams {
    public required ColorTokens Colors { get; init; }
    public required string Text { get; init; }
    public required string Time { get; init; }
    public required bool Own { get; init; }
    public string? SenderName { get; init; }
    public string? SenderId { get; init; }
    public bool StuckAbove { get; init; }
    public bool StuckBelow { get; init; }
    public bool Sending { get; init; }
    public bool Failed { get; init; }
    public string? EditedLabel { get; init; }
    public bool Accent { get; init; } = true;
    public ReplyQuote? Reply { get; init; }
    public ImageAttachment? Image { get; init; }
    public Pictures? Pictures { get; init; }
    public FileAttachment? File { get; init; }
    public Action<Image>? OpenImage { get; init; }
    public string? Formatted { get; init; }
    public Action<string>? OpenLink { get; init; }
    public bool Read { get; init; }
    public string? ReadLabel { get; init; }
    public Action<FileAttachment>? OpenFile { get; init; }
    public Func<string, Task<LinkPreview?>>? Preview { get; init; }
    public Func<FileAttachment, Task<string?>>? Fetch { get; init; }
}
