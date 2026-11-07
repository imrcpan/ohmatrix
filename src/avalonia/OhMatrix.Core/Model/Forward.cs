using System.Text.Json.Nodes;

namespace OhMatrix.Core.Model;

/// <summary>What a forwarded message is made of (<c>forwardContent</c>).</summary>
public static class Forward {
    /// <summary>
    /// The content of an <c>m.room.message</c> that says what a message says, to send it to another room; null for what cannot be passed on (a
    /// service line, a date, a message that could not be read).
    /// </summary>
    public static JsonObject? Content(TimelineItem item)
    {
        if (item.Kind != TimelineKind.Message)
            return null;

        // A file in an encrypted room is opened with the keys the message holds (its source is their JSON); an open one by its address.
        static void Source(JsonObject content, string source)
        {
            if (source.StartsWith('{'))
                content["file"] = JsonNode.Parse(source);
            else
                content["url"] = source;
        }

        if (item.Image is { } picture) {
            var info = new JsonObject {
                ["mimetype"] = Ui.MimeTypes.For(picture.FileName)
            };
            if (picture.Width is { } w)
                info["w"] = w;
            if (picture.Height is { } h)
                info["h"] = h;
            var content = new JsonObject {
                ["msgtype"] = "m.image",
                ["body"] = picture.FileName
            };
            Source(content, picture.Source);
            content["info"] = info;
            return content;
        }

        if (item.File is { } file) {
            var type = file.Kind switch {
                FileKind.Audio => "m.audio",
                FileKind.Video => "m.video",
                _ => "m.file",
            };
            var info = new JsonObject();
            if (file.Mime.Length > 0)
                info["mimetype"] = file.Mime;
            if (file.Size > 0)
                info["size"] = file.Size;
            if (file.Duration is { } d)
                info["duration"] = (long)d.TotalMilliseconds;
            var content = new JsonObject {
                ["msgtype"] = type,
                ["body"] = file.Name
            };
            Source(content, file.Source);
            content["info"] = info;
            return content;
        }

        var text = new JsonObject {
            ["msgtype"] = "m.text",
            ["body"] = item.Body
        };
        if (!string.IsNullOrEmpty(item.FormattedBody)) {
            text["format"] = "org.matrix.custom.html";
            text["formatted_body"] = item.FormattedBody;
        }

        return text;
    }
}
