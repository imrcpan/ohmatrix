using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Styling;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>Everything inside pulses together between 55% and full, the way the rows of the chat list do while it is arriving (<c>Pulse</c>).</summary>
public class Pulse : Panel {
    private CancellationTokenSource? running;

    protected override void OnAttachedToVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        running = new CancellationTokenSource();
        var animation = new Animation {
            Duration = TimeSpan.FromMilliseconds(800),
            IterationCount = IterationCount.Infinite,
            PlaybackDirection = PlaybackDirection.Alternate,
            Easing = new QuadraticEaseInOut(),
            Children = {
                new KeyFrame {
                    Cue = new Cue(0),
                    Setters = {
                        new Setter(OpacityProperty, 0.55)
                    }
                },
                new KeyFrame {
                    Cue = new Cue(1),
                    Setters = {
                        new Setter(OpacityProperty, 1.0)
                    }
                },
            },
        };
        _ = animation.RunAsync(this, running.Token);
    }

    protected override void OnDetachedFromVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        running?.Cancel();
        running?.Dispose();
        running = null;
    }
}

/// <summary>A grey shape where something is still to come: a circle, or a bar with rounded ends (<c>SkeletonBlock</c>).</summary>
public sealed class SkeletonBlock : Border {
    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static SkeletonBlock()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<SkeletonBlock>((b, _) => b.Fill());
    }

    public SkeletonBlock(double width, double height, bool circle = false,
        double radius = 0)
    {
        Width = width;
        Height = height;
        CornerRadius = new CornerRadius(
            circle ? height / 2 :
            radius > 0 ? radius : Math.Min(6, height / 2));
        HorizontalAlignment = HorizontalAlignment.Left;
        VerticalAlignment = VerticalAlignment.Center;
        Fill();
    }

    protected override void OnAttachedToVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Fill();
    }

    private void Fill()
    {
        Background = new SolidColorBrush(ThemeScope.GetColors(this).Hover);
    }
}
