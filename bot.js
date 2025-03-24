require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SPONSOR_LINK = 'https://t.me/ohuenko';
const LOGS_CHAT_ID = process.env.LOGS_CHAT_ID;

if (!BOT_TOKEN || !LOGS_CHAT_ID) {
  console.error('Необходимо указать BOT_TOKEN и LOGS_CHAT_ID в .env файле');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Улучшенная база данных в памяти
const users = new Map();
const referralRecords = new Map();

// Форматирование даты
function formatDate(date) {
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Экранирование специальных символов для MarkdownV2
function escapeMarkdown(text) {
  return text.toString()
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

// Асинхронное получение информации о пользователе
async function getUserInfo(userId) {
  try {
    const user = await bot.telegram.getChat(userId);
    return {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name || ''
    };
  } catch (e) {
    console.error(`Ошибка получения данных пользователя ${userId}:`, e);
    return { id: userId };
  }
}

// Улучшенное логирование с защитой от ошибок форматирования
async function logNewUser(ctx, referrerId = null) {
  try {
    const user = ctx.from;
    let referrerInfo = 'Прямой заход';
    
    if (referrerId && referrerId !== user.id.toString()) {
      try {
        const referrerData = await getUserInfo(referrerId);
        referrerInfo = [
          `• ID пригласителя: \`${referrerId}\``,
          `• Имя: ${escapeMarkdown(referrerData.firstName || 'не указано')}`,
          `• Username: ${referrerData.username ? '@' + escapeMarkdown(referrerData.username) : 'нет'}`
        ].join('\n');
      } catch (e) {
        referrerInfo = `ID пригласителя: \`${referrerId}\` (данные недоступны)`;
      }
    }

    const logMessage = [
      '✨ *Новый участник* ✨',
      '━━━━━━━━━━━━━━',
      `• ID: \`${user.id}\``,
      `• Имя: ${escapeMarkdown(user.first_name)}`,
      `• Username: ${user.username ? '@' + escapeMarkdown(user.username) : 'нет'}`,
      `• Дата: ${escapeMarkdown(formatDate(new Date()))}`,
      '━━━━━━━━━━━━━━',
      referrerInfo,
      '━━━━━━━━━━━━━━'
    ].join('\n');

    await bot.telegram.sendMessage(
      LOGS_CHAT_ID, 
      logMessage,
      { parse_mode: 'MarkdownV2' }
    );
  } catch (e) {
    console.error('Ошибка логгирования:', e);
    // Попытка отправить простой текст без форматирования в случае ошибки
    try {
      await bot.telegram.sendMessage(
        LOGS_CHAT_ID,
        `Новый участник: ${ctx.from.first_name} (ID: ${ctx.from.id})`
      );
    } catch (err) {
      console.error('Не удалось отправить даже упрощённое сообщение:', err);
    }
  }
}

// Обработчик команды /start
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    const referrerId = ctx.startPayload;
    const now = new Date();

    // Проверка на самоприглашение
    if (referrerId && referrerId === userId.toString()) {
      return ctx.replyWithHTML('❌ Нельзя использовать собственную реферальную ссылку!');
    }

    // Регистрация нового пользователя
    if (!users.has(userId)) {
      const userData = {
        id: userId,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name || '',
        referredBy: referrerId || null,
        joinDate: now,
        referrals: []
      };

      users.set(userId, userData);

      // Обновление данных реферера
      if (referrerId && !referralRecords.has(`${referrerId}_${userId}`)) {
        referralRecords.set(`${referrerId}_${userId}`, true);
        
        const referrerData = users.get(referrerId);
        if (referrerData) {
          referrerData.referrals.push(userId);
        }

        // Уведомление реферера
        try {
          await ctx.telegram.sendMessage(
            referrerId,
            `🎉 *Новый реферал\\!*\n` +
            `🔗 Приглашайте друзей и увеличивайте шансы\\!`,
            { parse_mode: 'MarkdownV2' }
          );
        } catch (e) {
          console.error('Ошибка уведомления реферера:', e);
        }
      }

      await logNewUser(ctx, referrerId);
    }

    // Основное меню
    const userData = users.get(userId);
    const referralCount = userData?.referrals?.length || 0;
    
    await ctx.replyWithMarkdownV2(
      `🎩 *Добро пожаловать, ${escapeMarkdown(ctx.from.first_name)}\\!* \n` +
      `━━━━━━━━━━━━━━\n` +
      `Вы участвуете в розыгрыше *1\\.000\\.000 ⭐STARS*\\!\n\n` +
      `🔗 Приглашайте друзей и увеличивайте шансы\\!`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🎫 Моя статистика', 'my_stats')],
        [Markup.button.callback('📢 Пригласить друзей', 'get_invite_link')],
        [Markup.button.url('🌟 Спонсор розыгрыша', SPONSOR_LINK)]
      ])
    );

  } catch (e) {
    console.error('Ошибка в обработчике start:', e);
    ctx.reply('⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Остальные обработчики с MarkdownV2
bot.action('get_invite_link', async (ctx) => {
  try {
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    const userData = users.get(ctx.from.id);
    const referralCount = userData?.referrals?.length || 0;
    
    await ctx.editMessageText(
      `🔗 *Ваша реферальная ссылка\\:*\n` +
      `\`${referralLink}\`\n\n` +
      `👥 Приглашено друзей\\: *${referralCount}*\n\n` +
      `Поделитесь этой ссылкой с друзьями\\!\n` +
      `Каждый новый участник увеличивает ваши шансы\\!`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.url('✨ Подписаться на спонсора', SPONSOR_LINK)],
          [Markup.button.callback('🔙 Назад', 'back_to_main')]
        ])
      }
    );
  } catch (e) {
    console.error('Ошибка в обработчике get_invite_link:', e);
    ctx.reply('⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

bot.action('my_stats', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userData = users.get(userId) || {};
    const referralCount = userData.referrals?.length || 0;
    
    await ctx.editMessageText(
      `📊 *Ваша статистика*\n` +
      `━━━━━━━━━━━━━━\n` +
      `👤 ID\\: \`${userId}\`\n` +
      `📅 Дата регистрации\\: ${escapeMarkdown(formatDate(userData.joinDate || new Date()))}\n` +
      `👥 Рефералов\\: *${referralCount}*\n\n` +
      `💎 Чем больше друзей вы приведёте \\- тем выше шансы\\!`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📢 Пригласить друзей', 'get_invite_link')],
          [Markup.button.url('🌟 Спонсор розыгрыша', SPONSOR_LINK)],
          [Markup.button.callback('🔙 Назад', 'back_to_main')]
        ])
      }
    );
  } catch (e) {
    console.error('Ошибка в обработчике my_stats:', e);
    ctx.reply('⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

bot.action('back_to_main', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userData = users.get(userId);
    const referralCount = userData?.referrals?.length || 0;
    
    await ctx.editMessageText(
      `🎩 *${escapeMarkdown(ctx.from.first_name)}\\, вы участвуете в розыгрыше\\!*\n` +
      `━━━━━━━━━━━━━━\n` +
      `🏆 Главный приз\\: 1\\.000\\.000 ⭐STARS\n\n` +
      `Приглашайте друзей и увеличивайте шансы\\!`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🎫 Моя статистика', 'my_stats')],
          [Markup.button.callback('📢 Пригласить друзей', 'get_invite_link')],
          [Markup.button.url('🌟 Спонсор розыгрыша', SPONSOR_LINK)]
        ])
      }
    );
  } catch (e) {
    console.error('Ошибка в обработчике back_to_main:', e);
    ctx.reply('⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error('Ошибка в боте:', err);
  ctx.reply('⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.');
});

// Запуск бота
bot.launch()
  .then(() => console.log('🟢 Бот успешно запущен'))
  .catch(err => console.error('🔴 Ошибка запуска бота:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));