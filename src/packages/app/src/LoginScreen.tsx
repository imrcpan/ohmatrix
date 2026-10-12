import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Icon, PrimaryButton, TextField, fontFamily, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useT } from "./context.js";

export function LoginScreen(props: { defaultHomeserver: string }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const busy = useAppState((s) => s.auth === "signingIn");
  const rawError = useAppState((s) => s.authError);
  const errorCode = useAppState((s) => s.authErrorCode);
  const [homeserver, setHomeserver] = useState(props.defaultHomeserver);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Technical messages from the network stack ("NetworkError when attempting to fetch resource", a blocked CORS request for a
  // host that does not exist...) all mean the same to the user: the address cannot be reached.
  const error = !rawError
    ? null
    : errorCode === "network"
      ? t("login.network", { server: homeserver.trim() })
      : errorCode === "forbidden" || errorCode === "unauthorized"
        ? t("login.rejected")
        : rawError;
  const ready = !!homeserver.trim() && !!username.trim() && !!password;
  const submit = () => {
    if (ready && !busy) void controller.login(homeserver.trim(), username.trim(), password);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: "100%", maxWidth: 380, gap: 16 }}>
          <View style={{ alignItems: "center", gap: 10, marginBottom: 12 }}>
            <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Icon name="chat" size={52} strokeWidth={1.8} color={colors.onAccent} />
            </View>
            <Text style={{ fontSize: 30, fontWeight: "700", fontFamily, color: colors.text, marginTop: 8 }}>{t("welcome.title")}</Text>
            <Text style={{ fontSize: 16, fontFamily, color: colors.textSecondary, textAlign: "center" }}>{t("welcome.subtitle")}</Text>
          </View>
          <TextField label={t("homeserver")} value={homeserver} onChangeText={setHomeserver} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <TextField label={t("username")} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} textContentType="username" />
          <TextField label={t("password")} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" onSubmitEditing={submit} />
          {!!error && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{error}</Text>}
          <View style={{ marginTop: 4 }}>
            <PrimaryButton title={t("signIn")} onPress={submit} loading={busy} disabled={!ready} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
