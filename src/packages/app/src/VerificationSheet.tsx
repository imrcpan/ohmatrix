import { Text, View } from "react-native";
import type { VerificationFlow } from "@ohmatrix/core";
import { Dialog, fontFamily, PrimaryButton, Spinner, TextButton, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useT } from "./context.js";

/** The verification in progress, over everything: a request from another device, the seven pictures to compare, and the result. */
export function VerificationSheet() {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const flow = useAppState((s) => s.verification);
  const me = useAppState((s) => s.userId);
  if (!flow) return null;

  const run = (f: () => Promise<void>) => void f().catch(() => {});
  const mine = flow.userId === me;
  const who = mine ? t("verify.ownSession") : flow.userId;
  const spinner = (
    <View style={{ alignItems: "center", paddingVertical: 6 }}>
      <Spinner />
    </View>
  );
  const cancel = <TextButton title={t("cancel")} onPress={() => run(() => controller.cancelVerification())} />;
  const close = <PrimaryButton title={t("verify.close")} onPress={() => controller.dismissVerification()} />;

  const body = (f: VerificationFlow) => {
    switch (f.phase) {
      case "requested":
        return f.incoming
          ? {
              title: t("verify.request.title"),
              message: t("verify.request.body", { who: f.deviceName ? `${who} (${f.deviceName})` : who }),
              buttons: (
                <>
                  <PrimaryButton title={t("verify.accept")} onPress={() => run(() => controller.acceptVerification())} />
                  <TextButton title={t("verify.decline")} onPress={() => run(() => controller.cancelVerification())} />
                </>
              ),
            }
          : {
              title: t("verify.waiting.title"),
              message: t("verify.waiting.body", { who }),
              buttons: (
                <>
                  {spinner}
                  {cancel}
                </>
              ),
            };
      case "waiting":
        return {
          title: t("verify.starting"),
          message: "",
          buttons: (
            <>
              {spinner}
              {cancel}
            </>
          ),
        };
      case "emojis":
        return {
          title: t("verify.compare.title"),
          message: t("verify.compare.body"),
          buttons: (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                {f.emojis.map((e, i) => (
                  <View key={i} style={{ width: 76, alignItems: "center", paddingVertical: 6 }}>
                    <Text style={{ fontSize: 34 }}>{e.symbol}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, fontFamily, color: colors.textSecondary }}>
                      {e.name}
                    </Text>
                  </View>
                ))}
              </View>
              <PrimaryButton title={t("verify.match")} onPress={() => run(() => controller.confirmVerification())} />
              <TextButton title={t("verify.mismatch")} danger onPress={() => run(() => controller.mismatchVerification())} />
            </>
          ),
        };
      case "done":
        return { title: t("verify.done.title"), message: t(mine ? "verify.done.own" : "verify.done.user", { who: flow.userId }), buttons: close };
      case "cancelled":
        return { title: t("verify.cancelled.title"), message: t("verify.cancelled.body"), buttons: close };
      case "failed":
        return { title: t("verify.failed.title"), message: t("verify.failed.body"), buttons: close };
    }
  };
  const b = body(flow);
  // Tapping outside does not close it: it is a step in the middle of something, and ending it is the buttons' job.
  return (
    <Dialog visible title={b.title} message={b.message} modal onClose={() => {}}>
      {b.buttons}
    </Dialog>
  );
}
