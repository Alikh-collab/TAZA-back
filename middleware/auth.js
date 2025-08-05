import jwt from "jsonwebtoken"
import { query } from "../config/database.js"

const JWT_SECRET = "1234"

// Middleware для проверки токена
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1]

    if (!token) {
      return res.status(401).json({ error: "Токен доступа не предоставлен" })
    }

    const decoded = jwt.verify(token, JWT_SECRET)

    // Получаем актуальные данные пользователя
    const users = await query("SELECT id, name, email, phone, avatar_url, role, created_at FROM users WHERE id = $1", [
      decoded.userId,
    ])

    if (users.length === 0) {
      return res.status(401).json({ error: "Пользователь не найден" })
    }

    req.user = users[0]
    next()
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(403).json({ error: "Недействительный токен" })
    }
    if (error.name === "TokenExpiredError") {
      return res.status(403).json({ error: "Токен истек" })
    }
    console.error("Auth middleware error:", error)
    return res.status(500).json({ error: "Ошибка авторизации" })
  }
}

// Middleware для проверки роли администратора
export const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Требуются права администратора" })
  }
  next()
}

// Middleware для проверки владельца ресурса
export const requireOwnership = (resourceIdField = "id") => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdField]

      // Для администраторов пропускаем проверку владения
      if (req.user.role === "admin") {
        return next()
      }

      // Проверяем владение ресурсом (например, жалобой)
      const resources = await query("SELECT user_id FROM complaints WHERE id = $1", [resourceId])

      if (resources.length === 0) {
        return res.status(404).json({ error: "Ресурс не найден" })
      }

      if (resources[0].user_id !== req.user.id) {
        return res.status(403).json({ error: "Нет прав доступа к этому ресурсу" })
      }

      next()
    } catch (error) {
      console.error("Ownership middleware error:", error)
      return res.status(500).json({ error: "Ошибка проверки прав доступа" })
    }
  }
}
