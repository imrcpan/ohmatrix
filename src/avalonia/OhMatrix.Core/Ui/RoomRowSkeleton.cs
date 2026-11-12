using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;

namespace OhMatrix.Core.Ui;

/// <summary>A row that stands where a chat will be while the list is arriving: as big as <see cref="RoomRow"/>, so nothing moves when the real ones come (<c>RoomRowSkeleton</c>).</summary>
public sealed class RoomRowSkeleton : Pulse {
    public RoomRowSkeleton(int index, bool compact)
    {
        Height = RoomRow.RowHeight;
        Margin = new Thickness(6, 0);
        var row = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*"),
            Margin = new Thickness(8, 7),
            VerticalAlignment = VerticalAlignment.Center,
        };
        row.Children.Add(new SkeletonBlock(44, 44, true));
        if (!compact) {
            // The lines differ a little from row to row, so the list does not look like a pattern.
            var lines = new StackPanel {
                Spacing = 8,
                Margin = new Thickness(11, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            // The title with the time at the other end.
            var title = new Grid {
                ColumnDefinitions = new ColumnDefinitions("*,Auto")
            };
            title.Children.Add(new SkeletonBlock(90 + index * 37 % 70, 14));
            var time = new SkeletonBlock(30, 11) {
                HorizontalAlignment = HorizontalAlignment.Right
            };
            Grid.SetColumn(time, 1);
            title.Children.Add(time);
            lines.Children.Add(title);
            // As wide as it is, and no wider than the place there is.
            var preview = new Grid {
                ColumnDefinitions = new ColumnDefinitions("1000*,*")
            };
            preview.ColumnDefinitions[0].MaxWidth = 140 + index * 53 % 90;
            preview.Children.Add(new SkeletonBlock(double.NaN, 12) {
                HorizontalAlignment = HorizontalAlignment.Stretch
            });
            lines.Children.Add(preview);
            Grid.SetColumn(lines, 1);
            row.Children.Add(lines);
        }

        Children.Add(row);
    }
}
