using Avalonia;
using Avalonia.Controls;
using Avalonia.Input.Platform;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>
/// A room that is not joined, as the large card of the explore page shows it (<c>RoomCardDialog</c>): its picture, name, number of people and what it
/// is about, with buttons to copy its address and to join it.
/// </summary>
public sealed class RoomCardDialog : IOverlay {
    private readonly AppController controller;
    private readonly Dialog dialog = new();

    public RoomCardDialog(AppController controller)
    {
        this.controller = controller;
    }

    public Dialog Dialog => dialog;

    /// <summary>The Join button of the card shown.</summary>
    public PrimaryButton? JoinButton { get; private set; }

    private string T(string key, params (string, object)[] values) =>
        Strings.T(controller.Store.Value.Locale, key, values);

    /// <summary>Opens the card of <paramref name="room"/>; Join closes it and calls <paramref name="join"/>.</summary>
    public void Show(TopLevel window, PublicRoom room, Action join)
    {
        var c = ThemeScope.GetColors(window);
        var head = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Spacing = 2
        };
        var avatar = new Avatar(room.RoomId, room.Name, 80) {
            HorizontalAlignment = HorizontalAlignment.Center
        };
        controller.Pictures.Attach(avatar, room.AvatarUrl, 80);
        head.Children.Add(avatar);
        head.Children.Add(new TextBlock {
            Text = room.Name,
            FontSize = 20,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 8, 0, 0),
        });
        head.Children.Add(new TextBlock {
            Text = room.Members == 1
                ? T("member.one")
                : T("explore.members", ("count", room.Members)),
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextAlignment = TextAlignment.Center,
        });
        var content = new List<Control> {
            head
        };
        if (room.Topic?.Trim() is { Length: > 0 } topic)
            content.Add(new ScrollViewer {
                MaxHeight = 220,
                Content = new SelectableTextBlock {
                    Text = topic,
                    FontSize = 14,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.TextSecondary),
                    TextWrapping = TextWrapping.Wrap,
                },
            });
        var copy = new TextButton {
            Title = T("explore.copy")
        };
        copy.Click += async (_, _) => {
            try {
                await window.Clipboard!.SetTextAsync(room.Alias ?? room.RoomId);
                copy.Title = T("copied");
            } catch (Exception) {
                controller.ShowNotice(T("copyFailed"), NoticeKind.Error);
            }
        };
        var joinButton = new PrimaryButton {
            Title = T("join")
        };
        JoinButton = joinButton;
        joinButton.Click += (_, _) => {
            dialog.Close();
            join();
        };
        var cancel = new TextButton {
            Title = T("cancel")
        };
        cancel.Click += (_, _) => dialog.Close();
        foreach (var b in new Control[] {
                     copy, joinButton, cancel
                 })
            ThemeScope.SetColors(b, c);
        content.AddRange([copy, joinButton, cancel]);
        dialog.Show(window, c, "", null, [.. content]);
    }

    public void Close()
    {
        dialog.Close();
    }

    /// <summary>Closes it for good: it is not shown again.</summary>
    public void Retire()
    {
        Close();
        dialog.Retire();
    }
}
