namespace OhMatrix.Core.State;

/// <summary>A message to tell the person of: the chat it came in, the title and the text (empty when the text is not to be shown).</summary>
public sealed record Notification(
    string RoomId,
    string Title,
    string Body,
    bool RoomIsOpen);

/// <summary>Tells the person of something through the system (a notification of the desktop); the system decides how it looks.</summary>
public interface INotifier {
    void Notify(Notification notification);
}
