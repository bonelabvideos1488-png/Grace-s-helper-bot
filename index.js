const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

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
// 3. АВТОУДАЛЕНИЕ СООБЩЕНИЙ У ЗАМУЧЕННЫХ
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
// 4. АВТОШТРАФ ЗА "КРОКУС" (НЕ ДЛЯ РАЗРЕШЁННОГО)
// ============================================================

bot.on('message', (msg) => {
    if (!msg.text || msg.from.is_bot) return;
    
    // Если это разрешённый пользователь — пропускаем
    if (isAllowed(msg.from)) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Приводим к нижнему регистру для упрощения
    const text = msg.text.toLowerCase();

    // Регулярное выражение для поиска "крокус" в любом виде
    const krokusRegex = /[кkк][рpр][оo0о][кkк][уyу][сcс]/i;

    // Проверяем, есть ли совпадение
    if (krokusRegex.test(text)) {
        const currentRep = getRep(chatId, userId);
        const newRep = currentRep - 500;
        setRep(chatId, userId, newRep);
        
        const username = getUserMention(msg.from);
        bot.sendMessage(chatId, `🌺 ${username}, ты сказал "крокус"! -500 репутации. Теперь: ${newRep}`);
    }
});

// ============================================================
// 5. "ГРАЦЕ КТО ..." — СЛУЧАЙНЫЙ ПОЛЬЗОВАТЕЛЬ
// ============================================================

bot.onText(/^Граце кто (.+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const question = match[1]; // то, что после "Граце кто"

    try {
        // Получаем список участников чата (админы + бот)
        const admins = await bot.getChatAdministrators(chatId);
        const users = [];
        for (const admin of admins) {
            if (!admin.user.is_bot) {
                users.push(admin.user);
            }
        }
        
        // Если админов мало — добавляем бота
        if (users.length < 2) {
            users.push(bot.me);
        }

        // Выбираем случайного пользователя
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const username = getUserMention(randomUser);

        bot.sendMessage(chatId, `${username} ${question}`);
    } catch (e) {
        // Если не удалось получить список — отвечаем с ботом
        bot.sendMessage(chatId, `@${bot.me.username} ${question}`);
    }
});

// ============================================================
// 6. КОМАНДЫ ТОЛЬКО ДЛЯ РАЗРЕШЁННОГО
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

    // СПОСОБ 1: Если указан username
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

    // СПОСОБ 2: Если ответили на сообщение
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

    // Проверяем время
    const duration = parseInt(match[2]);
    const unit = match[3] || 'м';

    if (!duration || isNaN(duration) || duration <= 0) {
        return bot.sendMessage(chatId, '❌ Укажи время: `/мут 10м` (м — минуты, ч — часы, с — секунды)', { parse_mode: 'Markdown' });
    }

    // Проверяем, не админ ли цель
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

    // СПОСОБ 1: Если указан username
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

    // СПОСОБ 2: Если ответили на сообщение
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

    // СПОСОБ 1: Если указан username
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

    // СПОСОБ 2: Если ответили на сообщение
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
// 7. КОМАНДЫ ДЛЯ ВСЕХ (ПРОСМОТР)
// ============================================================

// ---------- /репа (универсальная: своя ИЛИ по ответу) ----------
bot.onText(/\/репа$/, (msg) => {
    const chatId = msg.chat.id;
    let userId = msg.from.id;

    // Если ответили на сообщение — показываем репу того, кому ответили
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
bot.onText(/\/топ$/, (msg) => {
    const chatId = msg.chat.id;
    const data = loadJSON(REP_FILE);
    const users = [];
    for (const key in data) {
        if (key.startsWith(`${chatId}_`)) {
            const userId = key.split('_')[1];
            users.push({ id: userId, rep: data[key] });
        }
    }
    users.sort((a, b) => b.rep - a.rep);
    const top = users.slice(0, 10);
    if (!top.length) return bot.sendMessage(chatId, '📭 Нет данных.');
    let message = '🏆 ТОП-10 репы:\n\n';
    top.forEach((u, i) => { message += `${i+1}. ID: ${u.id} — ${u.rep} реп\n`; });
    bot.sendMessage(chatId, message);
});

// ---------- /larp (универсальная: свои ИЛИ по ответу) ----------
bot.onText(/\/larp$/, (msg) => {
    const chatId = msg.chat.id;
    let userId = msg.from.id;

    if (msg.reply_to_message) {
        const target = msg.reply_to_message.from;
        userId = target.id;
    }

    const larp = getLarp(chatId, userId);
    
    if (msg.reply_to_message) {
        const mention = getUserMention(msg.reply_to_message.from);
        bot.sendMessage(chatId, `🎭 Larp-моменты ${mention}: ${larp}`);
    } else {
        bot.sendMessage(chatId, `🎭 Твои larp-моменты: ${larp}`);
    }
});

// ---------- /larp_пользователя (только по ответу) ----------
bot.onText(/\/larp_пользователя$/, (msg) => {
    const chatId = msg.chat.id;
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, '❌ Ответь на сообщение пользователя.');
    }
    const target = msg.reply_to_message.from;
    const larp = getLarp(chatId, target.id);
    const mention = getUserMention(target);
    bot.sendMessage(chatId, `🎭 Larp-моменты ${mention}: ${larp}`);
});

// ---------- /топ_larp ----------
bot.onText(/\/топ_larp$/, (msg) => {
    const chatId = msg.chat.id;
    const data = loadJSON(LARP_FILE);
    const users = [];
    for (const key in data) {
        if (key.startsWith(`${chatId}_`)) {
            const userId = key.split('_')[1];
            users.push({ id: userId, larp: data[key] });
        }
    }
    users.sort((a, b) => b.larp - a.larp);
    const top = users.slice(0, 10);
    if (!top.length) return bot.sendMessage(chatId, '📭 Нет данных.');
    let message = '🎭 ТОП-10 larp-моментов:\n\n';
    top.forEach((u, i) => { message += `${i+1}. ID: ${u.id} — ${u.larp} larp\n`; });
    bot.sendMessage(chatId, message);
});

// ============================================================
// 8. ПРИВЕТСТВИЕ НОВЫХ УЧАСТНИКОВ
// ============================================================

bot.on('new_chat_members', (msg) => {
    const chatId = msg.chat.id;
    const newMember = msg.new_chat_members[0];

    // Если бот сам добавлен — показываем справку
    if (newMember.id === bot.me.id) {
        return bot.sendMessage(chatId,
            `👋 Бот для репы, ларпов, мутов и банов.\n\n` +
            `🔹 Для всех:\n` +
            `/репа — без ответа: своя репа + larp; с ответом: репа + larp того, кому ответил\n` +
            `/репа_пользователя — репа другого + larp (только по ответу)\n` +
            `/топ — топ репы\n` +
            `/larp — без ответа: свои larp; с ответом: larp того, кому ответил\n` +
            `/larp_пользователя — larp другого (только по ответу)\n` +
            `/топ_larp — топ larp\n\n` +
            `🔸 Только для @${ALLOWED_USERNAME}:\n` +
            `/унизить — -100 репы (по ответу)\n` +
            `/осеменение — +100 репы (по ответу)\n` +
            `/larpmoment — +1 larp (по ответу)\n` +
            `/мут 10м — мут (по ответу ИЛИ @username)\n` +
            `/размут — снять мут (по ответу ИЛИ @username)\n` +
            `/бан — бан (по ответу ИЛИ @username)`
        );
    }

    // Приветствие нового пользователя
    const username = getUserMention(newMember);

    bot.sendMessage(
        chatId,
        `🏴‍☠️ ${username} Вступил в отряд ларперов ANARCHY STUDIO 🏴‍☠️`
    );
});

console.log('✅ Бот запущен!');
console.log(`🔑 Разрешённый: @${ALLOWED_USERNAME}`);
console.log(`📁 Данные хранятся в: ${DATA_DIR}`);
