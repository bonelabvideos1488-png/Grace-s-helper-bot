const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const ALLOWED_USERNAME = process.env.ALLOWED_USERNAME || 'admin_bot';

if (!TOKEN) {
    console.error('❌ Ошибка: нет токена! Добавь переменную TOKEN в настройках Render.');
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const REP_FILE = 'rep.json';

function loadRep() {
    try { return JSON.parse(fs.readFileSync(REP_FILE)); } 
    catch { return {}; }
}
function saveRep(data) {
    fs.writeFileSync(REP_FILE, JSON.stringify(data, null, 2));
}
function getRep(chatId, userId) {
    const data = loadRep();
    const key = `${chatId}_${userId}`;
    return data[key] || 0;
}
function setRep(chatId, userId, value) {
    const data = loadRep();
    const key = `${chatId}_${userId}`;
    data[key] = value;
    saveRep(data);
}
function isAllowed(user) {
    if (!user || !user.username) return false;
    return user.username.toLowerCase() === ALLOWED_USERNAME.toLowerCase();
}

bot.onText(/\/унизить$/, (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    if (!isAllowed(from)) {
        return bot.sendMessage(chatId, '⛔ У тебя нет прав.');
    }
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, '❌ Ответь на сообщение.');
    }
    const target = msg.reply_to_message.from;
    if (target.id === from.id) {
        return bot.sendMessage(chatId, '❌ Нельзя унизить себя.');
    }
    const newRep = getRep(chatId, target.id) - 100;
    setRep(chatId, target.id, newRep);
    bot.sendMessage(chatId, `💀 ${target.first_name} унижен! -100 репы. Теперь: ${newRep}`);
});

bot.onText(/\/осеменение$/, (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    if (!isAllowed(from)) {
        return bot.sendMessage(chatId, '⛔ У тебя нет прав.');
    }
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, '❌ Ответь на сообщение.');
    }
    const target = msg.reply_to_message.from;
    if (target.id === from.id) {
        return bot.sendMessage(chatId, '❌ Нельзя осеменить себя.');
    }
    const newRep = getRep(chatId, target.id) + 100;
    setRep(chatId, target.id, newRep);
    bot.sendMessage(chatId, `🌱 ${target.first_name} осеменён! +100 репы. Теперь: ${newRep}`);
});

bot.onText(/\/репа$/, (msg) => {
    const chatId = msg.chat.id;
    const rep = getRep(chatId, msg.from.id);
    bot.sendMessage(chatId, `📊 Твоя репа: ${rep}`);
});

bot.onText(/\/репа_пользователя$/, (msg) => {
    const chatId = msg.chat.id;
    if (!msg.reply_to_message) {
        return bot.sendMessage(chatId, '❌ Ответь на сообщение.');
    }
    const target = msg.reply_to_message.from;
    const rep = getRep(chatId, target.id);
    bot.sendMessage(chatId, `📊 Репа ${target.first_name}: ${rep}`);
});

bot.onText(/\/топ$/, (msg) => {
    const chatId = msg.chat.id;
    const data = loadRep();
    const users = [];
    for (const key in data) {
        if (key.startsWith(`${chatId}_`)) {
            const userId = key.split('_')[1];
            users.push({ id: userId, rep: data[key] });
        }
    }
    users.sort((a, b) => b.rep - a.rep);
    const top = users.slice(0, 10);
    if (top.length === 0) {
        return bot.sendMessage(chatId, '📭 Нет данных.');
    }
    let message = '🏆 ТОП-10 репы:\n\n';
    top.forEach((user, index) => {
        message += `${index + 1}. ID: ${user.id} — ${user.rep} реп\n`;
    });
    bot.sendMessage(chatId, message);
});

bot.on('new_chat_members', (msg) => {
    const chatId = msg.chat.id;
    const newMember = msg.new_chat_members[0];
    if (newMember.id === bot.me.id) {
        bot.sendMessage(chatId, 
            `👋 Привет! Я бот для репутации.\n\n` +
            `🔹 Команды для всех:\n` +
            `/репа — узнать свою репу\n` +
            `/репа_пользователя — узнать репу другого (ответь на его сообщение)\n` +
            `/топ — топ-10 по репе\n\n` +
            `🔸 Команды только для @${ALLOWED_USERNAME}:\n` +
            `/унизить — -100 репы (ответь на сообщение)\n` +
            `/осеменение — +100 репы (ответь на сообщение)`
        );
    }
});

console.log('✅ Бот запущен!');
console.log(`🔑 Разрешённый: @${ALLOWED_USERNAME}`);
