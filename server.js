import express from "express"
import cors from "cors"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"

// Импорт роутов
import authRoutes from "./routes/auth.js"
import complaintRoutes from "./routes/complaints.js"
import adminRoutes from "./routes/admin.js"
import uploadRoutes from "./routes/upload.js"


// Настройка путей для ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Загрузка переменных окружения
dotenv.config()

const app = express()
const PORT = process.env.PORT || 6000;


// Создаем папки для загрузок
const uploadsDir = path.join(__dirname, "uploads")
const avatarsDir = path.join(uploadsDir, "avatars")
const complaintsDir = path.join(uploadsDir, "complaints")

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true })
if (!fs.existsSync(complaintsDir)) fs.mkdirSync(complaintsDir, { recursive: true })

// Middleware безопасности
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: {
    error: "Слишком много запросов с вашего IP, попробуйте позже",
  },
})
app.use("/api/", limiter)

// CORS настройки
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "https://6891f872e58f9d5bf105b1c2--tazasu-amjilt.netlify.app",
    credentials: true,
  }),
)

// Парсинг JSON и URL-encoded данных
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Статические файлы
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
  next()
})

// API роуты
app.use("/api/auth", authRoutes)
app.use("/api/complaints", complaintRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/upload", uploadRoutes)

// Главная страница API
app.get("/api", (req, res) => {
  res.json({
    message: "TAZA SU API v1.0",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: "/api/auth",
      complaints: "/api/complaints",
      admin: "/api/admin",
      upload: "/api/upload",
    },
  })
})

// Проверка здоровья сервера
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// Обработка 404
app.use("/api/*", (req, res) => {
  res.status(404).json({
    error: "API endpoint не найден",
    path: req.path,
    method: req.method,
  })
})

// Глобальная обработка ошибок
app.use((err, req, res, next) => {
  console.error("Server Error:", err)

  // Multer ошибки
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "Файл слишком большой. Максимальный размер: 10MB",
    })
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      error: "Неожиданный файл в запросе",
    })
  }

  // JWT ошибки
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "Недействительный токен",
    })
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "Токен истек",
    })
  }

  // База данных ошибки
  if (err.code === "23505") {
    // Unique constraint violation
    return res.status(400).json({
      error: "Данные уже существуют",
    })
  }

  // Общая ошибка сервера
  res.status(500).json({
    error: "Внутренняя ошибка сервера",
    ...(process.env.NODE_ENV === "development" && { details: err.message }),
  })
})

// Запуск сервера
app.listen(PORT, () => {
  console.log("🚀 TAZA SU Backend Server запущен!")
  console.log(`📡 Сервер работает на порту: ${PORT}`)
  console.log(`🌐 API доступен по адресу: http://localhost:${PORT}/api`)
  console.log(`📁 Папки для загрузок созданы`)
  console.log(`🔒 Безопасность: Helmet + Rate Limiting включены`)
  console.log(`⚡ Режим: ${process.env.NODE_ENV || "development"}`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Получен сигнал SIGTERM, завершение работы...")
  process.exit(0)
})

process.on("SIGINT", () => {
  console.log("🛑 Получен сигнал SIGINT, завершение работы...")
  process.exit(0)
})
