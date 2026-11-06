using Avalonia.Controls;
using Avalonia.Platform.Storage;

namespace OhMatrix.Core.Ui;

/// <summary>The system dialog to choose a file.</summary>
public static class FilePicker {
    /// <summary>Asks for one picture; the path of the file, or null when none was chosen or the system has no dialog.</summary>
    public static async Task<string?> PickImage(TopLevel window)
    {
        var provider = window.StorageProvider;
        if (!provider.CanOpen)
            return null;
        var files = await provider.OpenFilePickerAsync(new FilePickerOpenOptions {
            AllowMultiple = false,
            FileTypeFilter = [FilePickerFileTypes.ImageAll],
        });
        return files.Count == 0 ? null : files[0].TryGetLocalPath();
    }
}
