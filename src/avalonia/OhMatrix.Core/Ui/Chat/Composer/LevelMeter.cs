using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace OhMatrix.Core.Ui.Chat.Composer;

/// <summary>The loudness of a recording as bars, the newest at the right: 3 wide and 2 apart, 3 to 31 high, in the accent colour.</summary>
public sealed class LevelMeter : Control {
    private const int Bars = 40;
    private const double Tall = 32;
    private readonly List<double> levels = [];

    public LevelMeter()
    {
        Height = Tall;
        Width = Bars * 5 - 2;
        ClipToBounds = true;
    }

    /// <summary>The colour of the bars.</summary>
    public IBrush? Color { get; set; }

    public void Clear()
    {
        levels.Clear();
        InvalidateVisual();
    }

    /// <summary>Adds the loudness now, from 0 (silence) to 1.</summary>
    public void Add(double level)
    {
        levels.Add(level);
        if (levels.Count > Bars)
            levels.RemoveAt(0);
        InvalidateVisual();
    }

    public override void Render(DrawingContext context)
    {
        if (Color == null)
            return;
        var x = Bounds.Width;
        for (var i = levels.Count - 1; i >= 0; i--) {
            x -= 3;
            if (x < -3)
                break;
            var h = Math.Max(3, Math.Round(levels[i] * (Tall - 1)));
            context.DrawRectangle(Color, null,
                new RoundedRect(new Rect(x, (Bounds.Height - h) / 2, 3, h),
                    1.5));
            x -= 2;
        }
    }
}
