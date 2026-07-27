const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ============================================================
// 1. КОНФИГУРАЦИЯ
// ============================================================

const TOKEN = process.env.TOKEN;
const ALLOWED_USERNAME = process.env.ALLOWED_USERNAME || 'admin_bot';

if (!TOKEN) {
    console.error('❌ Ошибка: нет токена! Добавь переменную TOKEN в настройках Render.');
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Если подключишь Persistent Disk на Render — укажи путь к нему
const DATA_DIR = process.env.DATA_DIR || __dirname;

// Файлы для хранения
const REP_FILE     = path.join(DATA_DIR, 'rep.json');
const LARP_FILE    = path.join(DATA_DIR, 'larp.json');
const MUTE_FILE    = path.join(DATA_DIR, 'mute.json');

// ============================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function loadJSON(file) {
    try {
        const content = fs.readFileSync(file);
        return JSON.parse(content);
    } catch {
        return {};
    }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------- РЕПУТАЦИЯ ----------
function getRep(chatId, userId) {
    const data = loadJSON(REP_FILE);
    return data[`${chatId}_${userId}`] || 0;
}
function setRep(chatId, userId, value) {
    const data = loadJSON(REP_FILE);
    data[`${chatId}_${userId}`] = value;
    saveJSON(REP_FILE, data);
}

// ---------- LARP-МОМЕНТЫ ----------
function getLarp(chatId, userId) {
    const data = loadJSON(LARP_FILE);
    return data[`${chatId}_${userId}`] || 0;
}
function setLarp(chatId, userId, value) {
    const data = loadJSON(LARP_FILE);
    data[`${chatId}_${userId}`] = value;
    saveJSON(LARP_FILE, data);
}

// ---------- МУТЫ ----------
function loadMutes() {
    return loadJSON(MUTE_FILE);
}
function saveMutes(data) {
    saveJSON(MUTE_FILE, data);
}
function isMuted(chatId, userId) {
    const data = loadMutes();
    const key = `${chatId}_${userId}`;
    if (!data[key]) return false;
    if (Date.now() > data[key]) {
        delete data[key];
        saveMutes(data);
        return false;
    }
    return true;
}
function setMute(chatId, userId, durationMs) {
    const data = loadMutes();
    data[`${chatId}_${userId}`] = Date.now() + durationMs;
    saveMutes(data);
}
function removeMute(chatId, userId) {
    const data = loadMutes();
    delete data[`${chatId}_${userId}`];
    saveMutes(data);
}

// ---------- ПРОВЕРКА ПРАВ ----------
function isAllowed(user) {
    if (!user || !user.username) return false;
    return user.username.toLowerCase() === ALLOWED_USERNAME.toLowerCase();
}

// ---------- ПОЛУЧЕНИЕ ИМЕНИ ПОЛЬЗОВАТЕЛЯ ДЛЯ УПОМИНАНИЯ ----------
function getUserMention(user) {
    if (!user) return 'неизвестный пользователь';
    return user.username ? `@${user.username}` : user.first_name;
}

// ============================================================
// 3. ФИКТИВНЫЙ ВЕБ-СЕРВЕР ДЛЯ RENDER
// ============================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(PORT, () => {
    console.log(`✅ Веб-сервер запущен на порту ${PORT}`);
});

// ============================================================
// 4. АВТОУДАЛЕНИЕ СООБЩЕНИЙ У ЗАМУЧЕННЫХ
// ============================================================

bot.on('message', (msg) => {
    if (!msg.from || msg.from.is_bot) return;
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (isMuted(chatId, userId)) {
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    }
});

// ============================================================
// 5. АВТОШТРАФ ЗА "КРОКУС" (АБСОЛЮТНО ВСЕ ВАРИАНТЫ)
// ============================================================

bot.on('message', (msg) => {
    if (!msg.text || msg.from.is_bot) return;
    if (isAllowed(msg.from)) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    let text = msg.text.toLowerCase();

    // ============================================================
    // МАКСИМАЛЬНАЯ НОРМАЛИЗАЦИЯ ТЕКСТА
    // ============================================================

    const normalizedText = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Африканские цифры → латинские цифры
        .replace(/[߀]/g, '0')
        .replace(/[߁]/g, '1')
        .replace(/[߂]/g, '2')
        .replace(/[߃]/g, '3')
        .replace(/[߄]/g, '4')
        .replace(/[߅]/g, '5')
        .replace(/[߆]/g, '6')
        .replace(/[߇]/g, '7')
        .replace(/[߈]/g, '8')
        .replace(/[߉]/g, '9')
        // Римские цифры и похожие символы
        .replace(/[ⅽⅭᴄ]/g, 'c')
        .replace(/[ⅿⅯᴍ]/g, 'm')
        .replace(/[ⅾⅮᴅ]/g, 'd')
        .replace(/[ⅼⅬʟ]/g, 'l')
        .replace(/[ⅹⅩxх]/g, 'x')
        .replace(/[ⅳⅣᴠ]/g, 'v')
        .replace(/[ⅰⅠɪ]/g, 'i')
        .replace(/[ⅱⅡ]/g, 'ii')
        .replace(/[ⅲⅢ]/g, 'iii')
        .replace(/[ⅵⅥ]/g, 'vi')
        .replace(/[ⅶⅦ]/g, 'vii')
        .replace(/[ⅷⅧ]/g, 'viii')
        // Замена латинских букв на русские (для унификации)
        .replace(/[p]/g, 'р')
        .replace(/[c]/g, 'с')
        .replace(/[k]/g, 'к')
        .replace(/[o]/g, 'о')
        .replace(/[y]/g, 'у')
        .replace(/[s]/g, 'с')
        .replace(/[u]/g, 'у')
        .replace(/[a]/g, 'а')
        .replace(/[b]/g, 'б')
        .replace(/[e]/g, 'е')
        .replace(/[h]/g, 'н')
        .replace(/[x]/g, 'х')
        // Замена греческих букв на русские
        .replace(/[κ]/g, 'к')
        .replace(/[ρ]/g, 'р')
        .replace(/[ο]/g, 'о')
        .replace(/[υ]/g, 'у')
        .replace(/[ς]/g, 'с')
        .replace(/[σ]/g, 'с')
        .replace(/[τ]/g, 'т')
        .replace(/[ν]/g, 'н')
        .replace(/[μ]/g, 'м')
        .replace(/[λ]/g, 'л')
        // Другие похожие символы
        .replace(/[ʀᴙ]/g, 'р')
        .replace(/[ᴏᴼ]/g, 'о')
        .replace(/[ᴋ]/g, 'к')
        .replace(/[ʏ]/g, 'у')
        .replace(/[ꜱ]/g, 'с')
        .replace(/[ᵤ]/g, 'у')
        .replace(/[ø]/g, 'о')
        .replace(/[œ]/g, 'ое')
        .replace(/[ɵ]/g, 'о')
        .replace(/[ө]/g, 'о')
        .replace(/[φ]/g, 'ф')
        .replace(/[θ]/g, 'т')
        .replace(/[ω]/g, 'о')
        .replace(/[α]/g, 'а')
        .replace(/[β]/g, 'б')
        .replace(/[γ]/g, 'г')
        .replace(/[δ]/g, 'д')
        .replace(/[ε]/g, 'е')
        .replace(/[ζ]/g, 'з')
        .replace(/[η]/g, 'н')
        .replace(/[ι]/g, 'и')
        .replace(/[ξ]/g, 'х')
        .replace(/[π]/g, 'п')
        .replace(/[χ]/g, 'х')
        .replace(/[ψ]/g, 'пс');

    // Удаляем все знаки препинания, пробелы и спецсимволы
    const cleanText = normalizedText
        .replace(/[.,!?;:()"'\s\-_+=\[\]{}|\\\/<>@#$%^&*~`№§©®™€£¥¢¤°±×÷¬¦¨¯´¸¿¡«»‹›‘’“”•·…—–−]/g, '')
        .replace(/[😀-🙏]/g, '')
        .replace(/[🌀-🗿]/g, '')
        .replace(/[❤️🔥💀🎭🌺⭐✨]/g, '');

    // ============================================================
    // ПОИСК "КРОКУС" (ВСЕ ВОЗМОЖНЫЕ ВАРИАНТЫ)
    // ============================================================

    // 1. Точное совпадение (все языки)
    const exactKrokusRegex = new RegExp(
        '(?:' +
        '[кkкκcс]{1}[рpрρ]{1}[оo0оο]{1}[кkкκcс]{1}[уyуυ]{1}[сcсς]{1}' +
        '|' +
        '[cсcς]{1}[рpрρ]{1}[оo0оο]{1}[cсcς]{1}[уyуυ]{1}[sсς]{1}' +
        '|' +
        '[kкkκ]{1}[рpрρ]{1}[оo0оο]{1}[kкkκ]{1}[уyуυ]{1}[sсς]{1}' +
        '|' +
        '[κkк]{1}[ρpр]{1}[οo0о]{1}[κkк]{1}[οo0о]{1}[ςсc]{1}' +
        '|' +
        '[cсckкkκ]{1}[рpрρ]{1}[оo0оο]{1}[cсckкkκ]{1}[уyуυ]{1}[sсcς]{1}' +
        ')',
        'i'
    );

    // 2. Перестановки букв
    const permutationsRegex = new RegExp(
        '(?:' +
        '[кkкκ]{1}[рpрρ]{1}[оo0оο]{1}[сcсς]{1}[уyуυ]{1}[кkкκ]{1}' +
        '|' +
        '[кkкκ]{1}[оo0оο]{1}[рpрρ]{1}[уyуυ]{1}[кkкκ]{1}[сcсς]{1}' +
        '|' +
        '[кkкκ]{1}[уyуυ]{1}[рpрρ]{1}[оo0оο]{1}[кkкκ]{1}[сcсς]{1}' +
        '|' +
        '[сcсς]{1}[уyуυ]{1}[кkкκ]{1}[рpрρ]{1}[оo0оο]{1}[кkкκ]{1}' +
        '|' +
        '[уyуυ]{1}[кkкκ]{1}[рpрρ]{1}[оo0оο]{1}[кkкκ]{1}[сcсς]{1}' +
        '|' +
        '[рpрρ]{1}[оo0оο]{1}[кkкκ]{1}[уyуυ]{1}[сcсς]{1}[кkкκ]{1}' +
        '|' +
        '[кkкκ]{1}[уyуυ]{1}[рpрρ]{1}[оo0оο]{1}[сcсς]{1}' +
        '|' +
        '[сcсς]{1}[оo0оο]{1}[рpрρ]{1}[уyуυ]{1}[кkкκ]{1}' +
        '|' +
        '[рpрρ]{1}[уyуυ]{1}[кkкκ]{1}[оo0оο]{1}[сcсς]{1}' +
        ')',
        'i'
    );

    // 3. Обрывки
    const fragmentsRegex = new RegExp(
        '(?:' +
        '[кkкκcс]{1}[рpрρ]{1}[оo0оο]{1}[кkкκcс]{1}' +
        '|' +
        '[кkкκcс]{1}[рpрρ]{1}[оo0оο]{1}[кkкκcс]{1}[уyуυ]{1}' +
        '|' +
        '[кkкκcс]{1}[рpрρ]{1}[оo0оο]{1}[кkкκcс]{1}[сcсς]{1}' +
        '|' +
        '[кkкκcс]{1}[рpрρ]{1}[оo0оο]{1}[кkкκcс]{1}[уyуυ]{1}[сcсς]{1}' +
        '|' +
        '[cсcς]{1}[рpрρ]{1}[оo0оο]{1}[cсcς]{1}[уyуυ]{1}[sсς]{1}' +
        '|' +
        '[kкkκ]{1}[рpрρ]{1}[оo0оο]{1}[kкkκ]{1}[уyуυ]{1}[sсς]{1}' +
        ')',
        'i'
    );

    // 4. Азиатские языки
    const asianRegex = new RegExp(
        '(?:' +
        '番红花|番紅花|クロッカス|くろっかす|크로커스|क्रोकस|ক্রোকাস|โครคัส|קרוקוס|کروکوس' +
        ')',
        'i'
    );

    // 5. Африканские языки
    const africanRegex = new RegExp(
        '(?:' +
        'كروكوس|ክሮከስ' +
        ')',
        'i'
    );

    // 6. Проверка "перед классными"
    const beforeClassRegex = /крокус\s*классн[ыо]й?|крокус\s*классн[ыо]е|крокус\s*классн[ыо]|crocus\s*class|κρόκος\s*class|krokus\s*class|crocus\s*classic|krokus\s*klassisch|krokus\s*klasse|krokus\s*klass/i;

    // Проверяем, есть ли совпадение
    const found = 
        exactKrokusRegex.test(cleanText) ||
        permutationsRegex.test(cleanText) ||
        fragmentsRegex.test(cleanText) ||
        asianRegex.test(text) ||
        africanRegex.test(text) ||
        beforeClassRegex.test(cleanText) ||
        // Проверка на "крокус" с любыми символами между буквами
        /[кkкκcс]\W*[рpрρ]\W*[оo0оο]\W*[кkкκcс]\W*[уyуυ]\W*[сcсς]/i.test(cleanText) ||
        /[cсcς]\W*[рpрρ]\W*[оo0оο]\W*[cсcς]\W*[уyуυ]\W*[sсς]/i.test(cleanText) ||
        /[κkк]\W*[ρpр]\W*[οo0о]\W*[κkк]\W*[οo0о]\W*[ςсc]/i.test(cleanText);

    if (found) {
        const currentRep = getRep(chatId, userId);
        const newRep = currentRep - 500;
        setRep(chatId, userId, newRep);
        
        const username = getUserMention(msg.from);
        bot.sendMessage(chatId, `🌺 ${username}, ты сказал "крокус"! -500 репутации. Теперь: ${newRep}`);
    }
});

// ============================================================
// 6. "ГРАЦЕ КТО ..." — СЛУЧАЙНЫЙ ПОЛЬЗОВАТЕЛЬ
// ============================================================

bot.onText(/^Граце кто (.+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const question = match[1];

    try {
        const admins = await bot.getChatAdministrators(chatId);
        const users = [];
        for (const admin of admins) {
            if (!admin.user.is_bot) {
                users.push(admin.user);
            }
        }
        if (users.length < 2) {
            users.push(bot.me);
        }

        const randomUser = users[Math.floor(Math.random() * users.length)];
        const username = getUserMention(randomUser);
        bot.sendMessage(chatId, `${username} ${question}`);
    } catch (e) {
        bot.sendMessage(chatId, `@${bot.me.username} ${question}`);
    }
});

// ============================================================
// 7. КОМАНДЫ ТОЛЬКО ДЛЯ РАЗРЕШЁННОГО
// ============================================================

// ---------- /унизить (по ответу) ----------
bot.onText(/\/унизить$/, (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    if (!isAllowed(from)) {
        return bot.sendMessage(chatId, '⛔ Нет прав.');
    }
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, '❌ Ответь на сообщение цели.');
    }
    const target = msg.reply_to_message.from;
    if (target.id === from.id) {
        return bot.sendMessage(chatId, '❌ Нельзя унизить себя.');
    }
    if (target.is_bot) {
        return bot.sendMessage(chatId, '❌ Нельзя унизить бота.');
    }
    const newVal = getRep(chatId, target.id) - 100;
    setRep(chatId, target.id, newVal);
    const targetMention = getUserMention(target);
    bot.sendMessage(chatId, `💀 ${targetMention} унижен! -100 репы. Теперь: ${newVal}`);
});

// ---------- /осеменение (по ответу) ----------
bot.onText(/\/осеменение$/, (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    if (!isAllowed(from)) {
        return bot.sendMessage(chatId, '⛔ Нет прав.');
    }
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, '❌ Ответь на сообщение.');
    }
    const target = msg.reply_to_message.from;
    if (target.id === from.id) {
        return bot.sendMessage(chatId, '❌ Нельзя осеменить себя.');
    }
    if (target.is_bot) {
        return bot.sendMessage(chatId, '❌ Нельзя осеменить бота.');
    }
    const newVal = getRep(chatId, target.id) + 100;
    setRep(chatId, target.id, newVal);
    const targetMention = getUserMention(target);
    bot.sendMessage(chatId, `🌱 ${targetMention} осеменён! +100 репы. Теперь: ${newVal}`);
});

// ---------- /larpmoment (по ответу) ----------
bot.onText(/\/larpmoment$/, (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    if (!isAllowed(from)) {
        return bot.sendMessage(chatId, '⛔ Нет прав.');
    }
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, '❌ Ответь на сообщение.');
    }
    const target = msg.reply_to_message.from;
    if (target.id === from.id) {
        return bot.sendMessage(chatId, '❌ Нельзя дать larp-момент себе.');
    }
    if (target.is_bot) {
        return bot.sendMessage(chatId, '❌ Нельзя дать larp-момент боту.');
    }
    const newVal = getLarp(chatId, target.id) + 1;
    setLarp(chatId, target.id, newVal);
    const targetMention = getUserMention(target);
    bot.sendMessage(chatId, `🎭 ${targetMention} получил larp-момент! +1. Теперь: ${newVal}`);
});

// ---------- /мут (по ответу ИЛИ по username) ----------
bot.onText(/\/мут(?:\s+@(\w+))?\s+(\d+)([мчс])?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const from = msg.from;

    if (!isAllowed(from)) {
        return bot.sendMessage(chatId, '⛔ Нет прав.');
    }

    let targetUser = null;

    const targetUsername = match[1];
    if (targetUsername) {
        try {
            const admins = await bot.getChatAdministrators(chatId);
            for (const admin of admins) {
                if (admin.user.username && admin.user.username.toLowerCase() === targetUsername.toLowerCase()) {
                    targetUser = admin.user;
                    break;
                }
            }
            if (!targetUser) {
                return bot.sendMessage(chatId, '❌ Пользователь с таким username не найден.');
            }
        } catch (e) {
            return bot.sendMessage(chatId, '❌ Ошибка поиска пользователя.');
        }
    }

    if (!targetUser && msg.reply_to_message) {
        targetUser = msg.reply_to_message.from;
    }

    if (!targetUser) {
        return bot.sendMessage(
            chatId,
            '❌ Укажи пользователя:\n' +
            '• Ответь на его сообщение командой `/мут 10м`\n' +
            '• Или напиши `/мут @username 10м`',
            { parse_mode: 'Markdown' }
        );
    }

    if (targetUser.id === from.id) {
        return bot.sendMessage(chatId, '❌ Нельзя замутить себя.');
    }
    if (targetUser.is_bot) {
        return bot.sendMessage(chatId, '❌ Нельзя замутить бота.');
    }

    const duration = parseInt(match[2]);
    const unit = match[3] || 'м';

    if (!duration || isNaN(duration) || duration <= 0) {
        return bot.sendMessage(chatId, '❌ Укажи время: `/мут 10м` (м — минуты, ч — часы, с — секунды)', { parse_mode: 'Markdown' });
    }

    try {
        const member = await bot.getChatMember(chatId, targetUser.id);
        if (member.status === 'creator' || member.status === 'administrator') {
            return bot.sendMessage(chatId, '❌ Нельзя замутить админа или создателя.');
        }
    } catch (e) {}

    let durationMs;
    switch (unit) {
        case 'с': durationMs = duration * 1000; break;
        case 'ч': durationMs = duration * 60 * 60 * 1000; break;
        default: durationMs = duration * 60 * 1000;
    }
    if (durationMs > 24 * 60 * 60 * 1000) {
        return bot.sendMessage(chatId, '❌ Максимум — 24 часа.');
    }

    setMute(chatId, targetUser.id, durationMs);

    try {
        await bot.restrictChatMember(chatId, targetUser.id, {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
        });
    } catch (e) {}

    const targetMention = getUserMention(targetUser);
    bot.sendMessage(chatId, `🔇 ${targetMention} замучен на ${duration}${unit}.`);
});

// ---------- /размут (по ответу ИЛИ по username) ----------
bot.onText(/\/размут(?:\s+@(\w+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const from = msg.from;

    if (!isAllowed(from)) {
        return bot.sendMessage(chatId, '⛔ Нет прав.');
    }

    let targetUser = null;

    const targetUsername = match[1];
    if (targetUsername) {
        try {
            const admins = await bot.getChatAdministrators(chatId);
            for (const admin of admins) {
                if (admin.user.username && admin.user.username.toLowerCase() === targetUsername.toLowerCase()) {
                    targetUser = admin.user;
                    break;
                }
            }
            if (!targetUser) {
                return bot.sendMessage(chatId, '❌ Пользователь с таким username не найден.');
            }
        } catch (e) {
            return bot.sendMessage(chatId, '❌ Ошибка поиска пользователя.');
        }
    }

    if (!targetUser && msg.reply_to_message) {
        targetUser = msg.reply_to_message.from;
    }

    if (!targetUser) {
        return bot.sendMessage(
            chatId,
            '❌ Укажи пользователя:\n' +
            '• Ответь на его сообщение командой `/размут`\n' +
            '• Или напиши `/размут @username`',
            { parse_mode: 'Markdown' }
        );
    }

    if (targetUser.id === from.id) {
        return bot.sendMessage(chatId, '❌ Нельзя размутить себя.');
    }
    if (targetUser.is_bot) {
        return bot.sendMessage(chatId, '❌ Боты не мучаются.');
    }

    removeMute(chatId, targetUser.id);

    try {
        await bot.restrictChatMember(chatId, targetUser.id, {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
        });
    } catch (e) {}

    const targetMention = getUserMention(targetUser);
    bot.sendMessage(chatId, `✅ ${targetMention} размучен.`);
});

// ---------- /бан (по ответу ИЛИ по username) ----------
bot.onText(/\/бан(?:\s+@(\w+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const from = msg.from;

    if (!isAllowed(from)) {
        return bot.sendMessage(chatId, '⛔ Нет прав.');
    }

    let targetUser = null;

    const targetUsername = match[1];
    if (targetUsername) {
        try {
            const admins = await bot.getChatAdministrators(chatId);
            for (const admin of admins) {
                if (admin.user.username && admin.user.username.toLowerCase() === targetUsername.toLowerCase()) {
                    targetUser = admin.user;
                    break;
                }
            }
            if (!targetUser) {
                return bot.sendMessage(chatId, '❌ Пользователь с таким username не найден.');
            }
        } catch (e) {
            return bot.sendMessage(chatId, '❌ Ошибка поиска пользователя.');
        }
    }

    if (!targetUser && msg.reply_to_message) {
        targetUser = msg.reply_to_message.from;
    }

    if (!targetUser) {
        return bot.sendMessage(
            chatId,
            '❌ Укажи пользователя:\n' +
            '• Ответь на его сообщение командой `/бан`\n' +
            '• Или напиши `/бан @username`',
            { parse_mode: 'Markdown' }
        );
    }

    if (targetUser.id === from.id) {
        return bot.sendMessage(chatId, '❌ Нельзя забанить себя.');
    }
    if (targetUser.is_bot) {
        return bot.sendMessage(chatId, '❌ Нельзя забанить бота.');
    }

    try {
        const member = await bot.getChatMember(chatId, targetUser.id);
        if (member.status === 'creator' || member.status === 'administrator') {
            return bot.sendMessage(chatId, '❌ Нельзя забанить админа или создателя.');
        }
    } catch (e) {}

    try {
        await bot.banChatMember(chatId, targetUser.id);
        const targetMention = getUserMention(targetUser);
        bot.sendMessage(chatId, `🔨 ${targetMention} забанен.`);
    } catch (e) {
        bot.sendMessage(chatId, '❌ Не удалось забанить. У бота должны быть права администратора.');
    }
});

// ============================================================
// 8. КОМАНДЫ ДЛЯ ВСЕХ (ПРОСМОТР)
// ============================================================

// ---------- /репа (универсальная: своя ИЛИ по ответу) ----------
bot.onText(/\/репа$/, (msg) => {
    const chatId = msg.chat.id;
    let userId = msg.from.id;

    if (msg.reply_to_message) {
        const target = msg.reply_to_message.from;
        userId = target.id;
    }

    const rep = getRep(chatId, userId);
    const larp = getLarp(chatId, userId);
    
    if (msg.reply_to_message) {
        const mention = getUserMention(msg.reply_to_message.from);
        bot.sendMessage(chatId, `📊 Репа ${mention}: ${rep} | 🎭 Larp-моменты: ${larp}`);
    } else {
        bot.sendMessage(chatId, `📊 Твоя репа: ${rep} | 🎭 Larp-моменты: ${larp}`);
    }
});

// ---------- /репа_пользователя (только по ответу) ----------
bot.onText(/\/репа_пользователя$/, (msg) => {
    const chatId = msg.chat.id;
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, '❌ Ответь на сообщение пользователя.');
    }
    const target = msg.reply_to_message.from;
    const rep = getRep(chatId, target.id);
    const larp = getLarp(chatId, target.id);
    const mention = getUserMention(target);
    bot.sendMessage(chatId, `📊 Репа ${mention}: ${rep} | 🎭 Larp-моменты: ${larp}`);
});

// ---------- /топ ----------
bot.onText(/\/топ$
