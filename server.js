require('dotenv').config();
const express = require('express');
const axios = require('axios');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Настройка SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true для 465, false для других портов
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

  if (!email || !fullName || !role) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  const groupId = role === 'design' ? process.env.GROUP_DESIGN_ID : process.env.GROUP_DEV_ID;
  const roleName = role === 'design' ? 'Дизайн-группа' : 'Группа разработки';

  try {
    // 1. Проверить/создать пользователя в Kaiten
    let userId;
    const checkUserRes = await axios.get(`https://panna.kaiten.ru/api/latest/users?email=${email}`, {
      headers: { Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}` },
    });

    if (checkUserRes.data.length > 0) {
      userId = checkUserRes.data[0].id;
    } else {
      const createUserRes = await axios.post(
        'https://panna.kaiten.ru/api/latest/users',
        { email, full_name: fullName },
        { headers: { Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}` } }
      );
      userId = createUserRes.data.id;
    }

    // 2. Добавить в группу
    await axios.post(
      `https://panna.kaiten.ru/api/latest/user-groups/${groupId}/members`,
      { user_id: userId },
      { headers: { Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}` } }
    );

    // 3. Создать карточку в Kaiten
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

    // Шаблон описания для IT
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
  - G:\\Proizvodstvo\\ПРОЕКТЫ\\CОТВОРЕЛЬ+СОТВОРЕЛКИ и др. проекты (в зависимости от направления)
- Роль в ТИС: Дизайнер ПАННА
- Присвоить внутренний номер телефона в Спарке
- Добавить в рассылки: art@panna.ru, db_managers@panna.ru, zamena@panna.ru, freya_crystal@panna.ru и др.
`;

    const cardData = {
      title: cardTitle,
      description: descriptionTemplate,
      space_id: process.env.KAITEN_SPACE_ID,
      board_id: process.env.KAITEN_BOARD_ID,
    };

    const createCardRes = await axios.post(
      'https://panna.kaiten.ru/api/latest/cards',
      cardData,
      { headers: { Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}` } }
    );

    const cardId = createCardRes.data.id;

    // 4. Создать чек-лист в карточке
    for (const item of checklistItems) {
      await axios.post(
        `https://panna.kaiten.ru/api/latest/cards/${cardId}/checklists`,
        { title: item, is_checked: false },
        { headers: { Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}` } }
      );
    }

    // 5. Отправить приветственное письмо
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

    res.json({ success: true, message: `Сотрудник ${fullName} успешно добавлен!` });

  } catch (error) {
    console.error('Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка при добавлении сотрудника', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
