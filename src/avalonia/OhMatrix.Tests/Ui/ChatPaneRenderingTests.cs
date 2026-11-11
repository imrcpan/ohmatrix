using System.Collections;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;
using Avalonia.VisualTree;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public partial class ChatPaneTests {
    private static TimelineItem[] RenderingMessages(int count, int start = 0,
        bool varied = false)
    {
        return Enumerable.Range(start, count).Select(i => new TimelineItem {
            Id = $"m{i}",
            EventId = $"$m{i}",
            Body = $"Message {i} " + (varied
                ? string.Join(" ",
                    Enumerable.Repeat("wrapped words", i % 9 * 8))
                : "with rich text"),
            FormattedBody = varied
                ? null
                : $"<p><strong>Message {i}</strong> with rich text</p>",
            SenderId = i % 2 == 0 ? "@alice:localhost" : "@bob:localhost",
            SenderName = i % 2 == 0 ? "Alice" : "Bob",
            Ts = Now + i * 60_000L,
        }).ToArray();
    }

    private static (Window Window, AppController Controller, ChatPane Pane)
        OpenTimeline(IReadOnlyList<TimelineItem> items,
            RoomDetails? details = null)
    {
        var engine = new Engine();
        var controller = new AppController(engine, new NoSessions(),
            rooms: engine, chats: engine, media: new Media());
        controller.Store.Update(s => s with {
            Auth = AuthStatus.SignedIn,
            UserId = "@me:localhost",
            SyncState = SyncState.Syncing,
            Rooms = [
                new RoomSummary {
                    Id = "!rendering:localhost",
                    Name = "Rendering",
                    MemberCount = 3
                }
            ],
            RoomsSettled = true,
            SelectedRoomId = "!rendering:localhost",
            Timeline = items,
            TimelineReady = true,
            Details = details,
            Prefs = s.Prefs with {
                Locale = "en"
            },
        });
        var pane = new ChatPane(controller);
        var window = new Window {
            Content = pane,
            Width = 760,
            Height = 640
        };
        ThemeScope.SetColors(window, Themes.Get("light")!.Colors);
        window.Show();
        LayoutTimeline(window);
        return (window, controller, pane);
    }

    private static void LayoutTimeline(Window window)
    {
        for (var i = 0; i < 3; i++) {
            Dispatcher.UIThread.RunJobs();
            window.UpdateLayout();
        }
    }

    private static Bubble TimelineBubble(ChatPane pane, int index)
    {
        var container = pane.Messages.ContainerFromIndex(index);
        Assert.NotNull(container);
        return Assert.Single(container.GetVisualDescendants().OfType<Bubble>());
    }

    private static SelectableTextBlock ParsedBody(Bubble bubble)
    {
        return Assert.Single(bubble.GetVisualDescendants()
            .OfType<SelectableTextBlock>());
    }

    private static IEnumerable<Run> BodyRuns(IEnumerable<Inline> inlines)
    {
        foreach (var inline in inlines) {
            if (inline is Run run)
                yield return run;
            if (inline is Span span) {
                foreach (var nested in BodyRuns(span.Inlines))
                    yield return nested;
            }
        }
    }

    private static ScrollViewer TimelineScroller(ChatPane pane)
    {
        return pane.Messages.GetVisualAncestors().OfType<ScrollViewer>()
            .First();
    }

    private static (string Id, double Y) VisibleAnchor(ChatPane pane,
        IReadOnlyList<TimelineItem> items)
    {
        var scroller = TimelineScroller(pane);
        var visible = pane.Messages.GetRealizedContainers()
            .Select(c => (Control: c,
                Index: pane.Messages.IndexFromContainer(c),
                Y: c.TranslatePoint(default, scroller)?.Y ?? double.NaN))
            .Where(c => c.Index >= 0 && c.Index < items.Count &&
                        c.Y < scroller.Viewport.Height &&
                        c.Y + c.Control.Bounds.Height > 0)
            .OrderBy(c => c.Y).First();
        return (items[visible.Index].Id, visible.Y);
    }

    private static bool AtTimelineEnd(ChatPane pane)
    {
        var scroll = TimelineScroller(pane);
        return scroll.Extent.Height - scroll.Viewport.Height - scroll.Offset.Y
               <= 3;
    }

    [AvaloniaFact]
    public void Five_thousand_messages_only_realize_near_the_viewport()
    {
        var (window, _, pane) = OpenTimeline(RenderingMessages(5000));
        try {
            foreach (var id in new[] {
                         "m4999", "m2500", "m0", "m4999"
                     }) {
                Assert.True(pane.ScrollToMessage(id));
                LayoutTimeline(window);
                Assert.InRange(pane.Messages.GetVisualDescendants()
                    .OfType<Bubble>().Count(), 1, 200);
                Assert.InRange(pane.Messages.GetRealizedContainers().Count(),
                    1, 200);
            }

            Assert.True(pane.ScrollToMessage("m0"));
            LayoutTimeline(window);
            Assert.Null(pane.Messages.ContainerFromIndex(4999));
            Assert.False(pane.ScrollToMessage("missing"));
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public async Task Cloned_snapshots_retain_visible_bubbles_runs_and_images()
    {
        var items = RenderingMessages(500);
        items[^1] = items[^1] with {
            Image = new ImageAttachment("mxc://localhost/retained", 300, 150,
                "retained.png"),
            ReadBy = ["@reader:localhost"],
            Reactions = [new ReactionCount("thumbs-up", 2, false)]
        };
        var (window, controller, pane) = OpenTimeline(items);
        try {
            Assert.True(pane.ScrollToMessage(items[^1].Id));
            LayoutTimeline(window);
            var visible = pane.Messages.GetRealizedContainers().ToDictionary(
                c => pane.Messages.IndexFromContainer(c),
                c => Assert.Single(c.GetVisualDescendants().OfType<Bubble>()));
            var bubble = TimelineBubble(pane, items.Length - 1);
            var body = ParsedBody(bubble);
            var run = BodyRuns(body.Inlines!).First();
            var image = Assert.Single(bubble.GetVisualDescendants()
                .OfType<Image>());
            for (var i = 0; i < 20 && image.Source == null; i++) {
                await Task.Delay(10);
                LayoutTimeline(window);
            }

            Assert.NotNull(image.Source);
            var source = image.Source;
            var snapshot = items.Select(i => i with {
                ReadBy = i.ReadBy.ToArray(),
                Reactions = i.Reactions.Select(r => r with {
                }).ToArray(),
            }).ToArray();
            snapshot[0] = snapshot[0] with {
                Body = "Edited outside the viewport",
                FormattedBody = null
            };
            controller.Store.Update(s => s with {
                Timeline = snapshot
            });
            LayoutTimeline(window);
            foreach (var (index, original) in visible)
                Assert.Same(original, TimelineBubble(pane, index));
            Assert.Same(body, ParsedBody(bubble));
            Assert.Same(run, BodyRuns(body.Inlines!).First());
            Assert.Same(image, Assert.Single(bubble.GetVisualDescendants()
                .OfType<Image>()));
            Assert.Same(source, image.Source);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Delivery_receipts_and_reactions_preserve_the_parsed_body()
    {
        var item = RenderingMessages(1)[0] with {
            IsOwn = true,
            SenderId = "@me:localhost",
            Sending = true
        };
        var (window, controller, pane) = OpenTimeline([item]);
        try {
            var bubble = TimelineBubble(pane, 0);
            var body = ParsedBody(bubble);
            var run = BodyRuns(body.Inlines!).First();
            item = item with {
                Sending = false,
                Edited = true,
                Read = true,
                ReadBy = ["@reader:localhost"],
                Reactions = [new ReactionCount("thumbs-up", 3, true)]
            };
            controller.Store.Update(s => s with {
                Timeline = [item]
            });
            LayoutTimeline(window);
            Assert.Same(bubble, TimelineBubble(pane, 0));
            Assert.Same(body, ParsedBody(bubble));
            Assert.Same(run, BodyRuns(body.Inlines!).First());
            Assert.Contains(bubble.GetVisualDescendants().OfType<Icon>(),
                icon => icon.Glyph == "checks");
            var labels = pane.Messages.GetVisualDescendants()
                .OfType<TextBlock>()
                .Select(t => t.Text).ToArray();
            Assert.Contains("thumbs-up", labels);
            Assert.Contains("3", labels);
            Assert.Contains(labels, text => text != null &&
                                            text.Contains(
                                                OhMatrix.Core.I18n.Strings.T(
                                                    "en", "edited")));
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Resize_theme_font_and_selection_keep_rich_text_identity()
    {
        var items = RenderingMessages(4);
        var (window, controller, pane) = OpenTimeline(items);
        try {
            var bubble = TimelineBubble(pane, 3);
            var body = ParsedBody(bubble);
            var run = BodyRuns(body.Inlines!).First();
            body.SelectionStart = 1;
            body.SelectionEnd = 4;
            window.Width = 520;
            LayoutTimeline(window);
            ThemeScope.SetColors(window, Themes.Get("dark")!.Colors);
            controller.SetPreferences(p => p with {
                Font = "monospace"
            });
            pane.StartSelect(items[3]);
            LayoutTimeline(window);
            Assert.Same(bubble, TimelineBubble(pane, 3));
            Assert.Same(body, ParsedBody(bubble));
            Assert.Same(run, BodyRuns(body.Inlines!).First());
            Assert.Equal(1, body.SelectionStart);
            Assert.Equal(4, body.SelectionEnd);
            Assert.Equal(Fonts.System, body.FontFamily);
            Assert.Contains(items[3].Id, pane.Chosen);
            pane.CancelSelect();
            Assert.Same(body, ParsedBody(TimelineBubble(pane, 3)));
        } finally {
            Fonts.Use(null);
            window.Close();
        }
    }

    private sealed class CountedMembers(RoomMemberInfo[] members)
        : IReadOnlyList<RoomMemberInfo> {
        public int Reads;
        public int Count => members.Length;

        public RoomMemberInfo this[int index] {
            get {
                Reads++;
                return members[index];
            }
        }

        public IEnumerator<RoomMemberInfo> GetEnumerator()
        {
            for (var i = 0; i < Count; i++)
                yield return this[i];
        }

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    [AvaloniaFact]
    public async Task Reader_names_are_indexed_once_per_member_snapshot()
    {
        var members = new CountedMembers(Enumerable.Range(0, 1500)
            .Select(i => new RoomMemberInfo($"@reader{i}:localhost",
                $"Reader {i}",
                null, MemberRole.Member)).ToArray());
        var details = await new Engine().Details("!rendering:localhost");
        details = details with {
            Members = members
        };
        var items = RenderingMessages(400).Select(i => i with {
            IsOwn = true,
            SenderId = "@me:localhost",
            Read = true,
            ReadBy = ["@reader1499:localhost", "@reader1498:localhost"],
        }).ToArray();
        var (window, controller, pane) = OpenTimeline(items, details);
        try {
            Assert.InRange(members.Reads, 1500, 6000);
            members.Reads = 0;
            controller.Store.Update(s => s with {
                Timeline = items.Select(i => i with {
                    ReadBy = i.ReadBy.ToArray()
                }).ToArray()
            });
            LayoutTimeline(window);
            Assert.Equal(0, members.Reads);
            var renamed = new CountedMembers(members.Select(m => m with {
                Name = "Updated " + m.Name
            }).ToArray());
            controller.Store.Update(s => s with {
                Details = details with {
                    Members = renamed
                }
            });
            LayoutTimeline(window);
            Assert.InRange(renamed.Reads, 1500, 6000);
            var bubble = TimelineBubble(pane, items.Length - 1);
            var tips = bubble.GetVisualDescendants().OfType<Control>()
                .Prepend(bubble).Select(ToolTip.GetTip).OfType<string>();
            Assert.Contains(tips, tip => tip.Contains("Updated Reader 1499"));
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Prepending_variable_height_history_keeps_the_visible_anchor()
    {
        var items = RenderingMessages(600, 1000, varied: true);
        var (window, controller, pane) = OpenTimeline(items);
        try {
            Assert.True(pane.ScrollToMessage("m1300"));
            LayoutTimeline(window);
            var anchor = VisibleAnchor(pane, items);
            var prepended = RenderingMessages(80, 920, varied: true)
                .Concat(items).ToArray();
            controller.Store.Update(s => s with {
                Timeline = prepended
            });
            LayoutTimeline(window);
            var after = VisibleAnchor(pane, prepended);
            Assert.Equal(anchor.Id, after.Id);
            Assert.InRange(Math.Abs(anchor.Y - after.Y), 0, 2);
            Assert.InRange(pane.Messages.GetRealizedContainers().Count(),
                1, 200);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Appends_follow_the_bottom_without_moving_a_scrolled_reader()
    {
        var items = RenderingMessages(300);
        var (window, controller, pane) = OpenTimeline(items);
        try {
            Assert.True(AtTimelineEnd(pane));
            var appended = items.Concat(RenderingMessages(1, 300)).ToArray();
            controller.Store.Update(s => s with {
                Timeline = appended
            });
            LayoutTimeline(window);
            Assert.True(AtTimelineEnd(pane));
            Assert.False(pane.ScrollToLatest.IsVisible);
            Assert.True(pane.ScrollToMessage("m120"));
            LayoutTimeline(window);
            var anchor = VisibleAnchor(pane, appended);
            Assert.True(pane.ScrollToLatest.IsVisible);
            var another = appended.Concat(RenderingMessages(1, 301)).ToArray();
            controller.Store.Update(s => s with {
                Timeline = another
            });
            LayoutTimeline(window);
            var after = VisibleAnchor(pane, another);
            Assert.Equal(anchor.Id, after.Id);
            Assert.InRange(Math.Abs(anchor.Y - after.Y), 0, 2);
            Assert.Equal(1, pane.NewWhileAway);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public async Task Offscreen_reveal_search_and_pins_realize_their_targets()
    {
        var items = RenderingMessages(500);
        var (window, controller, pane) = OpenTimeline(items);
        try {
            Assert.Null(pane.Messages.ContainerFromIndex(10));
            await pane.Reveal("$m10");
            LayoutTimeline(window);
            Assert.NotNull(pane.Messages.ContainerFromIndex(10));
            Assert.Null(controller.Store.Value.Notice);
            pane.ToggleSearch();
            pane.SearchInput.Text = "Message 210 ";
            LayoutTimeline(window);
            Assert.NotNull(pane.Messages.ContainerFromIndex(210));
            controller.Store.Update(s => s with {
                Rooms = [
                    s.Rooms[0] with {
                        PinnedEventIds = ["$m420"]
                    }
                ]
            });
            pane.JumpToPinned();
            LayoutTimeline(window);
            Assert.NotNull(pane.Messages.ContainerFromIndex(420));
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Offscreen_chosen_messages_keep_selection_when_realized_again()
    {
        var items = RenderingMessages(500);
        var (window, _, pane) = OpenTimeline(items);
        try {
            Assert.True(pane.ScrollToMessage("m120"));
            LayoutTimeline(window);
            pane.StartSelect(items[120]);
            Assert.True(pane.ScrollToMessage("m499"));
            LayoutTimeline(window);
            Assert.Null(pane.Messages.ContainerFromIndex(120));
            Assert.Contains("m120", pane.Chosen);
            Assert.True(pane.ScrollToMessage("m120"));
            LayoutTimeline(window);
            var container = pane.Messages.ContainerFromIndex(120);
            Assert.NotNull(container);
            Assert.Contains(container.GetVisualDescendants().OfType<Icon>(),
                icon => icon.Glyph == "check");
            pane.ToggleChosen("m120");
            LayoutTimeline(window);
            Assert.DoesNotContain(
                container.GetVisualDescendants().OfType<Icon>(),
                icon => icon.IsVisible && icon.Glyph == "check");
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void
        Visible_edits_replace_only_changed_content_and_regroup_neighbors()
    {
        var items = RenderingMessages(3).Select(i => i with {
            SenderId = "@alice:localhost",
            SenderName = "Alice"
        }).ToArray();
        var (window, controller, pane) = OpenTimeline(items);
        try {
            var first = TimelineBubble(pane, 0);
            var second = TimelineBubble(pane, 1);
            var third = TimelineBubble(pane, 2);
            var joinedCorners = first.CornerRadius;
            var split = RenderingMessages(1, 10)[0] with {
                SenderId = "@bob:localhost",
                SenderName = "Bob"
            };
            controller.Store.Update(s => s with {
                Timeline = [items[0], split, items[1], items[2]]
            });
            LayoutTimeline(window);
            Assert.Same(first, TimelineBubble(pane, 0));
            Assert.Same(second, TimelineBubble(pane, 2));
            Assert.NotEqual(joinedCorners, first.CornerRadius);
            items[1] = items[1] with {
                Body = "Edited content",
                FormattedBody = "<b>Edited content</b>"
            };
            controller.Store.Update(s => s with {
                Timeline = items
            });
            LayoutTimeline(window);
            Assert.Same(first, TimelineBubble(pane, 0));
            Assert.Same(third, TimelineBubble(pane, 2));
            Assert.NotSame(second, TimelineBubble(pane, 1));
            Assert.Equal(joinedCorners, first.CornerRadius);
            items[1] = items[1] with {
                Kind = TimelineKind.Service,
                Body = "Message removed"
            };
            controller.Store.Update(s => s with {
                Timeline = items.ToArray()
            });
            LayoutTimeline(window);
            Assert.Empty(pane.Messages.ContainerFromIndex(1)!
                .GetVisualDescendants().OfType<Bubble>());
            Assert.Same(first, TimelineBubble(pane, 0));
            Assert.Same(third, TimelineBubble(pane, 2));
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void A_new_scroll_wins_over_queued_anchor_restoration()
    {
        var items = RenderingMessages(500);
        var (window, controller, pane) = OpenTimeline(items);
        try {
            pane.ScrollToMessage("m250");
            LayoutTimeline(window);
            controller.Store.Update(s => s with {
                Timeline = items.Select(i => i with {
                }).ToArray()
            });
            var scroller = TimelineScroller(pane);
            scroller.Offset = new Vector(0, scroller.Offset.Y - 160);
            window.UpdateLayout();
            var moved = VisibleAnchor(pane, items);
            LayoutTimeline(window);
            var after = VisibleAnchor(pane, items);
            Assert.Equal(moved.Id, after.Id);
            Assert.InRange(Math.Abs(moved.Y - after.Y), 0, 2);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public async Task Changing_rooms_cancels_only_the_lookup_notice()
    {
        var (window, controller, pane) = OpenTimeline(RenderingMessages(30));
        try {
            var lookup = pane.Reveal("$not-loaded");
            Assert.Equal(NoticeKind.Progress,
                controller.Store.Value.Notice?.Kind);
            controller.Store.Update(s => s with {
                SelectedRoomId = "!another:localhost",
                Timeline = []
            });
            Assert.Null(controller.Store.Value.Notice);
            controller.ShowNotice("A newer notice", NoticeKind.Progress);
            var newer = controller.Store.Value.Notice;
            await lookup;
            Assert.Same(newer, controller.Store.Value.Notice);
        } finally {
            window.Close();
        }
    }
}
