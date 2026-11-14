#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>My sticker pack over the Matrix SDK: the pack and the groups are account data, the pictures are uploaded media, and a sticker is sent as an <c>m.sticker</c> event (<c>RustStickers</c> of the TypeScript engine).</summary>
public sealed class MatrixStickersEngine(MatrixAuthEngine auth)
    : IStickersEngine {
    private readonly SemaphoreSlim gate = new(1, 1);

    private Client Client => auth.Client ?? throw new EngineException(
        EngineErrorCode.Unauthorized,
        "Not signed in."
    );

    public async Task<(IReadOnlyList<Sticker> Stickers,
        IReadOnlyList<StickerGroup> Groups)> Load()
    {
        try {
            var client = Client;
            var pack = await client.AccountData(StickerPack.PackEvent);
            var groups = await client.AccountData(StickerPack.GroupsEvent);
            return (StickerPack.Parse(pack), StickerPack.ParseGroups(groups));
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task<string> Add(StickerUpload file, string? groupId)
    {
        var mime =
            StickerPack.Check(file.Name, file.MimeType, file.Data.Length);
        await gate.WaitAsync();
        try {
            var client = Client;
            var mxc = await client.UploadMedia(mime, file.Data, null);
            var previous = await client.AccountData(StickerPack.PackEvent);
            var stickers = StickerPack.Parse(previous).ToList();
            var code =
                StickerPack.NewShortcode(file.Name,
                    stickers.Select(s => s.Shortcode).ToHashSet());
            stickers.Add(new Sticker(code, mxc, mime, file.Width, file.Height,
                file.Data.Length));
            await client.SetAccountData(StickerPack.PackEvent,
                StickerPack.Write(previous, stickers));
            if (groupId != null) {
                var stored =
                    StickerPack.ParseGroups(
                        await client.AccountData(StickerPack.GroupsEvent));
                var shown = StickerPack.WithDefault(stored, stickers);
                var placed = StickerPack.Place(shown, code, groupId);
                await client.SetAccountData(StickerPack.GroupsEvent,
                    StickerPack.WriteGroups(placed));
            }

            return code;
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        } finally {
            gate.Release();
        }
    }

    public async Task<string> AddExisting(Sticker picture, string? groupId)
    {
        await gate.WaitAsync();
        try {
            var client = Client;
            var previous = await client.AccountData(StickerPack.PackEvent);
            var stickers = StickerPack.Parse(previous).ToList();
            var code = StickerPack.NewShortcode(picture.Shortcode,
                stickers.Select(s => s.Shortcode).ToHashSet());
            stickers.Add(picture with {
                Shortcode = code
            });
            await client.SetAccountData(StickerPack.PackEvent,
                StickerPack.Write(previous, stickers));
            if (groupId != null) {
                var stored =
                    StickerPack.ParseGroups(
                        await client.AccountData(StickerPack.GroupsEvent));
                var placed =
                    StickerPack.Place(StickerPack.WithDefault(stored, stickers),
                        code, groupId);
                await client.SetAccountData(StickerPack.GroupsEvent,
                    StickerPack.WriteGroups(placed));
            }

            return code;
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        } finally {
            gate.Release();
        }
    }

    public async Task Remove(IReadOnlyList<string> shortcodes)
    {
        await gate.WaitAsync();
        try {
            var client = Client;
            var previous = await client.AccountData(StickerPack.PackEvent);
            var gone = shortcodes.ToHashSet();
            var kept = StickerPack.Parse(previous)
                .Where(s => !gone.Contains(s.Shortcode)).ToList();
            await client.SetAccountData(StickerPack.PackEvent,
                StickerPack.Write(previous, kept));
            var stored =
                StickerPack.ParseGroups(
                    await client.AccountData(StickerPack.GroupsEvent));
            if (stored.Count > 0)
                await client.SetAccountData(StickerPack.GroupsEvent,
                    StickerPack.WriteGroups(
                        StickerPack.Without(stored, shortcodes)));
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        } finally {
            gate.Release();
        }
    }

    public async Task SetGroups(IReadOnlyList<StickerGroup> groups)
    {
        var content = StickerPack.WriteGroups(groups);
        try {
            await Client.SetAccountData(StickerPack.GroupsEvent, content);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task<StickerIcon> UploadGroupIcon(StickerUpload file)
    {
        var mime =
            StickerPack.Check(file.Name, file.MimeType, file.Data.Length);
        try {
            var mxc = await Client.UploadMedia(mime, file.Data, null);
            return StickerIcon.OfImage(mxc, mime);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task<string> UploadPicture(StickerUpload file)
    {
        var mime =
            StickerPack.Check(file.Name, file.MimeType, file.Data.Length);
        try {
            return await Client.UploadMedia(mime, file.Data, null);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task SendPicture(string roomId, Sticker picture)
    {
        try {
            var room = Client.GetRoom(roomId) ?? throw new EngineException(
                EngineErrorCode.NotFound, "No such room.");
            await room.SendRaw("m.sticker",
                StickerPack.EventContent(picture).ToJsonString());
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task Send(string roomId, string shortcode)
    {
        try {
            var client = Client;
            var sticker = StickerPack
                              .Parse(await client.AccountData(StickerPack
                                  .PackEvent))
                              .FirstOrDefault(s => s.Shortcode == shortcode) ??
                          throw new EngineException(
                              EngineErrorCode.NotFound, "No such sticker.");
            var room = client.GetRoom(roomId) ?? throw new EngineException(
                EngineErrorCode.NotFound, "No such room.");
            await room.SendRaw("m.sticker",
                StickerPack.EventContent(sticker).ToJsonString());
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }
}
#endif
