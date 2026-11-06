using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Layout;
using OhMatrix.Core;

namespace OhMatrix.Desktop;

public class App : Application {
    public override void Initialize()
    {
        AppStyles.Apply(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop) {
            desktop.MainWindow = new Window {
                Title = "OhMatrix",
                Width = 800,
                Height = 600,
                Content = new TextBlock {
                    Text = "OhMatrix",
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                }
            };
        }

        base.OnFrameworkInitializationCompleted();
    }
}
