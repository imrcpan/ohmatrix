using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Styling;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

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
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<SkeletonBlock>((b, _) => b.Fill());
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

/// <summary>A row that stands where a chat will be while the list is arriving: as big as <see cref="RoomRow"/>, so nothing moves when the real ones come (<c>RoomRowSkeleton</c>).</summary>
public sealed class RoomRowSkeleton : Pulse {
    public RoomRowSkeleton(int index, bool compact)
    {
        Height = RoomRow.RowHeight;
        Margin = new Thickness(6, 0);
        var row = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 11,
            Margin = new Thickness(8, 7),
            VerticalAlignment = VerticalAlignment.Center,
        };
        row.Children.Add(new SkeletonBlock(44, 44, true));
        if (!compact) {
            // The lines differ a little from row to row, so the list does not look like a pattern.
            var lines = new StackPanel {
                Spacing = 9,
                VerticalAlignment = VerticalAlignment.Center
            };
            lines.Children.Add(new SkeletonBlock(90 + index * 37 % 70, 14));
            lines.Children.Add(new SkeletonBlock(140 + index * 53 % 90, 12));
            row.Children.Add(lines);
        }

        Children.Add(row);
    }
}

/// <summary>Grey bubbles where messages are still to come, pulsing together; all are other people's, and in a group each has a round avatar (<c>ChatSkeleton</c>).</summary>
public sealed class ChatSkeleton : Pulse {
    private const double BubbleHeight = 72;
    private const double Gap = 8;

    public ChatSkeleton(int count, bool avatars)
    {
        var random = new Random();
        var column = new StackPanel {
            Margin = new Thickness(12, 8, 12, 0),
            Spacing = Gap,
            VerticalAlignment = VerticalAlignment.Bottom,
        };
        for (var i = 0; i < count; i++) {
            // A bubble is 35% to 47% of the row, a little different each.
            var percent = 41 + (random.NextDouble() * 2 - 1) * 6;
            var line = new Grid {
                ColumnDefinitions =
                    new ColumnDefinitions(avatars ? "Auto,*" : "*"),
            };
            var space = new Grid {
                ColumnDefinitions =
                    new ColumnDefinitions($"{percent}*,{100 - percent}*"),
            };
            space.Children.Add(
                new SkeletonBlock(double.NaN, BubbleHeight, false, 18) {
                    HorizontalAlignment = HorizontalAlignment.Stretch,
                    VerticalAlignment = VerticalAlignment.Bottom,
                });
            if (avatars) {
                var avatar = new SkeletonBlock(32, 32, true) {
                    VerticalAlignment = VerticalAlignment.Bottom,
                    Margin = new Thickness(0, 0, 8, 0),
                };
                line.Children.Add(avatar);
                Grid.SetColumn(space, 1);
            }

            line.Children.Add(space);
            column.Children.Add(line);
        }

        Children.Add(new BottomAnchor {
            Children = {
                column
            }
        });
    }

    /// <summary>How tall <paramref name="count"/> bubbles are together.</summary>
    public static double HeightOf(int count)
    {
        return 8 + count * (BubbleHeight + Gap);
    }
}

/// <summary>Puts its child at the bottom edge, and lets what is too tall run out at the top (a column that is reversed).</summary>
public sealed class BottomAnchor : Panel {
    protected override Size MeasureOverride(Size availableSize)
    {
        var height = 0.0;
        var width = 0.0;
        foreach (var child in Children) {
            child.Measure(
                new Size(availableSize.Width, double.PositiveInfinity));
            height = Math.Max(height, child.DesiredSize.Height);
            width = Math.Max(width, child.DesiredSize.Width);
        }

        return new Size(width, double.IsInfinity(availableSize.Height)
            ? height
            : Math.Min(height, availableSize.Height));
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        foreach (var child in Children) {
            var height = child.DesiredSize.Height;
            child.Arrange(new Rect(0, finalSize.Height - height,
                finalSize.Width, height));
        }

        return finalSize;
    }
}
