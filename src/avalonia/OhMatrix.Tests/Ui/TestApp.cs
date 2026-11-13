using Avalonia;
using Avalonia.Headless;
using OhMatrix.Core.Ui.Animations;
using OhMatrix.Tests.Ui;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

namespace OhMatrix.Tests.Ui;

/// <summary>
/// The application of the tests: the same styles as the app, and no motion. A test looks at where a change ends, so a change is made at once;
/// the tests of the motion itself turn it on for as long as they run.
/// </summary>
public sealed class TestApp : Application {
    public override void Initialize()
    {
        OhMatrix.Core.AppStyles.Apply(this);
        Motion.Enabled = false;
    }
}

/// <summary>Starts Avalonia without a window system, drawing with Skia, so that controls can be rendered in a test.</summary>
public static class TestAppBuilder {
    public static AppBuilder BuildAvaloniaApp()
    {
        return AppBuilder.Configure<TestApp>()
            .UseSkia()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions {
                UseHeadlessDrawing = false
            });
    }
}
