require('dotenv').config();
const express = require('express');
const axios = require('axios');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000; // Render по умолчанию использует 10000

app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Настройка SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true для 465, false для других портов (например, 587)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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

  const groupId = role === 'design' ? process.env.GROUP_DESIGN_ID : process.env.GROUP_DEV_ID;
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

    // 2. Пропускаем добавление в группу — делаем вручную
    console.log('Шаг 2: Пропускаем добавление в группу — выполняется вручную через интерфейс Kaiten');

    // 3. Создать карточку в Kaiten — с board_id и column_id
    console.log('Шаг 3: Создание карточки сотрудника...');
    const cardTitle = `Онбординг: ${fullName}`;
    const checklistItems = [
      "Запросить доступ к папкам (список по роли)",
      "Назначить телефон в Спарке",
      "Добавить в рассылки (список по роли)",
      "Пригласить в Kaiten + добавить в группу",
      "Дать заполнить заявление на ЗП",
      "Напомнить про карточку правок времени на 2-й день"
    ];

    // Дополнительные карточки только для дизайн-группы
    let additionalCardsText = '';
    if (role === 'design') {
      additionalCardsText = `
Дополнительно добавить в карточки с общей инфой:
- https://panna.kaiten.ru/32382746
- https://panna.kaiten.ru/32146386
- https://panna.kaiten.ru/32146660
- https://panna.kaiten.ru/32500879
`;
    }

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
  - \\\\gamma.local\\public\\Vinogradovo\\Design-Vinogradovo (чтение/редактирование)
  - \\\\fs-v-2.gamma.local\\images (чтение/редактирование)
  - G:\\Proizvodstvo\\ДИЗАЙН БЮРО (чтение/редактирование)
  - ... и другие по списку из ТЗ
- Роль в ТИС: Менеджер по рекламе
- Присвоить внутренний номер телефона в Спарке
- Добавить в рассылки: art@panna.ru, panna-r@panna.ru или db_design@panna.ru
${additionalCardsText}

---
⚠️ ВАЖНО: Добавьте сотрудника в группу Kaiten вручную:
- Группа: Дизайн-группа
- Ссылка: https://panna.kaiten.ru/admin/users
` : `
Запрос на создание доступов для нового сотрудника:

ФИО: ${fullName}
Email: ${email}
Роль: Группа разработки

Требуется:
- Доступ к интернету с соцсетями
- Права на папки:
  - \\\\gamma\\public\\images-design\\Illustrations (создание своей папки)
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\Фото наборов (редактирование)
  - G:\\Proizvodstvo\\ДИЗАЙН БЮРО (редактирование)
  - G:\\Proизводство\\ПРОЕКТЫ\\CОТВОРЕЛЬ+СОТВОРЕЛКИ и др. проекты (в зависимости от направления)
- Роль в ТИС: Дизайнер ПАННА
- Присвоить внутренний номер телефона в Спарке
- Добавить в рассылки: art@panna.ru, db_managers@panna.ru, zamena@panna.ru, freya_crystal@panna.ru и др.

---
⚠️ ВАЖНО: Добавьте сотрудника в группу Kaiten вручную:
- Группа: Группа разработки
- Ссылка: https://panna.kaiten.ru/admin/users
`;

    // Обязательно: board_id и column_id
    const cardData = {
      title: cardTitle,
      description: descriptionTemplate,
      board_id: parseInt(process.env.KAITEN_BOARD_ID),    // 1434550
      column_id: parseInt(process.env.KAITEN_COLUMN_ID)   // 4981617
    };

    const createCardRes = await axios.post(
      `https://panna.kaiten.ru/api/latest/cards`,
      cardData,
      {
        headers: {
          Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const cardId = createCardRes.data.id;
    console.log(`✅ Карточка успешно создана, ID: ${cardId}`);

    // 4. Создать чек-лист в карточке — ИСПРАВЛЕНО: name вместо title
    console.log('Шаг 4: Создание чек-листа...');
    for (const item of checklistItems) {
      await axios.post(
        `https://panna.kaiten.ru/api/latest/cards/${cardId}/checklists`,
        {
          name: item,           // ✅ Kaiten требует "name", а не "title"
          is_checked: false,
          sort_order: 0
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`Добавлен пункт: "${item}"`);
    }
    console.log('Чек-лист успешно создан');

    // 5. Отправить приветственное письмо
    console.log('Шаг 5: Отправка приветственного письма...');
    const mailTemplate = role === 'design' ? `
Привет, ${fullName}!

Добро пожаловать в команду Panna!

Ты в группе «Дизайн-группа». Вот что тебе нужно сделать в первые дни:
1. Ознакомься с доступами к папкам: \\\\gamma.local\\public\\Vinogradovo\\Design-Vinogradovo и др.
2. Проверь почту — мы добавили тебя в рассылки: art@panna.ru, panna-r@panna.ru или db_design@panna.ru.
3. На втором рабочем дне создай карточку на правки времени в Kaiten.
4. Роль в ТИС: Менеджер по рекламе.

Справочные материалы: [ссылки на внутренние ресурсы]

Если что-то не работает — пиши в IT.

С уважением,
Команда админов
` : `
Привет, ${fullName}!

Добро пожаловать в команду Panna!

Ты в группе «Разработка». Вот что тебе нужно сделать в первые дни:
1. Ознакомься с доступами к папкам: \\\\gamma.local\\public\\Vinogradovo\\Workspace и др.
2. Проверь почту — мы добавили тебя в рассылки: art@panna.ru, db_managers@panna.ru, zamena@panna.ru и др.
3. На втором рабочем дне создай карточку на правки времени в Kaiten.
4. Роль в ТИС: Дизайнер ПАННА.

Справочные материалы: [ссылки на внутренние ресурсы]

Если что-то не работает — пиши в IT.

С уважением,
Команда админов
`;

    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: email,
      subject: `Добро пожаловать в Panna, ${fullName}!`,
      text: mailTemplate,
    });
    console.log('Письмо успешно отправлено');

    res.json({ success: true, message: `Сотрудник ${fullName} успешно добавлен!` });
    console.log('=== Обработка завершена успешно ===');

  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
    if (error.response) {
      console.error('Статус ответа:', error.response.status);
      console.error('Данные ошибки:', error.response.data);
    }
    res.status(500).json({ error: 'Ошибка при добавлении сотрудника', details: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => { // Render требует 0.0.0.0
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
