using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The sign-in and account creation page (<c>LoginScreen</c> of the React Native app): the logo with the name and what the page is for, the
/// homeserver, username and password fields (with the confirmation and the registration token when creating), the error in the words of the language,
/// the language menu at the bottom right and the zoom menu at the bottom left.
/// </summary>
public sealed class LoginScreen : Grid {
    private static readonly double[] Scales = [
        0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3
    ];

    private readonly AppController controller;
    private readonly (string Label, Action OnPress)? back;
    private readonly TimeProvider time;

    private readonly Border logoCircle = new() {
        Width = 84,
        Height = 84,
        CornerRadius = new CornerRadius(42),
    };

    private readonly TextBlock title = new() {
        FontSize = 28,
        FontWeight = FontWeight.Bold,
        FontFamily = Fonts.System,
    };

    private readonly TextBlock subtitle = new() {
        FontSize = 18,
        FontWeight = FontWeight.SemiBold,
        FontFamily = Fonts.System,
    };

    private readonly TextField homeserver = new() {
        Glyph = "globe"
    };

    private readonly TextField username = new() {
        Glyph = "user"
    };

    private readonly TextField password = new() {
        Glyph = "lock"
    };

    private readonly TextField confirm = new() {
        Glyph = "lock"
    };

    private readonly TextField token = new() {
        Glyph = "key"
    };

    private readonly TextBlock mismatchText = MakeNote();
    private readonly TextBlock errorText = MakeNote();
    private readonly PrimaryButton submitButton = new();
    private readonly TextButton toggleButton = new();
    private readonly TextButton backButton = new();
    private readonly CornerButton languageButton = new();

    private readonly CornerButton zoomButton = new() {
        Glyph = "zoomIn"
    };

    private readonly Menu languageMenu = new() {
        Up = true,
        AlignRight = true
    };

    private readonly Menu zoomMenu = new() {
        Up = true
    };

    private readonly Dialog zoomDialog = new() {
        Modal = true
    };

    private readonly PrimaryButton keepButton = new();
    private readonly TextButton revertButton = new();

    private readonly DispatcherTimer countdown = new() {
        Interval = TimeSpan.FromMilliseconds(250)
    };

    private bool creating;
    private string? revealLocale;

    /// <param name="defaultHomeserver">What the homeserver field holds when none was used before.</param>
    /// <param name="back">Another account to go to, with the label of its button; null when there is none.</param>
    public LoginScreen(
        AppController controller,
        string defaultHomeserver,
        (string Label, Action OnPress)? back = null,
        TimeProvider? time = null
    )
    {
        this.controller = controller;
        this.back = back;
        this.time = time ?? TimeProvider.System;
        homeserver.Text = controller.Store.Value.Prefs.LastHomeserver is { Length: > 0 } last
            ? last
            : defaultHomeserver;
        Build();
        foreach (var f in new[] {
                     homeserver, username, password, confirm, token
                 })
            f.TextChanged += (_, _) => Apply();
        password.Submit += (_, _) => {
            if (!creating)
                Submit();
        };
        confirm.Submit += (_, _) => Submit();
        token.Submit += (_, _) => Submit();
        submitButton.Click += (_, _) => Submit();
        toggleButton.Click += (_, _) => Toggle();
        backButton.Click += (_, _) => this.back?.OnPress();
        languageButton.Click += (_, _) => OpenLanguages();
        zoomButton.Click += (_, _) => OpenZooms();
        keepButton.Click += (_, _) => controller.KeepZoom();
        revertButton.Click += (_, _) => controller.RevertZoom();
        zoomDialog.OnClose = controller.RevertZoom;
        countdown.Tick += (_, _) => ShowZoomTrial();
        controller.Store.Changed += OnStateChanged;
        ThemeScope.ColorsProperty.Changed.AddClassHandler<LoginScreen>((s, _) => s.Apply());
        Apply();
    }

    public TextField HomeserverField => homeserver;
    public TextField UsernameField => username;
    public TextField PasswordField => password;
    public TextField ConfirmField => confirm;
    public TextField TokenField => token;
    public PrimaryButton SubmitButton => submitButton;
    public TextButton ToggleButton => toggleButton;
    public CornerButton LanguageButton => languageButton;
    public CornerButton ZoomButton => zoomButton;
    public Menu LanguageMenu => languageMenu;
    public Menu ZoomMenu => zoomMenu;
    public Dialog ZoomDialog => zoomDialog;
    public bool Creating => creating;

    /// <summary>The error as the screen words it, or null.</summary>
    public string? ErrorMessage => errorText.IsVisible ? errorText.Text : null;

    public bool Mismatch => mismatchText.IsVisible;

    private static TextBlock MakeNote()
    {
        return new TextBlock {
            FontSize = 14,
            FontFamily = Fonts.System,
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            IsVisible = false,
        };
    }

    private void Build()
    {
        var head = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*"),
            Margin = new Thickness(0, 0, 0, 28),
        };
        logoCircle.Child = new Icon {
            Glyph = "chat",
            Size = 42,
            StrokeWidth = 1.8,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        var words = new StackPanel {
            Spacing = 4,
            Margin = new Thickness(16, 0, 0, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        words.Children.Add(title);
        words.Children.Add(subtitle);
        Grid.SetColumn(words, 1);
        head.Children.Add(logoCircle);
        head.Children.Add(words);

        submitButton.Margin = new Thickness(0, 4, 0, 0);
        var form = new StackPanel {
            Spacing = 16,
            MaxWidth = 380,
            HorizontalAlignment = HorizontalAlignment.Stretch,
        };
        foreach (var c in new Control[] {
                     head, homeserver, username, password, confirm, token, mismatchText, errorText,
                     submitButton, toggleButton, backButton,
                 })
            form.Children.Add(c);

        var page = new Border {
            Padding = new Thickness(24, 24, 24, 24 + 104),
            Child = form
        };
        var scroller = new ScrollViewer {
            Content = page,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
            VerticalAlignment = VerticalAlignment.Stretch,
        };
        form.VerticalAlignment = VerticalAlignment.Center;
        Children.Add(scroller);

        languageButton.HorizontalAlignment = HorizontalAlignment.Right;
        languageButton.VerticalAlignment = VerticalAlignment.Bottom;
        languageButton.Margin = new Thickness(0, 0, 16, 16);
        zoomButton.HorizontalAlignment = HorizontalAlignment.Left;
        zoomButton.VerticalAlignment = VerticalAlignment.Bottom;
        zoomButton.Margin = new Thickness(16, 0, 0, 16);
        Children.Add(languageButton);
        Children.Add(zoomButton);
    }

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    private bool Busy => controller.Store.Value.Auth == AuthStatus.SigningIn;

    private bool Mismatched => creating && confirm.Text.Length > 0 && confirm.Text != password.Text;

    private bool Ready =>
        homeserver.Text.Trim().Length > 0 && username.Text.Trim().Length > 0 &&
        password.Text.Length > 0 && (!creating || (confirm.Text.Length > 0 && !Mismatched));

    /// <summary>The words for what went wrong, in the language of the person; the network stack's own text is never shown for a network error.</summary>
    private string? WordedError()
    {
        var s = controller.Store.Value;
        if (string.IsNullOrEmpty(s.AuthError))
            return null;
        var code = s.AuthErrorCode;
        if (code == EngineErrorCode.Network)
            return T("login.network", ("server", homeserver.Text.Trim()));
        if (creating) {
            return code switch {
                EngineErrorCode.TokenRequired => T("register.tokenNeeded"),
                EngineErrorCode.TokenInvalid => T("register.tokenWrong"),
                EngineErrorCode.Conflict => T("register.taken"),
                EngineErrorCode.Forbidden => T("register.closed"),
                EngineErrorCode.Unsupported => T("register.unsupported"),
                _ => s.AuthError,
            };
        }

        return code switch {
            EngineErrorCode.Forbidden or EngineErrorCode.Unauthorized => T("login.rejected"),
            EngineErrorCode.Conflict => T("login.exists"),
            _ => s.AuthError,
        };
    }

    private void Submit()
    {
        if (!Ready || Busy)
            return;
        var server = homeserver.Text.Trim();
        var name = username.Text.Trim();
        if (creating) {
            var t = token.Text.Trim();
            _ = controller.Register(server, name, password.Text, t.Length > 0 ? t : null);
        } else
            _ = controller.Login(server, name, password.Text);
    }

    private void Toggle()
    {
        creating = !creating;
        confirm.Text = "";
        token.Text = "";
        Apply();
    }

    private void OnStateChanged(AppState state)
    {
        Apply();
        ShowZoomTrial();
    }

    private void OpenLanguages()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var locale = controller.Store.Value.Locale;
        var items = Strings.Languages
            .Select(l => new MenuItem(
                l.Label,
                () => controller.SetPreferences(p => p with {
                    Locale = l.Id
                }),
                Checked: l.Id == locale
            ))
            .ToList();
        languageMenu.Show(languageButton, window, items);
    }

    private void OpenZooms()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var scale = controller.Store.Value.Prefs.UiScale;
        var items = Scales
            .Select(v => new MenuItem(
                $"{Math.Round(v * 100)}%",
                () => controller.TryZoom(v),
                Checked: v == scale
            ))
            .ToList();
        zoomMenu.Show(zoomButton, window, items);
    }

    /// <summary>Opens the confirmation while a zoom is being tried, counts it down, and closes it when the trial is over.</summary>
    private void ShowZoomTrial()
    {
        var trial = controller.Store.Value.ZoomTrial;
        if (trial is null) {
            countdown.Stop();
            zoomDialog.Close();
            return;
        }

        var left = Math.Max(0, (int)Math.Ceiling((trial.Until - time.GetUtcNow()).TotalSeconds));
        var message = T(
            "zoom.confirm.body",
            ("n", left.ToString()),
            ("from", $"{Math.Round(trial.From * 100)}%")
        );
        if (zoomDialog.IsOpen) {
            zoomDialog.SetMessage(message);
            return;
        }

        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        keepButton.Title = T("zoom.confirm.keep");
        revertButton.Title = T("zoom.confirm.revert");
        zoomDialog.Show(
            window,
            ThemeScope.GetColors(this),
            T("zoom.confirm.title"),
            message,
            keepButton,
            revertButton
        );
        countdown.Start();
    }

    /// <summary>Sets texts, colours and what is visible from the state and the fields.</summary>
    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        logoCircle.Background = new SolidColorBrush(c.Accent);
        ((Icon)logoCircle.Child!).Color = new SolidColorBrush(c.OnAccent);
        title.Foreground = new SolidColorBrush(c.Text);
        subtitle.Foreground = new SolidColorBrush(c.Text);
        mismatchText.Foreground = new SolidColorBrush(c.Danger);
        errorText.Foreground = new SolidColorBrush(c.Danger);

        title.Text = T("welcome.title");
        subtitle.Text = creating ? T("register.title") : T("welcome.subtitle");
        homeserver.Label = T("homeserver");
        username.Label = T("username");
        password.Label = T("password");
        confirm.Label = T("register.confirm");
        // Setting the reveal button hides the text again, so only when its labels change.
        if (revealLocale != s.Locale) {
            revealLocale = s.Locale;
            password.Reveal = (T("password.show"), T("password.hide"));
            confirm.Reveal = (T("password.show"), T("password.hide"));
        }

        token.Label = T("register.token");
        confirm.IsVisible = creating;
        token.IsVisible = creating;

        mismatchText.Text = T("register.mismatch");
        mismatchText.IsVisible = Mismatched;
        errorText.Text = WordedError();
        errorText.IsVisible = !string.IsNullOrEmpty(errorText.Text);

        submitButton.Title = creating ? T("register.submit") : T("signIn");
        submitButton.Loading = Busy;
        submitButton.Disabled = !Ready;
        toggleButton.Title = creating ? T("register.back") : T("register.toggle");
        backButton.IsVisible = back is not null && !Busy;
        backButton.Title = back?.Label ?? "";

        var language = Strings.Languages.FirstOrDefault(l => l.Id == s.Locale)
                       ?? Strings.Languages[0];
        languageButton.Text = language.Label;
        languageButton.Description = T("language");
        zoomButton.Text = $"{Math.Round(s.Prefs.UiScale * 100)}%";
        zoomButton.Description = T("zoom");
    }
}
