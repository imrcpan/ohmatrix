import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Dialog, PrimaryButton, TextButton, TextField, fontFamily, useTheme } from "@ohmatrix/ui";
import { useController, useServices, useT } from "./context.js";
import { useNotice } from "./useNotice.js";

/** The shortest passphrase the file is made with: the file can be copied to anywhere, so a guessable one is no protection. */
const MIN_PASSPHRASE = 8;
export const KEYS_FILE_NAME = "ohmatrix-keys.txt";

/** Asks for a passphrase (twice), makes the key export file with it and saves the file. */
export function ExportKeysDialog(props: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const services = useServices();
  const notice = useNotice();
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (props.visible) {
      setPassphrase("");
      setRepeat("");
      setError(null);
      setCopied(false);
    }
  }, [props.visible]);

  const mismatch = !!repeat && repeat !== passphrase;
  const ready = passphrase.length >= MIN_PASSPHRASE && passphrase === repeat && !busy;

  /** The export as the passphrase made it: the same text the file holds, so copying it is no less safe than saving it. */
  const exportText = async (): Promise<string | null> => {
    setBusy(true);
    setError(null);
    try {
      return await controller.exportEncryptionKeys(passphrase);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const text = await exportText();
    if (text === null) return;
    const nav = (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator;
    const write = services.copyText ?? nav?.clipboard?.writeText.bind(nav.clipboard);
    await write?.(text).then(
      () => setCopied(true),
      () => setError(t("keys.copy.failed")),
    );
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const text = await controller.exportEncryptionKeys(passphrase);
      const url = URL.createObjectURL(new File([text], KEYS_FILE_NAME, { type: "text/plain" }));
      try {
        await services.saveFile?.({ url, name: KEYS_FILE_NAME });
      } finally {
        URL.revokeObjectURL(url);
      }
      props.onClose();
      notice.show(t("keys.exported"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog visible={props.visible} title={t("keys.export.title")} message={t("keys.export.body")} onClose={props.onClose} modal={busy}>
      <TextField
        label={t("keys.passphrase")}
        autoCapitalize="none"
        autoCorrect={false}
        value={passphrase}
        onChangeText={setPassphrase}
        secureTextEntry
        revealLabels={{ show: t("password.show"), hide: t("password.hide") }}
      />
      <TextField
        label={t("keys.passphrase.repeat")}
        autoCapitalize="none"
        autoCorrect={false}
        value={repeat}
        onChangeText={setRepeat}
        secureTextEntry
        revealLabels={{ show: t("password.show"), hide: t("password.hide") }}
      />
      {(mismatch || (!!passphrase && passphrase.length < MIN_PASSPHRASE)) && (
        <Text style={{ color: colors.textSecondary, fontSize: 14, fontFamily, textAlign: "center" }}>
          {mismatch ? t("keys.passphrase.mismatch") : t("keys.passphrase.short", { n: MIN_PASSPHRASE })}
        </Text>
      )}
      {!!error && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{error}</Text>}
      <PrimaryButton title={t("keys.export.button")} loading={busy} disabled={!ready} onPress={() => void save()} />
      <TextButton title={copied ? t("copied") : t("keys.copy")} onPress={() => void copy()} />
      <TextButton title={t("cancel")} onPress={props.onClose} />
    </Dialog>
  );
}
