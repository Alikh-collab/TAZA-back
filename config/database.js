import pkg from "pg"
import dotenv from "dotenv"

dotenv.config()

const { Pool } = pkg

// Создаем пул соединений для PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://alikhan:eo6IHx316t8r5FhjDEnoGisuSeC2lVvb@dpg-d28tg6ali9vc73994ehg-a.oregon-postgres.render.com/instdb',
  ssl: { rejectUnauthorized: false },
  // user: process.env.DB_USER || "postgres",
  // host: process.env.DB_HOST || "localhost",
  // database: process.env.DB_NAME || "taza_su",
  // password: process.env.DB_PASSWORD || "password",
  // port: process.env.DB_PORT || 5432,
  // max: 20, // максимум соединений в пуле
  // idleTimeoutMillis: 30000,
  // connectionTimeoutMillis: 2000,
})

// Тестируем подключение
pool.on("connect", () => {
  console.log("✅ Подключение к PostgreSQL установлено")
})

pool.on("error", (err) => {
  console.error("❌ Ошибка подключения к базе данных:", err)
})

// Функция для выполнения запросов
export const query = async (text, params = []) => {
  const start = Date.now()
  try {
    const result = await pool.query(text, params)
    const duration = Date.now() - start
    console.log(`🔍 SQL запрос выполнен за ${duration}ms`)
    return result.rows
  } catch (error) {
    console.error("❌ Ошибка SQL запроса:", error.message)
    throw error
  }
}

// Функция для транзакций
export const transaction = async (callback) => {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await callback(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export default pool
