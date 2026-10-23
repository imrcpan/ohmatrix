import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Dialog, fontFamily, Icon, PrimaryButton, Spinner, TextButton, TextField, useTheme } from "@ohmatrix/ui";
import { useT } from "./context.js";

/**
 * A check that runs as one field is typed in: a moment after the last key it asks `run` about the value, shows "checking" with a spinner
 * while it waits, and then either `ok` or the reason it gave. Nothing can be confirmed while it is checking or has found a problem; if the
 * check itself cannot be made (no connection), that is said and the confirmation is left to the person.
 */
export interface LiveCheck {
  /** The field to check. */
  field: number;
  /** Resolves with the reason the value cannot be used, or null when it can. */
  run(value: string): Promise<string | null>;
  checking: string;
  ok: string;
  /** Said when `run` itself failed. */
  failed: string;
}

type CheckState = { kind: "idle" } | { kind: "checking" } | { kind: "ok" } | { kind: "bad"; reason: string } | { kind: "unknown" };

/** How long after the last key the value is checked. */
const CHECK_DELAY_MS = 300;

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
  /** Starting values, one per field (e.g. the current name when editing). */
  initial?: string[] | undefined;
  /** For a form that edits something that is there: the confirm button waits until a value is different from the starting one. */
  requireChange?: boolean;
  /** Check a field live as it is typed. */
  check?: LiveCheck | undefined;
  onConfirm: (values: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const start = () => props.fields.map((_, i) => props.initial?.[i] ?? "");
  const [values, setValues] = useState<string[]>(start);
  useEffect(() => {
    if (props.visible) setValues(start());
  }, [props.visible]);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  // A reply that comes after the value changed again is not the answer to what is typed now.
  const ticket = useRef(0);
  const live = props.check ? (values[props.check.field] ?? "") : "";
  useEffect(() => {
    const check = props.check;
    const mine = ++ticket.current;
    if (!check || !props.visible || !live.trim()) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "checking" });
    const timer = setTimeout(() => {
      check.run(live).then(
        (reason) => mine === ticket.current && setState(reason ? { kind: "bad", reason } : { kind: "ok" }),
        () => mine === ticket.current && setState({ kind: "unknown" }),
      );
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `check` is a new object each render; what it asks about is the typed value
  }, [live, props.visible]);
  const [error, setError] = useState<string | null>(null);
  const filled = props.fields.every((f, i) => f.optional || (values[i] ?? "").trim());
  const changed = props.fields.some((_, i) => (values[i] ?? "").trim() !== (props.initial?.[i] ?? "").trim());
  const settled = !props.check || state.kind === "ok" || state.kind === "unknown";
  const ready = filled && (!props.requireChange || changed) && settled;
  const close = () => {
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
          multiline={!!f.multiline}
          value={values[i] ?? ""}
          onChangeText={(v) => setValues((cur) => cur.map((x, j) => (j === i ? v : x)))}
        />
      ))}
      {props.check && state.kind !== "idle" && (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 22 }}>
          {state.kind === "checking" && (
            <>
              <Spinner size={20} />
              <Text style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>{props.check.checking}</Text>
            </>
          )}
          {state.kind === "ok" && (
            <>
              <Icon name="check" size={18} color={colors.accent} strokeWidth={3} />
              <Text style={{ fontSize: 14, fontFamily, color: colors.accent }}>{props.check.ok}</Text>
            </>
          )}
          {state.kind === "bad" && (
            <>
              <Icon name="alert" size={18} color={colors.danger} />
              <Text style={{ fontSize: 14, fontFamily, color: colors.danger }}>{state.reason}</Text>
            </>
          )}
          {state.kind === "unknown" && <Text style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>{props.check.failed}</Text>}
        </View>
      )}
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
