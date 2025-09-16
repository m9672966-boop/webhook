const express = require('express');
const axios = require('axios');
require('dotenv').config();
const cron = require('node-cron');

const app = express();
app.use(express.json());

// Настройки
const KAITEN_API_URL = 'https://example.kaiten.ru/api/latest/tree-entities';
const SPACE_UID = '24bf3837-ec69-4a79-a6a1-c8fcd3c08f5d'; // ваш space uid
const ACCESS_TOKEN = process.env.KAITEN_TOKEN; // ваш токен доступа
const LAST_KNOWN_UID = process.env.LAST_KNOWN_UID || null;

let knownEntityUids = new Set();

// Обработка вебхука (если он работает)
app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;

  if (event === 'add') {
    const { entity_type, title, uid } = data;

    // Проверяем, является ли это документом (или блоком с типом документа)
    if (entity_type === 'block' || entity_type === 'document') {
      console.log(`Новый документ: ${title} (${uid})`);
      sendNotification(title, uid);
    }
  }

  res.status(200).send('OK');
});

// Фоновая проверка через API (раз в 5 минут)
cron.schedule('*/5 * * * *', async () => {
  try {
    const response = await axios.get(KAITEN_API_URL, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      },
      params: {
        limit: 500,
        parent_entity_uid: SPACE_UID,
        levels_count: 2
      }
    });

    const entities = response.data;
    const newEntities = entities.filter(entity => !knownEntityUids.has(entity.uid));

    for (const entity of newEntities) {
      if (entity.entity_type === 'block' || entity.entity_type === 'document') {
        console.log(`Найден новый документ: ${entity.title}`);
        sendNotification(entity.title, entity.uid);
      }
    }

    // Сохраняем известные UID
    knownEntityUids = new Set(entities.map(e => e.uid));
  } catch (error) {
    console.error('Ошибка при запросе к Kaiten:', error.message);
  }
});

function sendNotification(title, uid) {
  // Отправка уведомления (например, в Telegram, Slack, email)
  console.log(`Отправляю уведомление: новая инструкция "${title}"`);
  // Ваша логика отправки уведомлений
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
