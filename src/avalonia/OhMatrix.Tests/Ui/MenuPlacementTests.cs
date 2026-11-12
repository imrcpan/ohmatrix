using OhMatrix.Core.Ui.Overlays;
using Xunit;

namespace OhMatrix.Tests.Ui;

// The cases of menuPlace.test.ts.
public class MenuPlacementTests {
    private const double MinTop = 48;
    private const double BottomLimit = 760;

    private static MenuPlace Place(double y, double height, double content,
        bool up)
    {
        return MenuPlacement.Place(y, height, content, up, MinTop, BottomLimit);
    }

    [Fact]
    public void A_menu_that_fits_goes_where_it_was_asked_to()
    {
        Assert.Equal(new MenuPlace(146, 200, false),
            Place(100, 40, 200, false));
        Assert.Equal(new MenuPlace(394, 200, false), Place(600, 40, 200, true));
    }

    [Fact]
    public void
        A_menu_that_does_not_fit_on_its_side_goes_to_the_other_if_it_fits_there()
    {
        Assert.Equal(new MenuPlace(294, 300, false),
            Place(600, 40, 300, false));
        Assert.Equal(new MenuPlace(126, 300, false), Place(80, 40, 300, true));
    }

    [Fact]
    public void
        A_menu_taller_than_either_side_is_cut_to_the_roomier_one_and_scrolls()
    {
        var m = MenuPlacement.Place(480, 36, 504, true, 48, 520, 6);
        Assert.True(m.Scrolls);
        Assert.True(m.Top >= 48);
        Assert.True(m.Top + m.Height <= 480 - 6 + 0.001);
        Assert.Equal(480 - 6 - 48, m.Height);
    }

    [Fact]
    public void It_never_goes_under_the_title_bar_or_past_the_bottom()
    {
        foreach (var up in new[] {
                     true, false
                 }) {
            foreach (var y in new double[] {
                         0, 30, 200, 500, 700, 790
                     }) {
                foreach (var content in new double[] {
                             60, 250, 504, 900
                         }) {
                    var m = Place(y, 36, content, up);
                    var label = $"{up} {y} {content}";
                    Assert.True(m.Top >= MinTop, label);
                    Assert.True(
                        m.Top + m.Height <=
                        Math.Max(BottomLimit, MinTop + m.Height),
                        label
                    );
                    Assert.True(m.Height <= content, label);
                }
            }
        }
    }
}
