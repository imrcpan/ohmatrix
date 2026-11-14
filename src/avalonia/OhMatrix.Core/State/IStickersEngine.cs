using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>A picture to put in the pack: its name (a file name or a caption), its type, its bytes and, when known, its size in pixels.</summary>
public sealed record StickerUpload(
    string Name,
    string MimeType,
    byte[] Data,
    int? Width,
    int? Height
);

/// <summary>My own sticker pack and its groups, kept in the account so they follow me to every device (<c>StickersApi</c> of the TypeScript core).</summary>
public interface IStickersEngine {
    /// <summary>The stickers, oldest added first, and the groups as stored.</summary>
    Task<(IReadOnlyList<Sticker> Stickers, IReadOnlyList<StickerGroup> Groups)>
        Load();

    /// <summary>
    /// Uploads a picture and adds it to the pack, in group <paramref name="groupId"/> and in no other when one is given. Gives the name it was
    /// given. Refuses a kind the pack does not take (<see cref="EngineErrorCode.UnsupportedType"/>) and one over <see cref="StickerPack.MaxBytes"/>.
    /// </summary>
    Task<string> Add(StickerUpload file, string? groupId);

    /// <summary>Adds a picture that is already on the server (one of a message) to the pack, without downloading it; gives its name as <see cref="Add"/> does.</summary>
    Task<string> AddExisting(Sticker picture, string? groupId);

    /// <summary>Takes these stickers out of the pack and of the groups, in one save. Those it does not have are ignored.</summary>
    Task Remove(IReadOnlyList<string> shortcodes);

    /// <summary>Replaces my sticker groups.</summary>
    Task SetGroups(IReadOnlyList<StickerGroup> groups);

    /// <summary>Uploads a picture to be a group's cover, without adding it to the pack.</summary>
    Task<StickerIcon> UploadGroupIcon(StickerUpload file);


    /// <summary>Uploads a picture and gives its address, without adding it to the pack or sending it.</summary>
    Task<string> UploadPicture(StickerUpload file);
}
