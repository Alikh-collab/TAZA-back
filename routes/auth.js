import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import multer from "multer"
import path from "path"
import { query } from "../config/database.js"
import { authenticateToken } from "../middleware/auth.js"

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || "1234"

// Настройка multer для загрузки аватарок
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/avatars/")
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, "avatar-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Разрешены только изображения (JPEG, PNG, GIF)"))
    }
  },
})

// Регистрация
router.post("/register", upload.single("avatar"), async (req, res) => {
  try {
    const { name, email, password, phone } = req.body

    // Валидация
    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Имя, email и пароль обязательны",
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Пароль должен содержать минимум 6 символов",
      })
    }

    // Проверяем email формат
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Некорректный формат email",
      })
    }

    // Проверяем, существует ли пользователь
    const existingUsers = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()])

    if (existingUsers.length > 0) {
      return res.status(400).json({
        error: "Пользователь с таким email уже существует",
      })
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 12)

    let avatarUrl = null
    if (req.file) {
      avatarUrl = `/uploads/avatars/${req.file.filename}`
    }

    // Создаем пользователя
    const newUsers = await query(
      `INSERT INTO users (name, email, password, phone, avatar_url, role) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, name, email, phone, avatar_url, role, created_at`,
      [name.trim(), email.toLowerCase(), hashedPassword, phone || null, avatarUrl, "user"],
    )

    const user = newUsers[0]

    // Генерируем токен
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    )

    console.log(`✅ Новый пользователь зарегистрирован: ${user.email}`)

    res.status(201).json({
      success: true,
      message: "Регистрация прошла успешно!",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        role: user.role,
        created_at: user.created_at,
      },
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({
      error: "Ошибка при регистрации",
    })
  }
})

// Вход
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Валидация
    if (!email || !password) {
      return res.status(400).json({
        error: "Email и пароль обязательны",
      })
    }

    // Находим пользователя
    const users = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()])

    if (users.length === 0) {
      return res.status(401).json({
        error: "Неверный email или пароль",
      })
    }

    const user = users[0]

    // Проверяем пароль
    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.status(401).json({
        error: "Неверный email или пароль",
      })
    }

    // Генерируем токен
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    )

    console.log(`✅ Пользователь вошел в систему: ${user.email}`)

    res.json({
      success: true,
      message: "Вход выполнен успешно",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        role: user.role,
        created_at: user.created_at,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({
      error: "Ошибка при входе в систему",
    })
  }
})

// Получение данных текущего пользователя
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    user: req.user,
  })
})

// Обновление профиля
router.put("/profile", authenticateToken, upload.single("avatar"), async (req, res) => {
  try {
    const { name, phone } = req.body
    const userId = req.user.id

    let avatarUrl = null
    if (req.file) {
      avatarUrl = `/uploads/avatars/${req.file.filename}`
    }

    // Строим динамический запрос
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    if (name && name.trim()) {
      updateFields.push(`name = $${paramIndex}`)
      updateValues.push(name.trim())
      paramIndex++
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex}`)
      updateValues.push(phone || null)
      paramIndex++
    }

    if (avatarUrl) {
      updateFields.push(`avatar_url = $${paramIndex}`)
      updateValues.push(avatarUrl)
      paramIndex++
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: "Нет данных для обновления",
      })
    }

    updateFields.push("updated_at = CURRENT_TIMESTAMP")
    updateValues.push(userId)

    const queryText = `
      UPDATE users 
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING id, name, email, phone, avatar_url, role, created_at, updated_at
    `

    const result = await query(queryText, updateValues)

    if (result.length === 0) {
      return res.status(404).json({
        error: "Пользователь не найден",
      })
    }

    console.log(`✅ Профиль обновлен: ${result[0].email}`)

    res.json({
      success: true,
      message: "Профиль успешно обновлен",
      user: result[0],
    })
  } catch (error) {
    console.error("Update profile error:", error)
    res.status(500).json({
      error: "Ошибка при обновлении профиля",
    })
  }
})

// Изменение пароля
router.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const userId = req.user.id

    // Валидация
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Текущий и новый пароль обязательны",
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "Новый пароль должен содержать минимум 6 символов",
      })
    }

    // Получаем текущий пароль пользователя
    const users = await query("SELECT password FROM users WHERE id = $1", [userId])

    if (users.length === 0) {
      return res.status(404).json({
        error: "Пользователь не найден",
      })
    }

    // Проверяем текущий пароль
    const isValidPassword = await bcrypt.compare(currentPassword, users[0].password)

    if (!isValidPassword) {
      return res.status(400).json({
        error: "Неверный текущий пароль",
      })
    }

    // Хешируем новый пароль
    const hashedNewPassword = await bcrypt.hash(newPassword, 12)

    // Обновляем пароль
    await query("UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [
      hashedNewPassword,
      userId,
    ])

    console.log(`✅ Пароль изменен для пользователя: ${req.user.email}`)

    res.json({
      success: true,
      message: "Пароль успешно изменен",
    })
  } catch (error) {
    console.error("Change password error:", error)
    res.status(500).json({
      error: "Ошибка при изменении пароля",
    })
  }
})

export default router
