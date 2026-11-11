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

        var picture = item.Image;
        if (picture != null) {
            var info = new JsonObject {
                ["mimetype"] = Ui.MimeTypes.For(picture.FileName)
            };
            var w = picture.Width;
            if (w != null)
                info["w"] = w;
            var h = picture.Height;
            if (h != null)
                info["h"] = h;
            var content = new JsonObject {
                ["msgtype"] = "m.image",
                ["body"] = picture.FileName
            };
            Source(content, picture.Source);
            content["info"] = info;
            return content;
        }

        var file = item.File;
        if (file != null) {
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
            var d = file.Duration;
            if (d != null)
                info["duration"] = (long)d.Value.TotalMilliseconds;
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
