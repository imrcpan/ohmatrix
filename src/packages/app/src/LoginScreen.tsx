import { useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Icon, Menu, PrimaryButton, TextButton, TextField, fontFamily, useTheme, type Anchor } from "@ohmatrix/ui";
import { useAppState, useController, useLocale, useT } from "./context.js";
import { LANGUAGES } from "./languages.js";

/** `back`: another account to go to (this screen is for adding one, or for an account that could not start), with the button's label. */
export function LoginScreen(props: { defaultHomeserver: string; back?: { label: string; onPress(): void } | undefined }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const busy = useAppState((s) => s.auth === "signingIn");
  const rawError = useAppState((s) => s.authError);
  const errorCode = useAppState((s) => s.authErrorCode);
  // The server used last time, if any; otherwise the app's default.
  const lastHomeserver = useAppState((s) => s.prefs.lastHomeserver);
  const [homeserver, setHomeserver] = useState(lastHomeserver || props.defaultHomeserver);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const locale = useLocale();
  const langRef = useRef<ComponentRef<typeof View>>(null);
  const [langAnchor, setLangAnchor] = useState<Anchor | null>(null);
  const [langMenu, setLangMenu] = useState(false);
  const language = LANGUAGES.find((l) => l.id === locale) ?? LANGUAGES[0];
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState("");
  // Technical messages from the network stack ("NetworkError when attempting to fetch resource", a blocked CORS request for a
  // host that does not exist...) all mean the same to the user: the address cannot be reached.
  const error = !rawError
    ? null
    : errorCode === "network"
      ? t("login.network", { server: homeserver.trim() })
      : creating
        ? errorCode === "conflict"
          ? t("register.taken")
          : errorCode === "forbidden"
            ? t("register.closed")
            : errorCode === "unsupported"
              ? t("register.unsupported")
              : rawError
        : errorCode === "forbidden" || errorCode === "unauthorized"
          ? t("login.rejected")
          : errorCode === "conflict"
            ? t("login.exists")
            : rawError;
  const mismatch = creating && !!confirm && confirm !== password;
  const ready = !!homeserver.trim() && !!username.trim() && !!password && (!creating || (!!confirm && !mismatch));
  const submit = () => {
    if (!ready || busy) return;
    if (creating) void controller.register(homeserver.trim(), username.trim(), password);
    else void controller.login(homeserver.trim(), username.trim(), password);
  };
  const toggle = () => {
    setCreating((v) => !v);
    setConfirm("");
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
            <Text style={{ fontSize: 16, fontFamily, color: colors.textSecondary, textAlign: "center" }}>
              {creating ? t("register.title") : t("welcome.subtitle")}
            </Text>
          </View>
          <TextField label={t("homeserver")} value={homeserver} onChangeText={setHomeserver} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <TextField label={t("username")} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} textContentType="username" />
          <TextField
            label={t("password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={creating ? "newPassword" : "password"}
            onSubmitEditing={creating ? undefined : submit}
          />
          {creating && (
            <TextField
              label={t("register.confirm")}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              textContentType="newPassword"
              onSubmitEditing={submit}
            />
          )}
          {mismatch && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{t("register.mismatch")}</Text>}
          {!!error && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{error}</Text>}
          <View style={{ marginTop: 4 }}>
            <PrimaryButton title={creating ? t("register.submit") : t("signIn")} onPress={submit} loading={busy} disabled={!ready} />
          </View>
          <TextButton title={creating ? t("register.back") : t("register.toggle")} onPress={toggle} />
          {props.back && !busy && <TextButton title={props.back.label} onPress={props.back.onPress} />}
        </View>
      </ScrollView>
      {/* The language, at the bottom right: a borderless name and arrow that opens a menu upwards. */}
      <View ref={langRef} style={{ position: "absolute", right: 16, bottom: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("language")}
          onPress={() =>
            langRef.current?.measureInWindow((x, y, width, height) => {
              setLangAnchor({ x, y, width, height });
              setLangMenu(true);
            })
          }
          style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            height: 36,
            paddingHorizontal: 10,
            borderRadius: 10,
            backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
          })}
        >
          <Text style={{ fontSize: 15, fontFamily, color: colors.textSecondary }}>{language.label}</Text>
          <Icon name="chevronDown" size={16} color={colors.textTertiary} />
        </Pressable>
      </View>
      <Menu
        visible={langMenu}
        anchor={langAnchor}
        alignRight
        up
        onClose={() => setLangMenu(false)}
        items={LANGUAGES.map((l) => ({ label: l.label, checked: l.id === locale, onPress: () => controller.setPreferences({ locale: l.id }) }))}
      />
    </KeyboardAvoidingView>
  );
}
