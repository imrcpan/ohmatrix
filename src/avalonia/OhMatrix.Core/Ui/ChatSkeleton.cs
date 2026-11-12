using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;

namespace OhMatrix.Core.Ui;

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
