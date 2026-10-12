import { useState } from "react";
import { Text, View } from "react-native";
import { Dialog, PrimaryButton, TextButton, TextField, fontFamily, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useT } from "./context.js";

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

  const close = () => {
    setInput("");
    setError(null);
    setSavedKey(null);
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

  if (savedKey) {
    return (
      <Dialog visible={props.visible} title={t("sec.saved.title")} message={t("sec.saved.body")} onClose={() => {}}>
        <View style={{ backgroundColor: colors.bgSecondary, borderRadius: 10, padding: 12 }}>
          <Text selectable style={{ fontSize: 16, lineHeight: 24, fontFamily, color: colors.text, textAlign: "center", letterSpacing: 0.5 }}>
            {savedKey}
          </Text>
        </View>
        <PrimaryButton title={t("sec.done")} onPress={close} />
      </Dialog>
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
        secureTextEntry={setup}
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
      <TextButton title={t("cancel")} onPress={close} />
    </Dialog>
  );
}
