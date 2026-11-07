using Avalonia;
using Avalonia.Headless;
using OhMatrix.Tests.Ui;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

namespace OhMatrix.Tests.Ui;

/// <summary>The application of the tests: the same styles as the app.</summary>
public sealed class TestApp : Application {
    public override void Initialize()
    {
        OhMatrix.Core.AppStyles.Apply(this);
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
