import { useRef, useState, type ComponentRef } from "react";
import { useNotice } from "./useNotice.js";
import { View } from "react-native";
import type { HistoryVisibility, JoinRule, PowerThresholds, RoomDetails } from "@ohmatrix/core";
import { Icon, Menu, useTheme, type Anchor, type IconName, type MenuItem } from "@ohmatrix/ui";
import { useController, useT } from "./context.js";
import { AddressCard, ConfirmDialog } from "./ConfirmDialog.js";
import { PromptDialog } from "./PromptDialog.js";
import { Group, Item } from "./settings/kit.js";

type T = ReturnType<typeof useT>;

/** "Admin · 100", "Moderator · 50", "Member · 0" or "Level 25" for anything in between. */
export function levelLabel(level: number, t: T): string {
  if (!Number.isFinite(level)) return t("role.admin"); // room creators (room version 12) have unlimited power
  if (level >= 100) return `${t("role.admin")} · ${level}`;
  if (level === 50) return `${t("role.moderator")} · 50`;
  if (level === 0) return `${t("role.member")} · 0`;
  return t("level.custom", { n: level });
}

/** A settings row that opens a dropdown menu under itself (like the language row in Settings). */
function MenuRow(props: { label: string; value: string; items: MenuItem[]; disabled?: boolean; icon?: IconName }) {
  const { colors } = useTheme();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [open, setOpen] = useState(false);
  const editable = !props.disabled && props.items.length > 0;
  return (
    <>
      <View ref={ref}>
        <Item
          label={props.label}
          subtitle={props.value}
          {...(props.icon ? { icon: props.icon } : {})}
          chevron={false}
          right={editable ? <Icon name="chevronDown" size={16} color={colors.textTertiary} /> : undefined}
          onPress={
            editable
              ? () =>
                  ref.current?.measureInWindow((x, y, width, height) => {
                    setAnchor({ x, y, width, height });
                    setOpen(true);
                  })
              : undefined
          }
        />
      </View>
      <Menu visible={open} anchor={anchor} alignRight onClose={() => setOpen(false)} items={props.items} />
    </>
  );
}

const JOIN_LABEL: Record<JoinRule, "join.public" | "join.invite" | "join.knock" | "join.restricted" | "join.other"> = {
  public: "join.public",
  invite: "join.invite",
  knock: "join.knock",
  restricted: "join.restricted",
  other: "join.other",
};
const HISTORY: HistoryVisibility[] = ["shared", "invited", "joined", "world_readable"];
const HISTORY_LABEL = {
  shared: "history.shared",
  invited: "history.invited",
  joined: "history.joined",
  world_readable: "history.world_readable",
} as const;

const THRESHOLDS: { key: keyof PowerThresholds; label: Parameters<T>[0] }[] = [
  { key: "sendMessages", label: "perm.sendMessages" },
  { key: "invite", label: "perm.invite" },
  { key: "kick", label: "perm.kick" },
  { key: "ban", label: "perm.ban" },
  { key: "redact", label: "perm.redact" },
  { key: "changeSettings", label: "perm.changeSettings" },
  { key: "changeLevels", label: "perm.changeLevels" },
];

/**
 * Room access, addresses and permission levels, as sections of the chat-info panel. Everyone
 * sees the current values; only people the room's power levels allow can change them.
 */
export function RoomSettingsSections(props: {
  d: RoomDetails;
  report: (e: unknown) => void;
  /** A space has no messages of its own: leave out the levels that only concern messages. */ space?: boolean;
}) {
  const { d, report } = props;
  const notice = useNotice();
  const t = useT();
  const controller = useController();
  const admin = controller.roomAdmin;
  const myPower = d.members.find((m) => m.userId === d.me)?.power ?? 0;
  const maxLevel = Number.isFinite(myPower) ? myPower : 1000;
  const canSettings = d.can.changeSettings;
  const [aliasPrompt, setAliasPrompt] = useState(false);
  const [levelPrompt, setLevelPrompt] = useState<keyof PowerThresholds | null>(null);
  // An address being made the main one, or being deleted (the first question, and then the one that warns).
  const [mainOf, setMainOf] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ alias: string; sure: boolean } | null>(null);
  const [aliasMenu, setAliasMenu] = useState<{ alias: string; anchor: Anchor } | null>(null);

  // An address of another server: it can only be unlisted here, never freed, so it gets one plain question and no warning.
  const foreign = (alias: string) => alias.split(":").slice(1).join(":") !== d.me.split(":").slice(1).join(":");
  const removeAddress = (alias: string) =>
    act(
      admin.removeAlias(d.id, alias).then((r) => {
        if (r === "unlisted" && !foreign(alias)) notice.show(t("address.remove.kept", { alias }), "error");
      }),
    );
  const act = (p: Promise<unknown>) => void p.catch(report);
  const thresholds = props.space ? THRESHOLDS.filter((x) => x.key !== "sendMessages" && x.key !== "redact") : THRESHOLDS;

  const joinItems: MenuItem[] = (["public", "invite"] as const).map((rule) => ({
    label: t(JOIN_LABEL[rule]),
    checked: d.joinRule === rule,
    onPress: () => act(admin.setJoinRule(d.id, rule)),
  }));
  const historyItems: MenuItem[] = HISTORY.map((v) => ({
    label: t(HISTORY_LABEL[v]),
    checked: d.historyVisibility === v,
    onPress: () => act(admin.setHistoryVisibility(d.id, v)),
  }));

  const levelItems = (key: keyof PowerThresholds): MenuItem[] => {
    const cur = d.levels[key];
    const presets = [0, 50, 100].filter((n) => n <= myPower);
    return [
      ...presets.map((n) => ({ label: levelLabel(n, t), checked: cur === n, onPress: () => act(admin.setThresholds(d.id, { [key]: n })) })),
      { label: t("level.customAction"), checked: !presets.includes(cur), onPress: () => setLevelPrompt(key) },
    ];
  };

  return (
    <>
      <Group title={t("access.title")} footer={t(d.joinRule === "public" ? "join.public.hint" : "join.invite.hint")}>
        <MenuRow label={t("join.title")} icon="lock" value={t(JOIN_LABEL[d.joinRule])} items={joinItems} disabled={!canSettings} />
        <MenuRow label={t("history.title")} icon="clock" value={t(HISTORY_LABEL[d.historyVisibility])} items={historyItems} disabled={!canSettings} />
      </Group>

      {(d.aliases.length > 0 || canSettings) && (
        <Group title={t("addresses.title")} footer={t("addresses.footer")}>
          {d.aliases.map((alias, i) => (
            <AnchoredPress
              key={alias}
              label={alias}
              subtitle={i === 0 ? t("address.main") : undefined}
              icon="hash"
              disabled={!canSettings}
              onOpen={(anchor) => setAliasMenu({ alias, anchor })}
            />
          ))}
          {canSettings && <Item label={t("address.add")} icon="plus" chevron={false} onPress={() => setAliasPrompt(true)} />}
        </Group>
      )}

      <Group title={t("perm.title")} footer={t("perm.footer")}>
        {thresholds.map(({ key, label }) => (
          <MenuRow
            key={key}
            label={t(label)}
            value={levelLabel(d.levels[key], t)}
            items={levelItems(key)}
            disabled={!d.can.changeRoles || d.levels[key] > myPower}
          />
        ))}
      </Group>

      <Menu
        visible={!!aliasMenu}
        anchor={aliasMenu?.anchor ?? null}
        onClose={() => setAliasMenu(null)}
        items={
          aliasMenu
            ? [
                ...(d.aliases[0] !== aliasMenu.alias
                  ? [{ label: t("address.makeMain"), icon: "hash" as const, onPress: () => setMainOf(aliasMenu.alias) }]
                  : []),
                {
                  label: foreign(aliasMenu.alias) ? t("address.unlist") : t("address.remove"),
                  icon: "trash" as const,
                  danger: true,
                  onPress: () => setDeleting({ alias: aliasMenu.alias, sure: false }),
                },
              ]
            : []
        }
      />
      <ConfirmDialog
        visible={!!mainOf}
        title={t("address.main.title")}
        message={[t("address.main.body"), d.aliases[0] && d.aliases[0] !== mainOf ? t("address.main.old", { alias: d.aliases[0] }) : ""]
          .filter(Boolean)
          .join(" ")}
        confirmLabel={t("address.main.yes")}
        onClose={() => setMainOf(null)}
        onConfirm={() => {
          const alias = mainOf;
          setMainOf(null);
          if (alias) act(admin.setMainAlias(d.id, alias));
        }}
      >
        {mainOf && <AddressCard alias={mainOf} />}
      </ConfirmDialog>
      <ConfirmDialog
        visible={!!deleting && !deleting.sure}
        title={deleting && foreign(deleting.alias) ? t("address.unlist.title") : t("address.remove.title")}
        message={
          deleting && foreign(deleting.alias) ? t("address.unlist.body", { server: deleting.alias.split(":").slice(1).join(":") }) : t("address.remove.body")
        }
        confirmLabel={deleting && foreign(deleting.alias) ? t("address.unlist") : t("address.remove")}
        onClose={() => setDeleting(null)}
        onConfirm={() => setDeleting((x) => (x ? { ...x, sure: true } : x))}
      >
        {deleting && <AddressCard alias={deleting.alias} />}
      </ConfirmDialog>
      <ConfirmDialog
        visible={!!deleting?.sure}
        modal
        title={deleting && foreign(deleting.alias) ? t("address.unlist.title2") : t("address.remove.title2")}
        warning={[
          deleting && foreign(deleting.alias) ? t("address.unlist.warn", { server: deleting.alias.split(":").slice(1).join(":") }) : t("address.remove.warn"),
          deleting && d.aliases[0] === deleting.alias
            ? t("address.remove.main", {
                next: d.aliases[1] ? t("address.remove.next", { alias: d.aliases[1] }) : t("address.remove.none"),
              })
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        confirmLabel={deleting && foreign(deleting.alias) ? t("address.unlist.yes") : t("address.remove.yes")}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const alias = deleting?.alias;
          setDeleting(null);
          if (alias) removeAddress(alias);
        }}
      >
        {deleting && <AddressCard alias={deleting.alias} />}
      </ConfirmDialog>
      <PromptDialog
        visible={aliasPrompt}
        title={t("address.add")}
        message={t("address.add.body")}
        confirmLabel={t("address.add.confirm")}
        fields={[{ label: t("address.localpart"), placeholder: "my-room" }]}
        check={{
          field: 0,
          run: async (value) => {
            const found = await admin.checkAlias(value);
            return found === "free" ? null : found === "taken" ? t("address.taken") : t("address.invalid");
          },
          checking: t("address.checking"),
          ok: t("address.available"),
          failed: t("address.check.failed"),
        }}
        onClose={() => setAliasPrompt(false)}
        onConfirm={async ([v]) => {
          try {
            await admin.addAlias(d.id, v!);
          } catch (e) {
            const code = (e as { code?: string }).code;
            throw new Error(code === "conflict" ? t("address.taken") : code === "forbidden" ? t("notAllowed") : t("address.invalid"), { cause: e });
          }
        }}
      />
      <PromptDialog
        visible={levelPrompt !== null}
        title={t("level.customAction")}
        message={t("level.custom.body", { max: maxLevel })}
        confirmLabel={t("save")}
        requireChange
        initial={[levelPrompt ? String(d.levels[levelPrompt]) : ""]}
        fields={[{ label: t("level.field") }]}
        onClose={() => setLevelPrompt(null)}
        onConfirm={async ([v]) => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0 || n > maxLevel) throw new Error(t("level.invalid", { max: maxLevel }));
          if (levelPrompt) await admin.setThresholds(d.id, { [levelPrompt]: n });
        }}
      />
    </>
  );
}

/** A row that reports where it was pressed, so a menu can open next to it. */
function AnchoredPress(props: { label: string; subtitle?: string | undefined; icon?: IconName; disabled: boolean; onOpen: (anchor: Anchor) => void }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  return (
    <View ref={ref}>
      <Item
        label={props.label}
        subtitle={props.subtitle}
        {...(props.icon ? { icon: props.icon } : {})}
        chevron={false}
        onPress={props.disabled ? undefined : () => ref.current?.measureInWindow((x, y, width, height) => props.onOpen({ x, y, width, height }))}
      />
    </View>
  );
}
