#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Model;
using OhMatrix.Engine;
using Xunit;

namespace OhMatrix.Tests.Engine;

// Against a real homeserver: set OHMATRIX_TEST_HOMESERVER (a test server with the user test / 123456, open registration with no steps).
public class MatrixAuthEngineTests {
    private static string Server()
    {
        var url = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(url), "OHMATRIX_TEST_HOMESERVER is not set");
        return url!;
    }

    private static string Data()
    {
        return Path.Combine(Path.GetTempPath(), "ohm-engine-" + Guid.NewGuid().ToString("N"));
    }

    [Fact]
    public async Task Signs_in_restores_and_signs_out()
    {
        var server = Server();
        var dir = Data();
        var engine = new MatrixAuthEngine(dir);
        var session = await engine.LoginWithPassword(server, "test", "123456");
        Assert.StartsWith("@test:", session.UserId);
        Assert.NotNull(engine.Client);

        var again = new MatrixAuthEngine(dir);
        await again.Restore(session);
        Assert.Equal(session.UserId, again.Client!.UserId());
        await again.Logout();
        Assert.Null(again.Client);
    }

    [Fact]
    public async Task A_wrong_password_is_forbidden()
    {
        var engine = new MatrixAuthEngine(Data());
        var e = await Assert.ThrowsAsync<EngineException>(() =>
            engine.LoginWithPassword(Server(), "test", "wrong")
        );
        Assert.Equal(EngineErrorCode.Forbidden, e.Code);
    }

    [Fact]
    public async Task An_unreachable_server_is_a_network_error()
    {
        var engine = new MatrixAuthEngine(Data());
        var e = await Assert.ThrowsAsync<EngineException>(() =>
            engine.LoginWithPassword("http://127.0.0.1:1", "test", "123456")
        );
        Assert.Equal(EngineErrorCode.Network, e.Code);
    }

    [Fact]
    public async Task Registers_a_new_account_and_a_taken_name_conflicts()
    {
        var server = Server();
        var name = "u" + Guid.NewGuid().ToString("N")[..12];
        var session =
            await new MatrixAuthEngine(Data()).Register(server, name, "pw-12345678", null);
        Assert.StartsWith("@" + name + ":", session.UserId);
        var e = await Assert.ThrowsAsync<EngineException>(() =>
            new MatrixAuthEngine(Data()).Register(server, name, "pw-12345678", null)
        );
        Assert.Equal(EngineErrorCode.Conflict, e.Code);
    }
}
#endif
