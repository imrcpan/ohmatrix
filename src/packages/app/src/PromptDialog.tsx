import { useState } from "react";
import { Text } from "react-native";
import { Dialog, fontFamily, PrimaryButton, TextButton, TextField, useTheme } from "@ohmatrix/ui";
import { useT } from "./context.js";

export interface PromptField {
  label: string;
  placeholder?: string;
  optional?: boolean;
  multiline?: boolean;
}

/** Small form dialog: text fields, a confirm action that may fail (error shown inline), and cancel. */
export function PromptDialog(props: {
  visible: boolean;
  title: string;
  message: string;
  fields: PromptField[];
  confirmLabel: string;
  onConfirm: (values: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const [values, setValues] = useState<string[]>(() => props.fields.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = props.fields.every((f, i) => f.optional || (values[i] ?? "").trim());
  const close = () => {
    setValues(props.fields.map(() => ""));
    setError(null);
    props.onClose();
  };

  return (
    <Dialog visible={props.visible} title={props.title} message={props.message} onClose={close}>
      {props.fields.map((f, i) => (
        <TextField
          key={f.label}
          label={f.label}
          placeholder={f.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          value={values[i] ?? ""}
          onChangeText={(v) => setValues((cur) => cur.map((x, j) => (j === i ? v : x)))}
        />
      ))}
      {!!error && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{error}</Text>}
      <PrimaryButton
        title={props.confirmLabel}
        loading={busy}
        disabled={!ready}
        onPress={() => {
          setBusy(true);
          setError(null);
          props
            .onConfirm(values)
            .then(close, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }}
      />
      <TextButton title={t("cancel")} onPress={close} />
    </Dialog>
  );
}
