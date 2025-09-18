require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Middleware для базовой аутентификации
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).set('WWW-Authenticate', 'Basic realm="Restricted Area"').send('Требуется авторизация');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    return res.status(401).set('WWW-Authenticate', 'Basic realm="Restricted Area"').send('Неверный логин или пароль');
  }
};

// Основной маршрут — защищён авторизацией
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: добавление сотрудника — защищён авторизацией
app.post('/new-employee', requireAuth, async (req, res) => {
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
    }

    // 3. Создать карточку в Kaiten — с board_id и column_id
    console.log('Шаг 3: Создание карточки сотрудника...');
    const cardTitle = `Онбординг: ${fullName}`;

    // Полный шаблон описания для IT — без напоминаний про группу
    const descriptionTemplate = role === 'design' ? `
Запрос на создание доступов для нового сотрудника:

ФИО: ${fullName}
Email: ${email}
Роль: Дизайн-группа

Требуется:
- Доступ к интернету с соцсетями
- Права на папки:
  - \\\\gamma\\public\\images-design\\Illustrations (создание своей рабочей папки)
  - \\\\gamma.local\\public\\Vinogradovo\\Design-Vinogradovo (чтение/редактирование)
  - \\\\fs-v-2.gamma.local\\images (чтение/редактирование)
  - \\\\gamma.local\\public\\Images (чтение/редактирование)
  - \\\\gamma.local\\public\\Layouts (чтение/редактирование)
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\TOOLS (чтение/редактирование)
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\РЕКЛАМНЫЕ МАКЕТЫ (чтение/редактирование)
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\Фото наборов (чтение/редактирование)
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace (чтение/редактирование)
  - “Шаблоны полиграфии”, “Контент и бланк комментариев”, “Разработка товара” (чтение/редактирование)
  - G:\\Proizvodstvo\\ДИЗАЙН БЮРО (чтение/редактирование)
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\0_В ПЕЧАТЬ (чтение/редактирование)
  - G:\\Proizvodstvo\\БУМБЕЛ\\ДИЗАЙН (чтение/редактирование)
  - G:\\Proizvodstvo\\КАНЦЕЛЯРИЯ\\КАРАНДАШНА ФАБРИКА\\ВКФ_МАКЕТЫ (чтение/редактирование)
  - G:\\Proizvodstvo\\КАНЦЕЛЯРИЯ\\КАРАНДАШНА ФАБРИКА\\ВКФ_ОРИГИНАЛЫ В ПЕЧАТЬ (чтение/редактирование)
- На чтение:
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\ПЕРЕВОД
  - G:\\Proizvodstvo\\Общая
  - \\\\gamma.local\\public\\Image_Bank\\
  - G:\\Proizvodstvo\\БУМБЕЛ\\ФОТО, КОНТЕНТ
  - \\\\gamma\\archive\\reklama\\Изображения_товаров

- Роль в ТИС: Менеджер по рекламе
- Присвоить внутренний номер телефона в Спарке
- Пригласить в Kaiten и добавить в группу "Дизайн-группа"
- Добавить в рассылки:
  - art@panna.ru — рассылка всего ДБ
  - panna-r@panna.ru — рассылка верстки
  - или db_design@panna.ru — рассылка дизайнеры
- Дать заполнить заявление на ЗП
- Добавить в карточки с общей информацией:
  - https://panna.kaiten.ru/32382746
  - https://panna.kaiten.ru/32146386
  - https://panna.kaiten.ru/32146660
  - https://panna.kaiten.ru/32500879

---
ℹ️ На второй рабочий день напомнить сотруднику создать карточку на правки рабочего времени (убрать опоздание + учесть время трудоустройства).
` : `
Запрос на создание доступов для нового сотрудника:

ФИО: ${fullName}
Email: ${email}
Роль: Группа разработки

Требуется:
- Доступ к интернету с соцсетями
- Права на папки:
  - \\\\gamma\\public\\images-design\\Illustrations (создание своей рабочей папки)
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\Фото наборов (редактирование)
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace (редактирование)
  - “Контент и бланк комментариев”, “Разработка товара” (редактирование)
  - G:\\Proizvodstvo\\ДИЗАЙН БЮРО (редактирование)
  - В зависимости от направления — папка проекта:
    - G:\\Proizvodstvo\\ПРОЕКТЫ\\CОТВОРЕЛЬ+СОТВОРЕЛКИ
    - G:\\Proizvodstvo\\ПРОЕКТЫ\\MIADOLLA
    - G:\\Proizvodstvo\\ПРОЕКТЫ\\PANNA
    - G:\\Proizvodstvo\\ПРОЕКТЫ\\ФРЕЯ
    - G:\\Proizvodstvo\\ПРОЕКТЫ\\ОБЩАЯ ПАПКА (всех)
- На чтение:
  - \\\\fs-v-2.gamma.local\\images
  - \\\\gamma.local\\public\\Images
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\TOOLS
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\РЕКЛАМНЫЕ МАКЕТЫ
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\ПЕРЕВОД
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace
  - “Шаблоны полиграфии”
  - \\\\gamma.local\\public\\Vinogradovo\\Workspace\\0_В ПЕЧАТЬ
  - G:\\Proizvodstvo\\Общая
  - \\\\gamma.local\\public\\Image_Bank\\

- Роль в ТИС: Дизайнер ПАННА
- Присвоить внутренний номер телефона в Спарке
- Пригласить в Kaiten и добавить в группу "Менеджеры, разработчики"
- Добавить в рассылки:
  - art@panna.ru — рассылка всего ДБ
  - db_managers@panna.ru — рассылка менеджеров
  - zamena@panna.ru — рассылка для поиска замены
  - freya_crystal@panna.ru — кристальная мозаика
  - freya_design@panna.ru — картины по номерам
  - bumbel-art@panna.ru — бумбел
  - embroidery@panna.ru — вышивка
  - toys@miadolla.ru — миадолла
- Дать заполнить заявление на ЗП

---
ℹ️ На второй рабочий день напомнить сотруднику создать карточку на правки рабочего времени (убрать опоздание + учесть время трудоустройства).
`;

    // Обязательно: board_id и column_id
    const cardData = {
      title: cardTitle,
      description: descriptionTemplate,
      board_id: parseInt(process.env.KAITEN_BOARD_ID),
      column_id: parseInt(process.env.KAITEN_COLUMN_ID)
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

    // 4. Создать ОДИН чек-лист и добавить в него пункты
    console.log('Шаг 4: Создание чек-листа и добавление пунктов...');
    const checklistName = "Онбординг";
    const checklistItems = [
      "Запросить доступ к папкам (список по роли)",
      "Назначить телефон в Спарке",
      "Добавить в рассылки (список по роли)",
      "Пригласить в Kaiten + добавить в группу",
      "Дать заполнить заявление на ЗП",
      "Напомнить про карточку правок времени на 2-й день"
    ];

    // Создаем один чек-лист
    const createChecklistRes = await axios.post(
      `https://panna.kaiten.ru/api/latest/cards/${cardId}/checklists`,
      {
        name: checklistName,
        sort_order: 1
      },
      { headers: { Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}` } }
    );

    const checklistId = createChecklistRes.data.id;
    console.log(`✅ Чек-лист создан, ID: ${checklistId}`);

    // Добавляем пункты в этот чек-лист с задержкой
    for (const item of checklistItems) {
      await axios.post(
        `https://panna.kaiten.ru/api/latest/cards/${cardId}/checklists/${checklistId}/items`,
        {
          text: item,
          sort_order: 1
        },
        { headers: { Authorization: `Bearer ${process.env.KAITEN_API_TOKEN}` } }
      );
      console.log(`✅ Добавлен пункт: "${item}"`);

      // Задержка 500 мс между запросами
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log('Чек-лист успешно создан');

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
