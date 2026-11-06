# @ohmatrix/i18n

Internationalization package for OhMatrix, supporting 14 languages.

## Structure

- `locales/` — Translation files in TOML format
  - `languages.toml` — List of languages (id and label)
  - `<id>.toml` — Translations for each language (629 keys)
- `src/codegen.ts` — Generates TypeScript code from TOML files
- `src/generated.ts` — Generated TypeScript code (auto-generated, do not edit manually)
- `src/index.ts` — Public API

## Usage

```typescript
import { t, detectLocale, LANGUAGES } from "@ohmatrix/i18n";

// Translate
const text = t("zh-CN", "chats"); // "聊天"
const withParams = t("en", "members", { n: 5 }); // "5 members"

// Detect system language
const locale = detectLocale(navigator.language); // "zh-CN" | "en" | ...

// Language list
console.log(LANGUAGES); // [{ id: "en", label: "English" }, ...]
```

## Adding or modifying translations

1. Edit `locales/<id>.toml` file
2. Run `npm run codegen` to generate TypeScript code
3. Run `npm test` to verify all languages have complete keys and correct format

## Adding a new language

1. Add language entry in `locales/languages.toml`
2. Create `locales/<id>.toml` and translate all 629 keys
3. Run `npm run codegen && npm test`

## TOML format

Each language file contains translations for all keys:

```toml
# Simplified Chinese.

"chats" = "聊天"
"connecting" = "连接中…"
"search" = "搜索"
# ... more keys
```

Parameters use `{name}` placeholders:

```toml
"members" = "{n} 位成员"
"keys.passphrase.short" = "至少 {n} 个字符。"
```

## Why TOML?

- **Language-agnostic**: TOML can be read by any language (TypeScript, C#/Avalonia, Rust, etc.)
- **Simple**: Plain key-value pairs, easy to edit and review
- **Type-safe**: TypeScript type checking is preserved through code generation

## Supported languages

English (en), 简体中文 (zh-CN), 繁體中文 (zh-TW), Español (es), Français (fr), Deutsch (de), Português (pt), Italiano (it), Русский (ru), 日本語 (ja), 한국어 (ko), हिन्दी (hi), বাংলা (bn), Bahasa Indonesia (id)
