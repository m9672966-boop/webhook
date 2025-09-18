require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Основной маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: добавление сотрудника
app.post('/new-employee', async (req, res) => {
  const { email, fullName, role } = req.body;

  console.log('=== Начало обработки запроса ===');
  console.log('Полученные данные:', { email, fullName, role });

  if (!email || !fullName || !role) {
    console.log('Ошибка: не заполнены обязательные поля');
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  const roleName = role === 'design' ? 'Дизайн-группа' : 'Группа разработки';
  console.log(`Выбрана роль: ${roleName}`);

  try {
    // 1. Проверить/создать пользователя в Kaiten
    console.log('Шаг 1: Поиск пользователя по email...');
    let userId;

    const checkUserRes = await axios.get(`https://panna.kaiten.ru/api/latest/users?email=${email}`, {
      headers: { Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}` },
    });

    if (checkUserRes.data.length > 0) {
      userId = checkUserRes.data[0].id;
      console.log(`Пользователь найден, ID: ${userId}`);
    } else {
      console.log('Пользователь не найден, создаём нового...');
      const createUserRes = await axios.post(
        'https://panna.kaiten.ru/api/latest/users',
        { email, full_name: fullName },
        { headers: { Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}` } }
      );
      userId = createUserRes.data.id;
      console.log(`Создан пользователь с ID: ${userId}`);
    }

    // 2. Добавить в группу — АВТОМАТИЧЕСКИ (с правильными UID)
    console.log(`Шаг 2: Добавление в группу ${roleName}...`);
    try {
      const groupUid = role === 'design'
        ? process.env.GROUP_DESIGN_UID  // UID для "Дизайн-группа"
        : process.env.GROUP_DEV_UID;    // UID для "Группа разработки"

      await axios.post(
        `https://panna.kaiten.ru/api/latest/groups/${groupUid}/users`,
        {
          user_id: userId,
          request_id: `onboarding_${Date.now()}`,
          operator_comment: "Автоматическое добавление при онбординге"
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Успешно добавлен в группу');
    } catch (error) {
      console.warn('⚠️ Не удалось добавить в группу через API:', error.message);
      console.warn('ℹ️ Добавьте сотрудника в группу вручную через интерфейс Kaiten.');
    }

    // 3. Создать карточку в Kaiten — с board_id и column_id
    console.log('Шаг 3: Создание карточки сотрудника...');
    const cardTitle = `Онбординг: ${fullName}`;

    // Шаблон описания для IT — с напоминанием про группу
    const descriptionTemplate = role === 'design' ? `
Запрос на создание доступов для нового сотрудника:

ФИО: ${fullName}
Email: ${email}
Роль: Дизайн-группа

Требуется:
- Доступ к интернету с соцсетями
- Права на папки:
  - \\\\gamma\\public\\images-design\\Illustrations (создание)
  - \\\\
