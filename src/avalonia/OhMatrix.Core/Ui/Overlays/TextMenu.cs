using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui.Overlays;

/// <summary>
/// The right-click menu of a text field: the menu of the app (the surface, the radius and the shadow of the other menus), not the white one
/// of the theme. Cut and Copy are there with a selection, Paste is always there, Select all when there is text.
/// </summary>
public static class TextMenu {
    /// <summary>Gives <paramref name="box"/> the menu of the app in place of its own.</summary>
    public static Menu Attach(TextBox box, AppController controller)
    {
        var menu = new Menu {
            Width = 180
        };
        // The request of the context menu is taken on the way down (tunnel),
        // so the field's own menu, the white one, is never asked for.
        box.AddHandler(InputElement.ContextRequestedEvent,
            (object? _, ContextRequestedEventArgs e) => {
                e.Handled = true;
                Open(box, controller, menu);
            }, RoutingStrategies.Tunnel, true);
        return menu;
    }

    private static void Open(TextBox box, AppController controller, Menu menu)
    {
        if (TopLevel.GetTopLevel(box) is not { } window)
            return;
        box.Focus();
        var items = new List<MenuItem>();
        var selected = box.SelectionEnd != box.SelectionStart;
        if (selected && !box.IsReadOnly)
            items.Add(new MenuItem(controller.T("edit.cut"), box.Cut));
        if (selected)
            items.Add(new MenuItem(controller.T("copy"), box.Copy));
        if (!box.IsReadOnly)
            items.Add(new MenuItem(controller.T("edit.paste"), box.Paste));
        if (!string.IsNullOrEmpty(box.Text))
            items.Add(new MenuItem(controller.T("edit.selectAll"),
                box.SelectAll));
        if (items.Count == 0)
            return;
        menu.Show(box, window, items);
    }
}
