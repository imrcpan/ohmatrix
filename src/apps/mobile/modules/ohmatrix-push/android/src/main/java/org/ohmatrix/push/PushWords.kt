package org.ohmatrix.push

// Generated from the texts of @ohmatrix/i18n by src/pushWords.test.ts: do not edit it by hand. After a text changes, run
// `pnpm --filter @ohmatrix/mobile exec vitest run pushWords -u` and commit the result.

/** The words of a notification that the service writes while the app is not running. `invited` has `{name}` where the person goes. */
internal class PushWords(
    val photo: String,
    val video: String,
    val voice: String,
    val audio: String,
    val file: String,
    val location: String,
    val invited: String,
    val newMessage: String,
)

/** By language, as the app names them (`zh-TW`, `pt`): the app hands over the one in use (see pushState.ts). */
internal val PUSH_WORDS: Map<String, PushWords> =
    mapOf(
        "en" to
            PushWords(
                photo = "Photo",
                video = "Video",
                voice = "Voice message",
                audio = "Audio",
                file = "File",
                location = "Location",
                invited = "{name} invited you",
                newMessage = "New message",
            ),
        "zh-CN" to
            PushWords(
                photo = "[图片]",
                video = "[视频]",
                voice = "[语音]",
                audio = "[音频]",
                file = "[文件]",
                location = "[位置]",
                invited = "{name} 邀请了你",
                newMessage = "新消息",
            ),
        "zh-TW" to
            PushWords(
                photo = "[圖片]",
                video = "[影片]",
                voice = "[語音]",
                audio = "[音訊]",
                file = "[檔案]",
                location = "[位置]",
                invited = "{name} 邀請了你",
                newMessage = "新訊息",
            ),
        "es" to
            PushWords(
                photo = "Foto",
                video = "Vídeo",
                voice = "Mensaje de voz",
                audio = "Audio",
                file = "Archivo",
                location = "Ubicación",
                invited = "{name} te ha invitado",
                newMessage = "Mensaje nuevo",
            ),
        "fr" to
            PushWords(
                photo = "Photo",
                video = "Vidéo",
                voice = "Message vocal",
                audio = "Audio",
                file = "Fichier",
                location = "Position",
                invited = "{name} vous a envoyé une invitation",
                newMessage = "Nouveau message",
            ),
        "de" to
            PushWords(
                photo = "Foto",
                video = "Video",
                voice = "Sprachnachricht",
                audio = "Audio",
                file = "Datei",
                location = "Standort",
                invited = "{name} hat dich eingeladen",
                newMessage = "Neue Nachricht",
            ),
        "pt" to
            PushWords(
                photo = "Foto",
                video = "Vídeo",
                voice = "Mensagem de voz",
                audio = "Áudio",
                file = "Arquivo",
                location = "Localização",
                invited = "{name} convidou você",
                newMessage = "Nova mensagem",
            ),
        "it" to
            PushWords(
                photo = "Foto",
                video = "Video",
                voice = "Messaggio vocale",
                audio = "Audio",
                file = "File",
                location = "Posizione",
                invited = "{name} ti ha inviato un invito",
                newMessage = "Nuovo messaggio",
            ),
        "ru" to
            PushWords(
                photo = "Фото",
                video = "Видео",
                voice = "Голосовое сообщение",
                audio = "Аудио",
                file = "Файл",
                location = "Геопозиция",
                invited = "{name} приглашает вас",
                newMessage = "Новое сообщение",
            ),
        "ja" to
            PushWords(
                photo = "写真",
                video = "動画",
                voice = "ボイスメッセージ",
                audio = "音声",
                file = "ファイル",
                location = "位置情報",
                invited = "{name} さんがあなたを招待しました",
                newMessage = "新着メッセージ",
            ),
        "ko" to
            PushWords(
                photo = "사진",
                video = "동영상",
                voice = "음성 메시지",
                audio = "오디오",
                file = "파일",
                location = "위치",
                invited = "{name}님이 초대했어요",
                newMessage = "새 메시지",
            ),
        "hi" to
            PushWords(
                photo = "फ़ोटो",
                video = "वीडियो",
                voice = "वॉइस संदेश",
                audio = "ऑडियो",
                file = "फ़ाइल",
                location = "लोकेशन",
                invited = "{name} ने आपको आमंत्रित किया",
                newMessage = "नया संदेश",
            ),
        "bn" to
            PushWords(
                photo = "ছবি",
                video = "ভিডিও",
                voice = "ভয়েস বার্তা",
                audio = "অডিও",
                file = "ফাইল",
                location = "লোকেশন",
                invited = "{name} আপনাকে আমন্ত্রণ জানিয়েছেন",
                newMessage = "নতুন বার্তা",
            ),
        "id" to
            PushWords(
                photo = "Foto",
                video = "Video",
                voice = "Pesan suara",
                audio = "Audio",
                file = "File",
                location = "Lokasi",
                invited = "{name} mengundang Anda",
                newMessage = "Pesan baru",
            ),
    )
