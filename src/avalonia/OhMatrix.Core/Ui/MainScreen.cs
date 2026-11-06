using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The page of a signed-in account (<c>MainScreen</c>): from <see cref="SplitBreakpoint"/> wide, the chat list beside the open chat with a divider
/// between them; narrower, the list alone (the chat will slide over it). Until the chat pane is ported the right side says to select a chat.
/// </summary>
public sealed class MainScreen : Grid {
    /// <summary>The width at which the single column becomes two panes.</summary>
    public const double SplitBreakpoint = 760;

    private readonly AppController controller;
    private readonly RoomListPane list;
    private readonly Border listHost = new();

    private readonly Border divider = new() {
        Width = 1
    };

    private readonly Border detail = new();
    private readonly ProfilePage profilePage;
    private readonly ThemePage themePage;
    private readonly RoomInfoPanel infoDock;
    private readonly RoomInfoPanel infoNarrow;

    private readonly Border infoDockHost = new() {
        Width = RoomInfoPanel.Width_,
        BorderThickness = new Thickness(1, 0, 0, 0)
    };

    private readonly LanguagePage languagePage;
    private readonly ExplorePage explorePage;
    private readonly SettingsPage settingsPage;
    private readonly SessionsPage sessionsPage;
    private readonly EncryptionPage encryptionPage;
    private readonly SpacePage spacePage;
    private readonly ChatPane narrowChat;
    private readonly ChatPane wideChat;

    private readonly Border chip = new() {
        CornerRadius = new CornerRadius(999),
        Padding = new Thickness(14, 6),
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly TextBlock chipText = new() {
        FontSize = 14,
        FontWeight = FontWeight.Medium,
        FontFamily = Fonts.System,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Icon chipIcon = new() {
        Glyph = "chat",
        Size = 16,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly VerifyDialog verifyDialog;

    public MainScreen(AppController controller)
    {
        this.controller = controller;
        list = new RoomListPane(controller);
        narrowChat = new ChatPane(controller, () => controller.SelectRoom(null));
        wideChat = new ChatPane(controller);
        profilePage = new ProfilePage(controller);
        themePage = new ThemePage(controller);
        infoDock = new RoomInfoPanel(controller);
        infoNarrow = new RoomInfoPanel(controller);
        languagePage = new LanguagePage(controller);
        explorePage = new ExplorePage(controller);
        settingsPage = new SettingsPage(controller);
        sessionsPage = new SessionsPage(controller);
        encryptionPage = new EncryptionPage(controller);
        spacePage = new SpacePage(controller);
        verifyDialog = new VerifyDialog(controller, this);
        listHost.Child = list;
        ColumnDefinitions = new ColumnDefinitions("Auto,Auto,*,Auto");
        infoDockHost.Child = infoDock;
        Grid.SetColumn(infoDockHost, 3);
        var row = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 8
        };
        row.Children.Add(chipIcon);
        row.Children.Add(chipText);
        chip.Child = row;
        detail.Child = chip;
        Grid.SetColumn(divider, 1);
        Grid.SetColumn(detail, 2);
        Children.Add(listHost);
        Children.Add(divider);
        Children.Add(detail);
        Children.Add(infoDockHost);
        Grid.SetColumnSpan(narrowChat, 4);
        Children.Add(narrowChat);
        Grid.SetColumnSpan(infoNarrow, 4);
        Children.Add(infoNarrow);
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<MainScreen>((s, _) => s.Apply());
        SizeChanged += (_, _) => Apply();
        Apply();
    }

    public RoomListPane List => list;

    public ProfilePage Profile => profilePage;

    public ThemePage ThemeScreen => themePage;

    public LanguagePage LanguageScreen => languagePage;
    public ExplorePage ExploreScreen => explorePage;
    public SettingsPage SettingsScreen => settingsPage;
    public SessionsPage SessionsScreen => sessionsPage;
    public EncryptionPage EncryptionScreen => encryptionPage;
    public SpacePage SpaceScreen => spacePage;
    public VerifyDialog Verify => verifyDialog;

    /// <summary>The chat pane beside the list.</summary>
    public ChatPane Wide => wideChat;

    /// <summary>The width of the chat list in the two-pane layout: a third of the window, between 280 and 420.</summary>
    public static double AutoSidebar(double width)
    {
        return Math.Clamp(Math.Round(width * 0.3), 280, 420);
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        var split = Bounds.Width >= SplitBreakpoint;
        verifyDialog.Update(s.Verification);
        Background = new SolidColorBrush(c.Bg);
        divider.Background = new SolidColorBrush(c.Separator);
        divider.IsVisible = split;
        detail.IsVisible = split;
        listHost.Width = split ? AutoSidebar(Bounds.Width) : Bounds.Width;
        var open = s.SelectedRoomId is not null;
        // Beside the list the chat takes the right pane; alone, it covers the list, and Back returns to it.
        narrowChat.IsVisible = !split && open;
        infoDockHost.IsVisible = split && open && s.RoomInfoOpen;
        infoDockHost.BorderBrush = new SolidColorBrush(c.Separator);
        // Narrow, the panel covers the chat; Close (or choosing another chat) returns to it.
        infoNarrow.IsVisible = !split && open && s.RoomInfoOpen;
        // The profile takes the place of the list (what opens from it is the left pane's, whatever its width).
        listHost.Child = s.SidebarPage switch {
            SidebarPage.Profile => profilePage,
            SidebarPage.Theme => themePage,
            SidebarPage.Language => languagePage,
            SidebarPage.Explore => explorePage,
            SidebarPage.Settings => settingsPage,
            SidebarPage.Sessions => sessionsPage,
            SidebarPage.Encryption => encryptionPage,
            SidebarPage.Space => spacePage,
            _ => list,
        };
        detail.Child = split && open ? wideChat : chip;
        detail.Background = new SolidColorBrush(c.ChatBg);
        chip.Background = new SolidColorBrush(c.ServiceChip);
        chipText.Foreground = new SolidColorBrush(c.ServiceChipText);
        chipIcon.Color = new SolidColorBrush(c.ServiceChipText);
        chipText.Text = Strings.T(s.Locale, "selectChat");
    }
}
