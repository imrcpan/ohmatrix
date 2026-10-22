import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Dialog, PrimaryButton, TextButton, TextField, fontFamily, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useServices, useT } from "./context.js";

/** Encryption onboarding: create keys (new accounts) or unlock history with the recovery key (new devices). */
export function SecuritySheet(props: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const controller = useController();
  const state = useAppState((s) => s.security);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  const services = useServices();

  const close = () => {
    setInput("");
    setError(null);
    setSavedKey(null);
    setCopied(false);
    setSure(false);
    props.onClose();
  };
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyKey = () => {
    if (!savedKey) return;
    const nav = (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator;
    const write = services.copyText ?? nav?.clipboard?.writeText.bind(nav.clipboard);
    void write?.(savedKey).then(
      () => setCopied(true),
      () => {},
    );
  };

  if (savedKey) {
    // Only "I have saved it", and then its confirmation, end this: tapping outside the card does nothing, and copying does not close it.
    return (
      <>
        <Dialog visible={props.visible && !sure} title={t("sec.saved.title")} message={t("sec.saved.body")} modal onClose={() => {}}>
          <View style={{ backgroundColor: colors.bgSecondary, borderRadius: 10, padding: 12 }}>
            <Text selectable style={{ fontSize: 16, lineHeight: 24, fontFamily, color: colors.text, textAlign: "center", letterSpacing: 0.5 }}>
              {savedKey}
            </Text>
          </View>
          <PrimaryButton title={copied ? t("copied") : t("sec.copy")} onPress={copyKey} />
          <Pressable
            accessibilityRole="button"
            onPress={() => setSure(true)}
            style={({ pressed }) => ({
              height: 50,
              borderRadius: 14,
              backgroundColor: pressed ? colors.separator : colors.bgSecondary,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Text style={{ fontSize: 17, fontWeight: "600", fontFamily, color: colors.text }}>{t("sec.done")}</Text>
          </Pressable>
        </Dialog>
        <Dialog visible={props.visible && sure} title={t("sec.confirm.title")} message={t("sec.confirm.body")} onClose={() => setSure(false)}>
          <PrimaryButton title={t("sec.confirm.yes")} onPress={close} />
          <TextButton title={t("sec.confirm.back")} onPress={() => setSure(false)} />
        </Dialog>
      </>
    );
  }

  const setup = state === "needs_setup";
  return (
    <Dialog
      visible={props.visible}
      title={t(setup ? "sec.setup.title" : "sec.recovery.title")}
      message={t(setup ? "sec.setup.body" : "sec.recovery.body")}
      onClose={close}
    >
      <TextField
        label={t(setup ? "password" : "sec.recoveryKey")}
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
        autoCorrect={false}
        {...(setup ? { secureTextEntry: true, revealLabels: { show: t("password.show"), hide: t("password.hide") } } : {})}
        textContentType={setup ? "password" : "none"}
      />
      {!!error && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{error}</Text>}
      <PrimaryButton
        title={t(setup ? "sec.action.setup" : "sec.action.verify")}
        loading={busy}
        disabled={!input.trim()}
        onPress={() =>
          void run(async () => {
            if (setup) setSavedKey(await controller.setUpEncryption(input));
            else {
              await controller.restoreWithRecoveryKey(input);
              close();
            }
          })
        }
      />
      {/* Another session of mine, already verified, can hand the keys over by comparing pictures: no key to type. */}
      {!setup && controller.canVerify && (
        <TextButton
          title={t("verify.session")}
          onPress={() => {
            close();
            void controller.verifySession().catch(() => {});
          }}
        />
      )}
      <TextButton title={t("cancel")} onPress={close} />
    </Dialog>
  );
}
