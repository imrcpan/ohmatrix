using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Account;
using OhMatrix.Core.Ui.Animations;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Chat;
using OhMatrix.Core.Ui.Overlays;
using OhMatrix.Core.Ui.Rooms;
using OhMatrix.Core.Ui.Settings;
using OhMatrix.Core.Ui.Support;

namespace OhMatrix.Core.Ui.Shell;

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
    private readonly AboutPage aboutPage;
    private readonly SettingsShell settingsShell;
    private readonly SessionsPage sessionsPage;
    private readonly AccountsPage accountsPage;
    private readonly FontPage fontPage;
    private readonly AdvancedPage advancedPage;
    private readonly LogPage logPage;
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
        FontWeight = Fonts.Normal,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Icon chipIcon = new() {
        Glyph = "chat",
        Size = 16,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly VerifyDialog verifyDialog;
    private readonly CallScreen callScreen;

    private readonly TopNotice notice;

    // The profile is a dialog: a dim backdrop (a press on it closes) and a
    // card in the middle.
    private readonly Grid profileHost = new();
    private readonly Border profileBackdrop = new();
    private readonly Border profileCard = new();
    private readonly FallWindow profileFall;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static MainScreen()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<MainScreen>((s, _) =>
            s.Apply());
    }

    public MainScreen(AppController controller)
    {
        this.controller = controller;
        list = new RoomListPane(controller);
        narrowChat =
            new ChatPane(controller, () => controller.SelectRoom(null));
        wideChat = new ChatPane(controller);
        profilePage = new ProfilePage(controller);
        themePage = new ThemePage(controller);
        infoDock = new RoomInfoPanel(controller);
        infoNarrow = new RoomInfoPanel(controller);
        languagePage = new LanguagePage(controller);
        explorePage = new ExplorePage(controller);
        settingsPage = new SettingsPage(controller);
        aboutPage = new AboutPage(controller);
        settingsShell = new SettingsShell(controller);
        sessionsPage = new SessionsPage(controller);
        accountsPage = new AccountsPage(controller);
        fontPage = new FontPage(controller);
        advancedPage = new AdvancedPage(controller);
        logPage = new LogPage(controller);
        encryptionPage = new EncryptionPage(controller);
        spacePage = new SpacePage(controller);
        verifyDialog = new VerifyDialog(controller, this);
        callScreen = new CallScreen(controller);
        // The pages are held in fields and shown one at a time, so not all
        // are in the tree: they go with the screen all the same.
        foreach (var owned in new object[] {
                     list, narrowChat, wideChat, profilePage, themePage,
                     infoDock, infoNarrow, languagePage, explorePage,
                     settingsPage, aboutPage, settingsShell, sessionsPage,
                     accountsPage, fontPage, advancedPage, logPage,
                     encryptionPage, spacePage, verifyDialog, callScreen
                 })
            Lifetime.Own(this, owned);
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
        resizer.HorizontalAlignment = HorizontalAlignment.Center;
        resizer.Margin = new Thickness(-4, 0);
        resizer.ZIndex = 5;
        resizer.Current = SidebarWidth;
        resizer.Clamp = w => Layout.ClampSidebar(w, Bounds.Width);
        resizer.Live = w => {
            live = w;
            Apply();
        };
        resizer.Commit = w => controller.SetPreferences(p => p with {
            SidebarWidth = w
        });
        Grid.SetColumn(resizer, 1);
        Grid.SetColumn(detail, 2);
        Children.Add(listHost);
        Children.Add(divider);
        Children.Add(resizer);
        Children.Add(detail);
        Children.Add(infoDockHost);
        Grid.SetColumnSpan(narrowChat, 4);
        Children.Add(narrowChat);
        Grid.SetColumnSpan(infoNarrow, 4);
        Children.Add(infoNarrow);
        // The profile is a dialog over the window, not a page of the
        // left pane: the pane keeps the list under it.
        Grid.SetColumnSpan(profileHost, 4);
        // Above the resizer, so that the dialog's backdrop takes its pointer.
        profileHost.ZIndex = 10;
        profileBackdrop.PointerPressed += (_, e) => {
            e.Handled = true;
            controller.OpenSidebarPage(SidebarPage.Chats);
        };
        profileCard.Child = profilePage;
        profileCard.CornerRadius = new CornerRadius(16);
        profileCard.ClipToBounds = true;
        profileCard.HorizontalAlignment = HorizontalAlignment.Center;
        profileCard.VerticalAlignment = VerticalAlignment.Center;
        profileHost.Children.Add(profileBackdrop);
        profileHost.Children.Add(profileCard);
        profileFall = new FallWindow(profileBackdrop, profileCard);
        profileHost.IsVisible = false;
        profileHost.Focusable = true;
        profileHost.KeyDown += (_, e) => {
            if (e.Key != Avalonia.Input.Key.Escape)
                return;
            e.Handled = true;
            controller.OpenSidebarPage(SidebarPage.Chats);
        };
        Children.Add(profileHost);
        Grid.SetColumnSpan(callScreen, 4);
        Children.Add(callScreen);
        notice = new TopNotice(controller);
        Grid.SetColumnSpan(notice, 4);
        // Above the profile dialog (10): a notice is over whatever shows.
        notice.ZIndex = 20;
        Children.Add(notice);
        Lifetime.Watch(this, controller, state => {
            if (Differs(state))
                Apply();
        });
        SizeChanged += (_, _) => Apply();
        Apply();
    }

    public RoomListPane List => list;

    public ProfilePage Profile => profilePage;

    public ThemePage ThemeScreen => themePage;

    public LanguagePage LanguageScreen => languagePage;
    public ExplorePage ExploreScreen => explorePage;
    public SettingsPage SettingsScreen => settingsPage;
    public AboutPage AboutScreen => aboutPage;
    public SettingsShell SettingsWindowContent => settingsShell;
    public SessionsPage SessionsScreen => sessionsPage;
    public AdvancedPage AdvancedScreen => advancedPage;
    public LogPage LogScreen => logPage;
    public EncryptionPage EncryptionScreen => encryptionPage;
    public SpacePage SpaceScreen => spacePage;
    public VerifyDialog Verify => verifyDialog;
    public CallScreen Call => callScreen;
    public TopNotice Notice => notice;

    /// <summary>The chat pane beside the list.</summary>
    public ChatPane Wide => wideChat;

    public ChatPane Narrow => narrowChat;

    /// <summary>The width of the chat list in the two-pane layout: a third of the window, between 280 and 420.</summary>
    public static double AutoSidebar(double width)
    {
        return Layout.AutoSidebar(width);
    }

    private double? live;
    private readonly SidebarResizer resizer = new();
    private RoomListPane? rail;

    private RoomListPane Rail()
    {
        if (rail == null) {
            rail = new RoomListPane(controller, true);
            Lifetime.Own(this, rail);
        }

        return rail;
    }

    /// <summary>The width of the chat list now: the one dragged to, the one kept, or the automatic one.</summary>
    public double SidebarWidth()
    {
        var width = Bounds.Width;
        var kept = controller.Store.Value.Prefs.SidebarWidth;
        return live ?? (kept != null
            ? Layout.ClampSidebar(kept.Value, width)
            : Layout.AutoSidebar(width));
    }

    /// <summary>The divider that can be dragged.</summary>
    public SidebarResizer Resizer => resizer;

    // The screen is laid out from these parts of the state (and from its
    // size and colours, which call Apply themselves); the store changes
    // for many other reasons.
    private VerifyFlow? seenVerification;
    private string? seenRoom;
    private bool seenInfo;
    private SidebarPage seenPage;
    private string? seenLocale;
    private double? seenWidth;
    private ColorTokens? seenColors;

    private bool Differs(AppState state)
    {
        return !ReferenceEquals(seenVerification, state.Verification) ||
               seenRoom != state.SelectedRoomId ||
               seenInfo != state.RoomInfoOpen ||
               seenPage != state.SidebarPage || seenLocale != state.Locale ||
               seenWidth != state.Prefs.SidebarWidth;
    }

    private Avalonia.Controls.Window? settingsWindow;
    private bool settingsShown;
    private bool profileBeneath;

    private Control? SettingsContent(SidebarPage page)
    {
        return page switch {
            SidebarPage.Settings => settingsPage,
            SidebarPage.Theme => themePage,
            SidebarPage.Language => languagePage,
            SidebarPage.Font => fontPage,
            SidebarPage.Advanced => advancedPage,
            SidebarPage.Sessions => sessionsPage,
            SidebarPage.Logs => logPage,
            SidebarPage.About => aboutPage,
            _ => null,
        };
    }

    // Settings and everything reached from it live in a window of their own:
    // the list of the kinds at the left, the chosen one at the right.
    private void ShowSettings(SidebarPage page, Control content)
    {
        if (settingsWindow == null) {
            var window = new Avalonia.Controls.Window {
                Title = controller.T("settings"),
                Width = 820,
                Height = 600,
                MinWidth = 640,
                MinHeight = 420,
                WindowStartupLocation = Avalonia.Controls.WindowStartupLocation
                    .CenterScreen,
                Content = settingsShell,
            };
            ThemeScope.SetColors(window, ThemeScope.GetColors(this));
            window.Closed += (_, _) => {
                window.Content = null;
                settingsWindow = null;
                if (SettingsContent(controller.Store.Value.SidebarPage) != null)
                    controller.OpenSidebarPage(profileBeneath
                        ? SidebarPage.Profile
                        : SidebarPage.Chats);
            };
            settingsWindow = window;
            Lifetime.OnRelease(this, window.Close);
            // An ordinary window: not owned, so it does not stay above the
            // main one.
            window.Show();
        }

        settingsShell.Show(page, content);
    }

    // Brings the window to the front and gives it the focus, without keeping
    // it on top: a window manager may leave Activate alone, so it is put on
    // top for a moment.
    private static void Raise(Avalonia.Controls.Window window)
    {
        if (window.WindowState == Avalonia.Controls.WindowState.Minimized)
            window.WindowState = Avalonia.Controls.WindowState.Normal;
        window.Topmost = true;
        window.Activate();
        Avalonia.Threading.Dispatcher.UIThread.Post(() => {
            window.Topmost = false;
            window.Activate();
        }, Avalonia.Threading.DispatcherPriority.Background);
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        seenVerification = s.Verification;
        seenRoom = s.SelectedRoomId;
        seenInfo = s.RoomInfoOpen;
        seenPage = s.SidebarPage;
        seenLocale = s.Locale;
        seenWidth = s.Prefs.SidebarWidth;
        var split = Bounds.Width >= SplitBreakpoint;
        verifyDialog.Update(s.Verification);
        Paint(c);
        divider.IsVisible = split;
        detail.IsVisible = split;
        var sidebar = split ? SidebarWidth() : Bounds.Width;
        listHost.Width = sidebar;
        resizer.IsVisible = split;
        var strip = split && Layout.IsRail(sidebar);
        var open = s.SelectedRoomId != null;
        // Beside the list the chat takes the right pane; alone, it covers the list, and Back returns to it.
        narrowChat.IsVisible = !split && open;
        narrowChat.Showing = narrowChat.IsVisible;
        infoDockHost.IsVisible = split && open && s.RoomInfoOpen;
        infoDock.Showing = infoDockHost.IsVisible;
        // Narrow, the panel covers the chat; Close (or choosing another chat) returns to it.
        infoNarrow.IsVisible = !split && open && s.RoomInfoOpen;
        infoNarrow.Showing = infoNarrow.IsVisible;
        // What opens from the profile is a dialog over the window, whatever
        // its width. The pages that open from it (the encryption, the
        // accounts) are pages of the dialog, not of the sidebar, and so is
        // the explore page.
        var inProfile = s.SidebarPage is SidebarPage.Profile or
            SidebarPage.Encryption or SidebarPage.Accounts or
            SidebarPage.Explore;
        var inSettings = SettingsContent(s.SidebarPage);
        // Settings open in their own window and leave the dialog as it is.
        if (inSettings == null)
            profileBeneath = inProfile;
        var profileOpen = inProfile || (inSettings != null && profileBeneath);
        if (inProfile)
            profileCard.Child = s.SidebarPage switch {
                SidebarPage.Encryption => encryptionPage,
                SidebarPage.Accounts => accountsPage,
                SidebarPage.Explore => explorePage,
                _ => profilePage,
            };
        if (profileOpen) {
            if (!profileHost.IsVisible)
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    profileHost.Focus());
            profileHost.IsVisible = true;
            profileFall.Open(Bounds.Height, ProfileContent());
        } else if (profileHost.IsVisible)
            profileFall.Close(() => profileHost.IsVisible = false);

        profileBackdrop.Background = new SolidColorBrush(c.Overlay);
        profileCard.Background = new SolidColorBrush(c.Bg);
        // The explore page is the width of the window, and its margin to the
        // edges is the one it has above and below (24).
        if (s.SidebarPage == SidebarPage.Explore) {
            profileCard.Width = Math.Max(280, Bounds.Width - 48);
            profileCard.Height = Math.Max(320, Bounds.Height - 48);
        } else {
            profileCard.Width = Math.Max(280, Math.Min(440, Bounds.Width - 32));
            profileCard.Height =
                Math.Max(320, Math.Min(640, Bounds.Height - 48));
        }

        // Other pages (the profile, say) open over the chats and leave the
        // settings window as it is; it closes on its own close button.
        if (inSettings != null) {
            var wasOpen = settingsWindow != null;
            ShowSettings(s.SidebarPage, inSettings);
            if (wasOpen && !settingsShown && settingsWindow != null)
                Raise(settingsWindow);
        }

        settingsShown = inSettings != null;
        if (settingsWindow != null)
            ThemeScope.SetColors(settingsWindow, c);
        listHost.Child = s.SidebarPage switch {
            SidebarPage.Space => spacePage,
            _ => strip ? Rail() : list,
        };
        detail.Child = split && open ? wideChat : chip;
        wideChat.Showing = split && open;
        chipText.Text = Strings.T(s.Locale, "selectChat");
    }

    // The pages in the dialog, as its items: they come in one after the other.
    private IReadOnlyList<Control> ProfileContent() =>
        profileCard.Child is Panel page ? [.. page.Children] : [];

    // The brushes are made again only when the colours are other ones.
    private void Paint(ColorTokens c)
    {
        if (Equals(seenColors, c))
            return;
        seenColors = c;
        Background = new SolidColorBrush(c.Bg);
        divider.Background = new SolidColorBrush(c.Separator);
        infoDockHost.BorderBrush = new SolidColorBrush(c.Separator);
        detail.Background = new SolidColorBrush(c.ChatBg);
        chip.Background = new SolidColorBrush(c.ServiceChip);
        chipText.Foreground = new SolidColorBrush(c.ServiceChipText);
        chipIcon.Color = new SolidColorBrush(c.ServiceChipText);
    }
}
