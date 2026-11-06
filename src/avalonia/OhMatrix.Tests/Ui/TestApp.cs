using Avalonia;
using Avalonia.Headless;
using Avalonia.Media;
using OhMatrix.Tests.Ui;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

namespace OhMatrix.Tests.Ui;

/// <summary>Starts Avalonia without a window system, drawing with Skia, so that controls can be rendered in a test.</summary>
public static class TestAppBuilder {
    public static AppBuilder BuildAvaloniaApp()
    {
        return AppBuilder.Configure<Application>()
            .UseSkia()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions {
                UseHeadlessDrawing = false
            });
    }
}
