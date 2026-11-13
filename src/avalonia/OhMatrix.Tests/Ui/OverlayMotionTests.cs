using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.VisualTree;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Chat.Composer;
using OhMatrix.Core.Ui.Chat.Messages;
using OhMatrix.Core.Ui.Media;
using OhMatrix.Core.Ui.Overlays;
using Xunit;
using Menu = OhMatrix.Core.Ui.Overlays.Menu;
using MenuItem = OhMatrix.Core.Ui.Overlays.MenuItem;

namespace OhMatrix.Tests.Ui;

/// <summary>
/// How the overlays come and go with motion on (the other tests run with it off, and look at where a change ends): a closed overlay is closed
/// at once, and is taken off the screen when it has faded away.
/// </summary>
public class OverlayMotionTests {
    private static Window Open(Control? content = null)
    {
        var window = new Window {
            Content = content ?? new Grid(),
            Width = 480,
            Height = 400
        };
        ThemeScope.SetColors(window, Themes.Get("light")!.Colors);
        window.Show();
        return window;
    }

    // ---------------------------------------------------------------- Dialog

    private static Grid ShadeOf(Dialog dialog)
    {
        return (Grid)dialog.Card.Parent!;
    }

    private static void Show(Dialog dialog, Window window)
    {
        dialog.Show(window, Themes.Get("light")!.Colors, "Title", "Message");
    }

    [AvaloniaFact]
    public void A_dialog_dims_the_window_and_brings_its_card_down()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        Show(dialog, Open());
        var shade = ShadeOf(dialog);
        var dim = (Brush)shade.Background!;
        Assert.True(dialog.IsOpen);
        // The window dims by itself and the card comes by itself: the shade
        // that holds them is not faded.
        Assert.Equal(1, shade.Opacity);
        Assert.Equal(0, dim.Opacity);
        Assert.Equal(0, dialog.Card.Opacity);
        Assert.NotNull(dialog.Card.RenderTransform);

        clock.Finish();
        Assert.True(dialog.IsOpen);
        Assert.Equal(1, dim.Opacity);
        Assert.Equal(1, dialog.Card.Opacity);
        Assert.Null(dialog.Card.RenderTransform);
        Assert.Null(dialog.Card.CacheMode);
    }

    [AvaloniaFact]
    public void A_closed_dialog_is_closed_at_once_and_goes_when_it_has_faded()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        Show(dialog, Open());
        var shade = ShadeOf(dialog);
        clock.Finish();

        dialog.Close();
        Assert.False(dialog.IsOpen);
        // It is still on the screen, fading, and the press goes through it.
        Assert.NotNull(shade.Parent);
        Assert.False(shade.IsHitTestVisible);
        clock.Finish();
        Assert.Null(shade.Parent);
        Assert.False(dialog.IsOpen);
    }

    [AvaloniaFact]
    public void A_dialog_closed_twice_closes_once()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        Show(dialog, Open());
        var shade = ShadeOf(dialog);
        clock.Finish();
        dialog.Close();
        clock.Frame();
        clock.Frame(48);
        dialog.Close();
        clock.Finish();
        Assert.Null(shade.Parent);
    }

    [AvaloniaFact]
    public void Escape_while_a_dialog_goes_does_not_report_again()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        var reports = 0;
        dialog.OnClose = () => reports++;
        var window = Open();
        Show(dialog, window);
        clock.Finish();

        window.KeyPress(Key.Escape, RawInputModifiers.None,
            PhysicalKey.Escape, null);
        Assert.Equal(1, reports);
        Assert.False(dialog.IsOpen);
        clock.Frame();
        clock.Frame(48);
        window.KeyPress(Key.Escape, RawInputModifiers.None,
            PhysicalKey.Escape, null);
        Assert.Equal(1, reports);
        clock.Finish();
        Assert.Equal(1, reports);
    }

    [AvaloniaFact]
    public void A_dialog_shown_while_it_goes_is_shown_afresh_and_stays()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        var window = Open();
        Show(dialog, window);
        var shade = ShadeOf(dialog);
        clock.Finish();
        dialog.Close();
        clock.Frame();
        clock.Frame(48);

        Show(dialog, window);
        Assert.True(dialog.IsOpen);
        Assert.True(shade.IsHitTestVisible);
        Assert.Equal(0, dialog.Card.Opacity);
        Assert.Equal(0, ((Brush)shade.Background!).Opacity);
        clock.Finish();
        // What was going is not taken away when its time is over.
        Assert.NotNull(shade.Parent);
        Assert.Equal(1, dialog.Card.Opacity);
        Assert.True(dialog.IsOpen);
    }

    [AvaloniaFact]
    public void A_dialog_that_is_retired_is_taken_away_at_once()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        Show(dialog, Open());
        var shade = ShadeOf(dialog);
        clock.Frame();
        dialog.Retire();
        Assert.Null(shade.Parent);
        Assert.False(dialog.IsOpen);
        clock.Finish();
        Assert.Null(shade.Parent);
    }

    // ------------------------------------------------------------------ Menu

    private static (Window Window, Border Anchor) Anchored(double top)
    {
        var anchor = new Border {
            Width = 120,
            Height = 36,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Top,
            Margin = new Thickness(40, top, 0, 0),
        };
        var root = new Grid();
        root.Children.Add(anchor);
        return (Open(root), anchor);
    }

    private static List<MenuItem> Items(int n)
    {
        return Enumerable.Range(0, n)
            .Select(i => new MenuItem($"Item {i}", () => {
            }))
            .ToList();
    }

    [AvaloniaFact]
    public void A_menu_grows_from_the_corner_at_its_anchor()
    {
        using var clock = new FrameClock();
        var (window, anchor) = Anchored(40);
        var menu = new Menu();

        // Below its anchor, from the left: from the top left.
        menu.Show(anchor, window, Items(3));
        Assert.Equal(new RelativePoint(0, 0, RelativeUnit.Relative),
            menu.Surface.RenderTransformOrigin);
        Assert.Equal(0, menu.Surface.Opacity);
        Assert.Equal(0.55, ((ScaleTransform)((TransformGroup)menu.Surface
            .RenderTransform!).Children[0]).ScaleX);
        clock.Finish();
        Assert.Equal(1, menu.Surface.Opacity);
        Assert.Null(menu.Surface.RenderTransform);

        // From the right edge of its anchor: from the top right.
        menu.AlignRight = true;
        menu.Show(anchor, window, Items(3));
        Assert.Equal(new RelativePoint(1, 0, RelativeUnit.Relative),
            menu.Surface.RenderTransformOrigin);
        clock.Finish();
        menu.Close();
        clock.Finish();
    }

    [AvaloniaFact]
    public void A_menu_that_flips_above_its_anchor_grows_from_the_bottom()
    {
        using var clock = new FrameClock();
        var (window, anchor) = Anchored(340);
        var menu = new Menu();
        menu.Show(anchor, window, Items(4));
        Assert.True(menu.Top < 340);
        Assert.Equal(new RelativePoint(0, 1, RelativeUnit.Relative),
            menu.Surface.RenderTransformOrigin);
        clock.Finish();
    }

    [AvaloniaFact]
    public void A_closed_menu_is_closed_at_once_and_goes_when_it_has_faded()
    {
        using var clock = new FrameClock();
        var (window, anchor) = Anchored(40);
        var menu = new Menu();
        menu.Show(anchor, window, Items(3));
        var shade = (Control)menu.Surface.Parent!;
        clock.Finish();

        menu.Close();
        Assert.False(menu.IsOpen);
        Assert.NotNull(shade.Parent);
        Assert.False(shade.IsHitTestVisible);
        // A menu is gone in about a seventh of a second.
        var took = clock.Finish();
        Assert.InRange(took, 90, 250);
        Assert.Null(shade.Parent);
    }

    [AvaloniaFact]
    public void A_menu_shown_again_while_it_goes_stays()
    {
        using var clock = new FrameClock();
        var (window, anchor) = Anchored(40);
        var menu = new Menu();
        menu.Show(anchor, window, Items(3));
        var shade = (Control)menu.Surface.Parent!;
        clock.Finish();
        menu.Close();
        clock.Frame();
        clock.Frame(32);
        menu.Show(anchor, window, Items(3));
        Assert.True(menu.IsOpen);
        clock.Finish();
        Assert.NotNull(shade.Parent);
        Assert.True(menu.IsOpen);
    }

    // ----------------------------------------------------------- MessageMenu

    private static (MessageMenu Menu, Control Column, Control Shade) Reacting(
        Window window, Point at, MessageMenu? shown = null)
    {
        var menu = shown ?? new MessageMenu();
        menu.Show(window, Themes.Get("light")!.Colors, at,
            ["\U0001F44D", "\U0001F602", "\U0001F64F"],
            new HashSet<string>(), _ => {
            }, [
                new MenuItem("Copy", () => {
                }, "copy"),
            ]);
        var shade = menu.Emojis[0].GetVisualAncestors().OfType<Canvas>()
            .First();
        return (menu, (Control)shade.Children[0], shade);
    }

    private static double ScaleOf(Control control)
    {
        return ((ScaleTransform)((TransformGroup)control.RenderTransform!)
            .Children[0]).ScaleX;
    }

    [AvaloniaFact]
    public void
        A_message_menu_grows_from_the_pointer_and_its_reactions_pop_one_after_the_other()
    {
        using var clock = new FrameClock();
        var window = Open();
        var (menu, column, shade) = Reacting(window, new Point(100, 60));
        // Opening right and down, the corner at the pointer is the top left.
        Assert.Equal(new RelativePoint(0, 0, RelativeUnit.Relative),
            column.RenderTransformOrigin);
        Assert.Equal(0, column.Opacity);
        Assert.All(menu.Emojis, e => {
            Assert.Equal(0, e.Opacity);
            Assert.Equal(0.15, ScaleOf(e));
        });

        clock.Frame();
        for (var i = 0; i < 6; i++)
            clock.Frame();
        // 96 ms on: the first has been coming for 36 ms, the second for 12,
        // and the third has not started.
        var (first, second, third) = (menu.Emojis[0].Opacity,
            menu.Emojis[1].Opacity, menu.Emojis[2].Opacity);
        Assert.True(first > second && second > third && third == 0,
            $"{first} {second} {third}");

        var biggest = 0.0;
        clock.Finish(() => {
            if (menu.Emojis[0].RenderTransform != null)
                biggest = Math.Max(biggest, ScaleOf(menu.Emojis[0]));
        });
        // A reaction goes past its size and settles.
        Assert.InRange(biggest, 1.03, 1.2);
        Assert.All(menu.Emojis, e => {
            Assert.Equal(1, e.Opacity);
            Assert.Null(e.RenderTransform);
            Assert.Null(e.CacheMode);
        });
        Assert.Equal(1, column.Opacity);
        Assert.Null(column.RenderTransform);

        menu.Close();
        Assert.False(menu.IsOpen);
        Assert.NotNull(shade.Parent);
        Assert.False(shade.IsHitTestVisible);
        clock.Finish();
        Assert.Null(shade.Parent);
    }

    [AvaloniaFact]
    public void
        A_message_menu_near_the_corner_of_the_window_grows_from_that_corner()
    {
        using var clock = new FrameClock();
        var (menu, column, _) = Reacting(Open(), new Point(450, 380));
        // It opens left and up, so the corner at the pointer is the bottom right.
        Assert.Equal(new RelativePoint(1, 1, RelativeUnit.Relative),
            column.RenderTransformOrigin);
        clock.Finish();
        menu.Close();
        clock.Finish();
    }

    [AvaloniaFact]
    public void
        A_message_menu_shown_again_while_it_goes_stays_and_starts_afresh()
    {
        using var clock = new FrameClock();
        var window = Open();
        var (menu, _, shade) = Reacting(window, new Point(100, 60));
        clock.Finish();
        menu.Close();
        clock.Frame();
        clock.Frame(32);

        var (_, column, next) = Reacting(window, new Point(100, 60), menu);
        Assert.Same(shade, next);
        Assert.True(menu.IsOpen);
        Assert.Equal(0, column.Opacity);
        Assert.All(menu.Emojis, e => Assert.Equal(0, e.Opacity));
        clock.Finish();
        // What was going is not taken away when its time is over.
        Assert.True(menu.IsOpen);
        Assert.NotNull(next.Parent);
        Assert.Equal(1, column.Opacity);
    }

    // ---------------------------------------------------------- EmojiPicker

    [AvaloniaFact]
    public void
        The_emoji_picker_grows_from_its_bottom_left_corner_and_goes_when_it_has_faded()
    {
        using var clock = new FrameClock();
        var anchor = new Border {
            Width = 40,
            Height = 40,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Bottom,
            Margin = new Thickness(20, 0, 0, 20),
        };
        var window = Open(new Grid {
            Children = {
                anchor
            }
        });
        window.UpdateLayout();
        var picker = new EmojiPicker();
        picker.Show(anchor, window, Themes.Get("light")!.Colors, [], "Search",
            _ => {
            });
        var shade = picker.Search.GetVisualAncestors().OfType<Canvas>().First();
        var surface = (Control)shade.Children[0];
        Assert.True(picker.IsOpen);
        Assert.Equal(new RelativePoint(0, 1, RelativeUnit.Relative),
            surface.RenderTransformOrigin);
        Assert.Equal(0, surface.Opacity);
        clock.Finish();
        Assert.Equal(1, surface.Opacity);
        Assert.Null(surface.RenderTransform);

        picker.Close();
        Assert.False(picker.IsOpen);
        Assert.NotNull(shade.Parent);
        Assert.False(shade.IsHitTestVisible);
        clock.Finish();
        Assert.Null(shade.Parent);
    }

    // ------------------------------------------------------------- TopNotice

    private sealed class NoEngine : IAuthEngine {
        public Task<Session> LoginWithPassword(string homeserver,
            string username, string password)
        {
            return Task.FromResult(new Session(homeserver, "@" + username, "D",
                "T"));
        }

        public Task<Session> Register(string homeserver, string username,
            string password, string? token)
        {
            return LoginWithPassword(homeserver, username, password);
        }

        public Task Restore(Session session)
        {
            return Task.CompletedTask;
        }

        public Task Logout()
        {
            return Task.CompletedTask;
        }
    }

    private sealed class NoSessions : ISessionStore {
        public Task<Session?> Load()
        {
            return Task.FromResult<Session?>(null);
        }

        public Task Save(Session session)
        {
            return Task.CompletedTask;
        }

        public Task Clear()
        {
            return Task.CompletedTask;
        }
    }

    private static (TopNotice Notice, AppController Controller) Noticed()
    {
        var controller = new AppController(new NoEngine(), new NoSessions());
        controller.SetPreferences(p => p with {
            Locale = "en"
        });
        var notice = new TopNotice(controller);
        Open(new Grid {
            Children = {
                notice
            }
        });
        return (notice, controller);
    }

    private static void Clear(AppController controller)
    {
        controller.Store.Update(s => s with {
            Notice = null
        });
    }

    [AvaloniaFact]
    public void A_notice_comes_down_from_above_and_goes_up_again()
    {
        using var clock = new FrameClock();
        var (notice, controller) = Noticed();
        Assert.False(notice.IsVisible);

        controller.ShowNotice("Joining", NoticeKind.Progress);
        Assert.True(notice.IsVisible);
        Assert.Equal("Joining", notice.Text);
        Assert.Equal(0, notice.Opacity);
        Assert.NotNull(notice.RenderTransform);
        // It starts above the edge of the window, and comes past its place
        // a little before it settles.
        var group = (TransformGroup)notice.RenderTransform!;
        Assert.Equal(-56, ((TranslateTransform)group.Children[1]).Y);
        var lowest = double.MinValue;
        clock.Finish(() => {
            if (notice.RenderTransform is TransformGroup { } g)
                lowest = Math.Max(lowest,
                    ((TranslateTransform)g.Children[1]).Y);
        });
        Assert.InRange(lowest, 1, 4);
        Assert.Equal(1, notice.Opacity);
        Assert.Null(notice.RenderTransform);

        Clear(controller);
        // It says nothing at once, and is seen until it has gone.
        Assert.Null(notice.Text);
        Assert.True(notice.IsVisible);
        clock.Finish();
        Assert.False(notice.IsVisible);
        Assert.Null(notice.Text);
    }

    [AvaloniaFact]
    public void A_message_in_the_place_of_another_does_not_come_in_again()
    {
        using var clock = new FrameClock();
        var (notice, controller) = Noticed();
        controller.ShowNotice("Joining", NoticeKind.Progress);
        clock.Finish();

        controller.ShowNotice("Still joining", NoticeKind.Progress);
        Assert.Equal("Still joining", notice.Text);
        Assert.Equal(1, notice.Opacity);
        Assert.Null(notice.RenderTransform);
        Assert.False(clock.Waiting);
    }

    [AvaloniaFact]
    public void A_message_that_comes_while_one_goes_brings_the_notice_back()
    {
        using var clock = new FrameClock();
        var (notice, controller) = Noticed();
        controller.ShowNotice("Joining", NoticeKind.Progress);
        clock.Finish();
        Clear(controller);
        clock.Frame();
        clock.Frame(48);

        controller.ShowNotice("Again", NoticeKind.Progress);
        Assert.Equal("Again", notice.Text);
        clock.Finish();
        // What was going is not hidden when its time is over.
        Assert.True(notice.IsVisible);
        Assert.Equal(1, notice.Opacity);
        Assert.Equal("Again", notice.Text);
    }

    [AvaloniaFact]
    public void A_notice_that_was_never_shown_is_not_made_to_go()
    {
        using var clock = new FrameClock();
        var (notice, controller) = Noticed();
        controller.SetPreferences(p => p with {
            Theme = "dark"
        });
        Assert.False(notice.IsVisible);
        Assert.False(clock.Waiting);
    }

    // ----------------------------------------------------------- the viewers

    private sealed class NoMedia : IMediaEngine {
        public Task<string?> Download(string source, string fileName,
            string mimeType)
        {
            return Task.FromResult<string?>(null);
        }

        public Task<byte[]?> Thumbnail(string mxc, int width, int height)
        {
            return Task.FromResult<byte[]?>(null);
        }
    }

    // The stage that holds the picture, and the shade that holds the stage.
    private static (Control Stage, Control Shade) Layers(ImageViewer viewer)
    {
        var stage = (Control)viewer.Picture.Parent!;
        return (stage, (Control)stage.Parent!);
    }

    [AvaloniaFact]
    public void The_image_viewer_fades_in_and_goes_when_it_has_faded()
    {
        using var clock = new FrameClock();
        var window = Open();
        var viewer = new ImageViewer();
        viewer.Show(window, new Pictures(new NoMedia()), "mxc://x", "a.png",
            null);
        var (stage, shade) = Layers(viewer);
        Assert.True(viewer.IsOpen);
        // With no thumbnail to come from the picture grows a little as it
        // fades in.
        Assert.Equal(0, stage.Opacity);
        Assert.NotNull(stage.RenderTransform);
        Assert.Equal(1, viewer.Zoom);
        clock.Finish();
        Assert.Equal(1, stage.Opacity);
        Assert.Null(stage.RenderTransform);

        viewer.Close();
        Assert.False(viewer.IsOpen);
        Assert.NotNull(shade.Parent);
        Assert.False(shade.IsHitTestVisible);
        clock.Finish();
        Assert.Null(shade.Parent);
    }

    [AvaloniaFact]
    public void An_image_shown_again_while_the_viewer_goes_stays()
    {
        using var clock = new FrameClock();
        var window = Open();
        var pictures = new Pictures(new NoMedia());
        var viewer = new ImageViewer();
        viewer.Show(window, pictures, "mxc://x", "a.png", null);
        var (_, shade) = Layers(viewer);
        clock.Finish();
        viewer.Close();
        clock.Frame();
        clock.Frame(48);

        viewer.Show(window, pictures, "mxc://y", "b.png", null);
        Assert.True(viewer.IsOpen);
        clock.Finish();
        Assert.NotNull(shade.Parent);
        Assert.True(viewer.IsOpen);
    }

    private static (Window Window, Border Thumbnail, Grid Root) Chat()
    {
        var thumbnail = new Border {
            Width = 100,
            Height = 60,
            Margin = new Thickness(40),
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Top,
            Background = Brushes.Gray,
        };
        var root = new Grid {
            Children = {
                thumbnail
            }
        };
        var window = Open(root);
        window.UpdateLayout();
        return (window, thumbnail, root);
    }

    [AvaloniaFact]
    public void An_image_flies_out_of_its_thumbnail_and_back_into_it()
    {
        using var clock = new FrameClock();
        var (window, thumbnail, _) = Chat();
        var viewer = new ImageViewer();
        viewer.Show(window, new Pictures(new NoMedia()), "mxc://x", "a.png",
            null, null, thumbnail);
        var (stage, shade) = Layers(viewer);

        // The thumbnail is taken out of the chat as the picture, which is
        // whole from the first frame, comes out of it: it starts as big as
        // the thumbnail is, where the thumbnail is.
        Assert.Equal(0, thumbnail.Opacity);
        Assert.Equal(1, stage.Opacity);
        var group = (TransformGroup)stage.RenderTransform!;
        // 100 x 60 against a 480 x 400 window: the picture is 480 wide.
        Assert.Equal(100 / 480.0, ((ScaleTransform)group.Children[0]).ScaleX,
            6);
        Assert.Equal(40 + 50 - 240,
            ((TranslateTransform)group.Children[1]).X, 6);
        Assert.Equal(40 + 30 - 200,
            ((TranslateTransform)group.Children[1]).Y, 6);

        clock.Finish(() => Assert.Equal(1, stage.Opacity));
        Assert.Null(stage.RenderTransform);
        Assert.Equal(0, thumbnail.Opacity);
        Assert.True(viewer.IsOpen);

        viewer.Close();
        Assert.False(viewer.IsOpen);
        // It goes back whole, and the thumbnail is shown again only when it
        // has landed on it.
        clock.Finish(() => {
            if (shade.Parent != null) {
                Assert.Equal(1, stage.Opacity);
                Assert.Equal(0, thumbnail.Opacity);
            }
        });
        Assert.Null(shade.Parent);
        Assert.Equal(1, thumbnail.Opacity);
    }

    [AvaloniaFact]
    public void An_image_whose_thumbnail_is_gone_goes_the_usual_way()
    {
        using var clock = new FrameClock();
        var (window, thumbnail, root) = Chat();
        var viewer = new ImageViewer();
        viewer.Show(window, new Pictures(new NoMedia()), "mxc://x", "a.png",
            null, null, thumbnail);
        var (stage, shade) = Layers(viewer);
        clock.Finish();
        Assert.Equal(0, thumbnail.Opacity);

        // The chat was rebuilt while the picture was open.
        root.Children.Remove(thumbnail);
        viewer.Close();
        clock.Frame();
        clock.Frame(32);
        // It fades, as a picture with no thumbnail does.
        Assert.InRange(stage.Opacity, 0.01, 0.99);
        clock.Finish();
        Assert.Null(shade.Parent);
        Assert.Equal(1, thumbnail.Opacity);
    }

    [AvaloniaFact]
    public void A_thumbnail_is_given_back_when_another_picture_is_shown()
    {
        using var clock = new FrameClock();
        var (window, thumbnail, _) = Chat();
        var pictures = new Pictures(new NoMedia());
        var viewer = new ImageViewer();
        viewer.Show(window, pictures, "mxc://x", "a.png", null, null,
            thumbnail);
        Assert.Equal(0, thumbnail.Opacity);
        viewer.Show(window, pictures, "mxc://y", "b.png", null);
        Assert.Equal(1, thumbnail.Opacity);
        clock.Finish();
        viewer.Retire();
    }

    [AvaloniaFact]
    public async Task A_video_that_cannot_be_fetched_takes_the_viewer_away()
    {
        using var clock = new FrameClock();
        var window = Open();
        var viewer = new VideoViewer();
        await viewer.Show(window, new FileAttachment("x.mp4", 1, "mxc://s/x",
            "video/mp4", FileKind.Video), _ => Task.FromResult<string?>(null));
        Assert.False(viewer.IsOpen);
        // Nothing of it was drawn, so there is nothing to fade: it is gone
        // at its first frame.
        var shade = viewer.Picture.Parent!.Parent!;
        Assert.NotNull(shade.Parent);
        clock.Frame();
        Assert.Null(shade.Parent);
        Assert.False(clock.Waiting);
    }
}
