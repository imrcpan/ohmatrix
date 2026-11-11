namespace OhMatrix.Core.Ui;

/// <summary>
/// Something shown on the overlay of the window (a dialog, a menu, a viewer). It is not in the tree of the page that opened it, so a page that
/// is thrown away closes it through <see cref="Lifetime.Release"/> when it owns it. Closing by code does not call <c>OnClose</c>.
/// </summary>
public interface IOverlay {
    void Close();
}
