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
const DATA_DIR = process.env.DATA_DIR || __dirname;

const REP_FILE = path.join(DATA_DIR, 'rep.json');
const LARP_FILE = path.join(DATA_DIR, 'larp.json');
const MUTE_FILE = path.join(DATA_DIR, 'mute.json');

// ============================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function loadJSON(file) {
    try { return JSON.parse(fs.readFileSync(file)); } 
    catch { return {}; }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getRep(chatId, userId) {
    const data = loadJSON(REP_FILE);
    return data[`${chatId}_${userId}`] || 0;
}

function setRep(chatId, userId, value) {
    const data = loadJSON(REP_FILE);
    data[`${chatId}_${userId}`] = value;
    saveJSON(REP_FILE, data);
}

function getLarp(chatId, userId) {
    const data = loadJSON(LARP_FILE);
    return data[`${chatId}_${userId}`] || 0;
}

function setLarp(chatId, userId, value) {
    const data = loadJSON(LARP_FILE);
    data[`${chatId}_${userId}`] = value;
    saveJSON(LARP_FILE, data);
}

function loadMutes() { return loadJSON(MUTE_FILE); }
function saveMutes(data) { saveJSON(MUTE_FILE, data); }

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

function isAllowed(user) {
    if (!user || !user.username) return false;
    return user.username.toLowerCase() === ALLOWED_USERNAME.toLowerCase();
}

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
// 5. АВТОШТРАФ ЗА "КРОКУС" (ГАРАНТИРОВАННО ЛОВИТ ВСЁ)
// ============================================================

bot.on('message', (msg) => {
    if (!msg.text || msg.from.is_bot) return;
    if (isAllowed(msg.from)) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    let text = msg.text.toLowerCase();

    // ============================================================
    // ПОЛНАЯ НОРМАЛИЗАЦИЯ (ВСЕ СИМВОЛЫ → РУССКИЕ БУКВЫ)
    // ============================================================

    const normalizedText = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Латиница → русские
        .replace(/[a]/g, 'а')
        .replace(/[b]/g, 'б')
        .replace(/[c]/g, 'с')
        .replace(/[d]/g, 'д')
        .replace(/[e]/g, 'е')
        .replace(/[f]/g, 'ф')
        .replace(/[g]/g, 'г')
        .replace(/[h]/g, 'н')
        .replace(/[i]/g, 'и')
        .replace(/[j]/g, 'й')
        .replace(/[k]/g, 'к')
        .replace(/[l]/g, 'л')
        .replace(/[m]/g, 'м')
        .replace(/[n]/g, 'н')
        .replace(/[o]/g, 'о')
        .replace(/[p]/g, 'р')
        .replace(/[q]/g, 'к')
        .replace(/[r]/g, 'р')
        .replace(/[s]/g, 'с')
        .replace(/[t]/g, 'т')
        .replace(/[u]/g, 'у')
        .replace(/[v]/g, 'в')
        .replace(/[w]/g, 'в')
        .replace(/[x]/g, 'х')
        .replace(/[y]/g, 'у')
        .replace(/[z]/g, 'з')
        // Греческие → русские
        .replace(/[αβ]/g, 'а')
        .replace(/[γ]/g, 'г')
        .replace(/[δ]/g, 'д')
        .replace(/[ε]/g, 'е')
        .replace(/[ζ]/g, 'з')
        .replace(/[η]/g, 'н')
        .replace(/[θ]/g, 'т')
        .replace(/[ικ]/g, 'к')
        .replace(/[λ]/g, 'л')
        .replace(/[μ]/g, 'м')
        .replace(/[ν]/g, 'н')
        .replace(/[ξ]/g, 'х')
        .replace(/[ο]/g, 'о')
        .replace(/[π]/g, 'п')
        .replace(/[ρ]/g, 'р')
        .replace(/[σς]/g, 'с')
        .replace(/[τ]/g, 'т')
        .replace(/[υ]/g, 'у')
        .replace(/[φ]/g, 'ф')
        .replace(/[χ]/g, 'х')
        .replace(/[ψ]/g, 'п')
        .replace(/[ω]/g, 'о')
        // Коптские → русские
        .replace(/[ⲁⲁ]/g, 'а')
        .replace(/[ⲃ]/g, 'б')
        .replace(/[ⲅ]/g, 'г')
        .replace(/[ⲇ]/g, 'д')
        .replace(/[ⲉ]/g, 'е')
        .replace(/[ⲍ]/g, 'з')
        .replace(/[ⲏ]/g, 'н')
        .replace(/[ⲑ]/g, 'т')
        .replace(/[ⲓ]/g, 'и')
        .replace(/[ⲕ]/g, 'к')
        .replace(/[ⲗ]/g, 'л')
        .replace(/[ⲙ]/g, 'м')
        .replace(/[ⲛ]/g, 'н')
        .replace(/[ⲟ]/g, 'о')
        .replace(/[ⲡ]/g, 'п')
        .replace(/[ⲣ]/g, 'р')
        .replace(/[ⲥ]/g, 'с')
        .replace(/[ⲧ]/g, 'т')
        .replace(/[ⲩ]/g, 'у')
        .replace(/[ⲫ]/g, 'ф')
        .replace(/[ⲭ]/g, 'х')
        .replace(/[ⲱ]/g, 'о')
        // Римские цифры → русские
        .replace(/[ⅽⅭᴄ]/g, 'с')
        .replace(/[ⅿⅯᴍ]/g, 'м')
        .replace(/[ⅾⅮᴅ]/g, 'д')
        .replace(/[ⅼⅬʟ]/g, 'л')
        .replace(/[ⅹⅩxх]/g, 'х')
        .replace(/[ⅳⅣᴠ]/g, 'в')
        .replace(/[ⅰⅠɪ]/g, 'и')
        .replace(/[ⅱⅡ]/g, 'и')
        .replace(/[ⅲⅢ]/g, 'и')
        .replace(/[ⅵⅥ]/g, 'в')
        .replace(/[ⅶⅦ]/g, 'в')
        .replace(/[ⅷⅧ]/g, 'в')
        // Африканские цифры → латинские → русские
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
        // Другие похожие символы
        .replace(/[ʀᴙ]/g, 'р')
        .replace(/[ᴏᴼ]/g, 'о')
        .replace(/[ᴋ]/g, 'к')
        .replace(/[ʏ]/g, 'у')
        .replace(/[ꜱ]/g, 'с')
        .replace(/[ᵤ]/g, 'у')
        .replace(/[ø]/g, 'о')
        .replace(/[œ]/g, 'о')
        .replace(/[ɵ]/g, 'о')
        .replace(/[ө]/g, 'о')
        .replace(/[φ]/g, 'ф')
        .replace(/[θ]/g, 'т')
        .replace(/[ω]/g, 'о')
        // Армянские → русские
        .replace(/[ա]/g, 'а')
        .replace(/[բ]/g, 'б')
        .replace(/[գ]/g, 'г')
        .replace(/[դ]/g, 'д')
        .replace(/[ե]/g, 'е')
        .replace(/[զ]/g, 'з')
        .replace(/[է]/g, 'е')
        .replace(/[ը]/g, 'ы')
        .replace(/[թ]/g, 'т')
        .replace(/[ժ]/g, 'ж')
        .replace(/[ի]/g, 'и')
        .replace(/[լ]/g, 'л')
        .replace(/[խ]/g, 'х')
        .replace(/[ծ]/g, 'ц')
        .replace(/[կ]/g, 'к')
        .replace(/[հ]/g, 'н')
        .replace(/[ձ]/g, 'дз')
        .replace(/[ղ]/g, 'г')
        .replace(/[ճ]/g, 'ч')
        .replace(/[մ]/g, 'м')
        .replace(/[յ]/g, 'й')
        .replace(/[ն]/g, 'н')
        .replace(/[շ]/g, 'ш')
        .replace(/[ո]/g, 'о')
        .replace(/[չ]/g, 'ч')
        .replace(/[պ]/g, 'п')
        .replace(/[ջ]/g, 'дж')
        .replace(/[ռ]/g, 'р')
        .replace(/[ս]/g, 'с')
        .replace(/[վ]/g, 'в')
        .replace(/[տ]/g, 'т')
        .replace(/[ր]/g, 'р')
        .replace(/[ց]/g, 'ц')
        .replace(/[փ]/g, 'п')
        .replace(/[ք]/g, 'к')
        .replace(/[օ]/g, 'о')
        .replace(/[ֆ]/g, 'ф');

    // Удаляем все знаки препинания, пробелы и спецсимволы
    const cleanText = normalizedText
        .replace(/[.,!?;:()"'\s\-_+=\[\]{}|\\\/<>@#$%^&*~`№§©®™€£¥¢¤°±×÷¬¦¨¯´¸¿¡«»‹›‘’“”•·…—–−]/g, '')
        .replace(/[😀-🙏]/g, '')
        .replace(/[🌀-🗿]/g, '')
        .replace(/[❤️🔥💀🎭🌺⭐✨]/g, '');

    // ============================================================
    // ПОИСК "КРОКУС" (ВСЕ ВОЗМОЖНЫЕ ВАРИАНТЫ)
    // ============================================================

    // 1. Точное совпадение
    const exactKrokusRegex = /крокус|crocus|krokus|κρόκος|кросук|корукс|курсок|сукрок|укрокс|рокуск|крок|кроку|крокс|крокусы|крокусов/i;

    // 2. Перестановки и обрывки
    const permutationsRegex = /кр[оа]с[уы]к|к[оа]р[уы]кс|к[уы]р[оа]кс|с[уы]кр[оа]к|[уы]кр[оа]кс|р[оа]к[уы]ск|к[уы]р[оа]с|с[оа]р[уы]к|р[уы]к[оа]с/i;

    // 3. Азиатские и африканские языки
    const asianRegex = /番红花|番紅花|クロッカス|くろっかす|크로커스|क्रोकस|ক্রোকাস|โครคัส|קרוקוס|کروکوس|كروكوس|ክሮከስ/i;

    // 4. Проверка "перед классными"
    const beforeClassRegex = /крокус\s*классн[ыо]й?|крокус\s*классн[ыо]е|крокус\s*классн[ыо]|crocus\s*class|κρόκος\s*class|krokus\s*class|crocus\s*classic|krokus\s*klassisch|krokus\s*klasse|krokus\s*klass/i;

    const found = 
        exactKrokusRegex.test(cleanText) ||
        permutationsRegex.test(cleanText) ||
        asianRegex.test(cleanText) ||
        beforeClassRegex.test(cleanText) ||
        // Проверка на "крокус" с любыми символами между буквами
        /к\W*р\W*о\W*к\W*у\W*с/i.test(cleanText) ||
        /c\W*р\W*о\W*c\W*у\W*s/i.test(cleanText) ||
        /k\W*р\W*о\W*k\W*у\W*s/i.test(cleanText) ||
        /κ\W*ρ\W*ο\W*κ\W*ο\W*ς/i.test(cleanText);

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

// ============================================================
// 8. КОМАНДЫ ДЛЯ ВСЕХ (ПРОСМОТР)
// ============================================================

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
// 9. ПРИВЕТСТВИЕ
// ============================================================

bot.on('new_chat_members', (msg) => {
    const chatId = msg.chat.id;
    const newMember = msg.new_chat_members[0];

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

    bot.sendMessage(chatId, `🏴‍☠️ ${getUserMention(newMember)} Вступил в отряд ларперов ANARCHY STUDIO 🏴‍☠️`);
});

console.log('✅ Бот запущен!');
console.log(`🔑 Разрешённый: @${ALLOWED_USERNAME}`);
console.log(`📁 Данные хранятся в: ${DATA_DIR}`);
