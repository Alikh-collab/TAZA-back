import { query } from "../config/database.js"
import bcrypt from "bcryptjs"

async function initDatabase() {
  try {
    console.log("🔄 Инициализация базы данных TAZA SU...")

    // Удаляем существующие таблицы
    console.log("📝 Удаление существующих таблиц...")
    await query("DROP TABLE IF EXISTS complaints CASCADE")
    await query("DROP TABLE IF EXISTS updates CASCADE")
    await query("DROP TABLE IF EXISTS users CASCADE")

    // Создание таблицы пользователей
    console.log("👥 Создание таблицы пользователей...")
    await query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        avatar_url TEXT,
        role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Создание таблицы жалоб
    console.log("📋 Создание таблицы жалоб...")
    await query(`
      CREATE TABLE complaints (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        location_lat DECIMAL(10, 8) NOT NULL CHECK (location_lat BETWEEN -90 AND 90),
        location_lng DECIMAL(11, 8) NOT NULL CHECK (location_lng BETWEEN -180 AND 180),
        location_address TEXT,
        description TEXT NOT NULL,
        photo_url TEXT,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    // Создание таблицы updates
    console.log("Создание таблицы updates...")
    await query(`
      CREATE TABLE updates (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Создание индексов для оптимизации
    console.log("🔍 Создание индексов...")
    await query("CREATE INDEX idx_users_email ON users(email)")
    await query("CREATE INDEX idx_users_role ON users(role)")
    await query("CREATE INDEX idx_complaints_user_id ON complaints(user_id)")
    await query("CREATE INDEX idx_complaints_status ON complaints(status)")
    await query("CREATE INDEX idx_complaints_location ON complaints(location_lat, location_lng)")
    await query("CREATE INDEX idx_complaints_created_at ON complaints(created_at)")

    // Создание тестового администратора
    console.log("👤 Создание тестового администратора...")
    const hashedAdminPassword = await bcrypt.hash("admin123", 12)
    await query("INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)", [
      "Администратор TAZA SU",
      "admin@tazasu.kz",
      hashedAdminPassword,
      "admin",
    ])

    // Создание тестового пользователя
    console.log("👤 Создание тестового пользователя...")
    const hashedUserPassword = await bcrypt.hash("user123", 12)
    await query("INSERT INTO users (name, email, password, phone, role) VALUES ($1, $2, $3, $4, $5)", [
      "Тестовый Пользователь",
      "user@test.com",
      hashedUserPassword,
      "+7 777 123 4567",
      "user",
    ])

    // Получаем ID пользователей
    const adminUser = await query("SELECT id FROM users WHERE email = $1", ["admin@tazasu.kz"])
    const testUser = await query("SELECT id FROM users WHERE email = $1", ["user@test.com"])

    const adminId = adminUser[0].id
    const userId = testUser[0].id

    // Создание тестовых жалоб
    console.log("📝 Создание тестовых жалоб...")
    const testComplaints = [
      {
        user_id: userId,
        name: "Айгуль Нурланова",
        lat: 43.222,
        lng: 76.8512,
        address: "Алматы, ул. Абая 150",
        description:
          "Вода имеет неприятный запах и мутный цвет. Проблема наблюдается уже неделю. Дети отказываются пить воду из-под крана.",
        status: "pending",
      },
      {
        user_id: userId,
        name: "Ерлан Касымов",
        lat: 51.1694,
        lng: 71.4491,
        address: "Нур-Султан, ул. Кенесары 40",
        description:
          "Низкое давление воды, иногда полностью отсутствует подача. Особенно проблематично в утренние и вечерние часы.",
        status: "in_progress",
      },
      {
        user_id: adminId,
        name: "Гульнара Абдуллина",
        lat: 43.6532,
        lng: 51.1694,
        address: "Актобе, ул. Молдагуловой 25",
        description:
          "Вода с привкусом хлора, дети жалуются на боли в животе после употребления воды. Требуется срочная проверка качества.",
        status: "resolved",
      },
      {
        user_id: userId,
        name: "Асхат Жумабеков",
        lat: 50.2833,
        lng: 57.1667,
        address: "Петропавловск, ул. Конституции 15",
        description:
          "Ржавая вода течет из кранов уже третий день. Невозможно использовать для питья и приготовления пищи.",
        status: "pending",
      },
      {
        user_id: adminId,
        name: "Динара Сагындыкова",
        lat: 42.3417,
        lng: 69.59,
        address: "Шымкент, ул. Байтурсынова 89",
        description: "Периодически отключается водоснабжение без предупреждения. График подачи воды не соблюдается.",
        status: "in_progress",
      },
    ]

    for (const complaint of testComplaints) {
      await query(
        `INSERT INTO complaints (user_id, name, location_lat, location_lng, location_address, description, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          complaint.user_id,
          complaint.name,
          complaint.lat,
          complaint.lng,
          complaint.address,
          complaint.description,
          complaint.status,
        ],
      )
    }
    // Добавление тестовых новостей
    console.log("Добавление тестовых новостей...")
    await query(`INSERT INTO updates (title, description) VALUES ($1, $2)`, [
      "Обновление системы",
      "Мы обновили систему для повышения стабильности и скорости работы.",
    ])
    await query(`INSERT INTO updates (title, description) VALUES ($1, $2)`, [
      "Новые функции",
      "Добавлены новые функции для отслеживания статуса жалоб.",
    ])

    // Создание триггера для автоматического обновления updated_at
    console.log("⚡ Создание триггеров...")
    await query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `)

    await query(`
      CREATE TRIGGER update_users_updated_at 
      BEFORE UPDATE ON users 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `)

    await query(`
      CREATE TRIGGER update_complaints_updated_at 
      BEFORE UPDATE ON complaints 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `)

    // Проверяем созданные данные
    const userCount = await query("SELECT COUNT(*) as count FROM users")
    const complaintCount = await query("SELECT COUNT(*) as count FROM complaints")
    const updateCount = await query("SELECT COUNT(*) as count FROM updates")

    console.log("✅ База данных успешно инициализирована!")
    console.log(`👥 Создано пользователей: ${userCount[0].count}`)
    console.log(`📋 Создано жалоб: ${complaintCount[0].count}`)
    console.log(`📰 Создано новостей: ${updateCount[0].count}`)
    console.log("")
    console.log("🔑 Тестовые аккаунты:")
    console.log("   Администратор: admin@tazasu.kz / admin123")
    console.log("   Пользователь: user@test.com / user123")
    console.log("")
    console.log("🚀 Теперь можно запустить сервер: npm run dev")

    process.exit(0)
  } catch (error) {
    console.error("❌ Ошибка инициализации базы данных:", error)
    process.exit(1)
  }
}

initDatabase()
