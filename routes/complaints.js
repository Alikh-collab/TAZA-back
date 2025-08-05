import express from "express"
import multer from "multer"
import path from "path"
import { query } from "../config/database.js"
import { authenticateToken, requireOwnership } from "../middleware/auth.js"

const router = express.Router()

// Настройка multer для загрузки фото жалоб
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/complaints/")
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, "complaint-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Разрешены только изображения (JPEG, PNG, GIF)"))
    }
  },
})

// Создание жалобы
router.post("/", authenticateToken, upload.single("photo"), async (req, res) => {
  try {
    const { name, description, location_lat, location_lng, location_address } = req.body
    const userId = req.user.id

    // Валидация
    if (!name || !description || !location_lat || !location_lng) {
      return res.status(400).json({
        error: "Имя, описание и координаты обязательны",
      })
    }

    const lat = Number.parseFloat(location_lat)
    const lng = Number.parseFloat(location_lng)

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        error: "Некорректные координаты",
      })
    }

    // Проверяем координаты Казахстана (примерные границы)
    if (lat < 40 || lat > 56 || lng < 46 || lng > 88) {
      return res.status(400).json({
        error: "Координаты должны находиться в пределах Казахстана",
      })
    }

    let photoUrl = null
    if (req.file) {
      photoUrl = `/uploads/complaints/${req.file.filename}`
    }

    // Создаем жалобу
    const result = await query(
      `INSERT INTO complaints (user_id, name, location_lat, location_lng, location_address, description, photo_url, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id, created_at`,
      [userId, name.trim(), lat, lng, location_address?.trim() || null, description.trim(), photoUrl, "pending"],
    )

    console.log(`✅ Новая жалоба создана: ID ${result[0].id} от пользователя ${req.user.email}`)

    res.status(201).json({
      success: true,
      message: "Жалоба успешно отправлена",
      complaint: {
        id: result[0].id,
        created_at: result[0].created_at,
      },
    })
  } catch (error) {
    console.error("Create complaint error:", error)
    res.status(500).json({
      error: "Ошибка при создании жалобы",
    })
  }
})

// Получение всех публичных жалоб
router.get("/public", async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query

    let queryText = `
      SELECT 
        c.id,
        c.name,
        c.location_lat,
        c.location_lng,
        c.location_address,
        c.description,
        c.photo_url,
        c.status,
        c.created_at,
        u.name as user_name
      FROM complaints c
      JOIN users u ON c.user_id = u.id
    `

    const queryParams = []
    let paramIndex = 1

    if (status && ["pending", "in_progress", "resolved"].includes(status)) {
      queryText += ` WHERE c.status = $${paramIndex}`
      queryParams.push(status)
      paramIndex++
    }

    queryText += ` ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    queryParams.push(Number.parseInt(limit), Number.parseInt(offset))

    const complaints = await query(queryText, queryParams)

    // Получаем общую статистику
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved
      FROM complaints
    `)

    res.json({
      success: true,
      complaints,
      stats: stats[0],
      pagination: {
        limit: Number.parseInt(limit),
        offset: Number.parseInt(offset),
        total: Number.parseInt(stats[0].total),
      },
    })
  } catch (error) {
    console.error("Get public complaints error:", error)
    res.status(500).json({
      error: "Ошибка при получении жалоб",
    })
  }
})

// Получение жалоб текущего пользователя
router.get("/my", authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query
    const userId = req.user.id

    let queryText = "SELECT * FROM complaints WHERE user_id = $1"
    const queryParams = [userId]
    let paramIndex = 2

    if (status && ["pending", "in_progress", "resolved"].includes(status)) {
      queryText += ` AND status = $${paramIndex}`
      queryParams.push(status)
      paramIndex++
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    queryParams.push(Number.parseInt(limit), Number.parseInt(offset))

    const complaints = await query(queryText, queryParams)

    // Получаем статистику пользователя
    const userStats = await query(
      `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved
      FROM complaints
      WHERE user_id = $1
    `,
      [userId],
    )

    res.json({
      success: true,
      complaints,
      stats: userStats[0],
      pagination: {
        limit: Number.parseInt(limit),
        offset: Number.parseInt(offset),
        total: Number.parseInt(userStats[0].total),
      },
    })
  } catch (error) {
    console.error("Get my complaints error:", error)
    res.status(500).json({
      error: "Ошибка при получении ваших жалоб",
    })
  }
})

// Получение конкретной жалобы
router.get("/:id", async (req, res) => {
  try {
    const complaintId = Number.parseInt(req.params.id)

    if (isNaN(complaintId)) {
      return res.status(400).json({
        error: "Некорректный ID жалобы",
      })
    }

    const complaints = await query(
      `
      SELECT 
        c.*,
        u.name as user_name,
        u.email as user_email
      FROM complaints c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `,
      [complaintId],
    )

    if (complaints.length === 0) {
      return res.status(404).json({
        error: "Жалоба не найдена",
      })
    }

    res.json({
      success: true,
      complaint: complaints[0],
    })
  } catch (error) {
    console.error("Get complaint error:", error)
    res.status(500).json({
      error: "Ошибка при получении жалобы",
    })
  }
})

// Обновление жалобы (только владелец)
router.put("/:id", authenticateToken, requireOwnership("id"), upload.single("photo"), async (req, res) => {
  try {
    const complaintId = Number.parseInt(req.params.id)
    const { name, description, location_address } = req.body

    // Строим динамический запрос
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    if (name && name.trim()) {
      updateFields.push(`name = $${paramIndex}`)
      updateValues.push(name.trim())
      paramIndex++
    }

    if (description && description.trim()) {
      updateFields.push(`description = $${paramIndex}`)
      updateValues.push(description.trim())
      paramIndex++
    }

    if (location_address !== undefined) {
      updateFields.push(`location_address = $${paramIndex}`)
      updateValues.push(location_address?.trim() || null)
      paramIndex++
    }

    if (req.file) {
      updateFields.push(`photo_url = $${paramIndex}`)
      updateValues.push(`/uploads/complaints/${req.file.filename}`)
      paramIndex++
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: "Нет данных для обновления",
      })
    }

    updateFields.push("updated_at = CURRENT_TIMESTAMP")
    updateValues.push(complaintId)

    const queryText = `
      UPDATE complaints 
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `

    const result = await query(queryText, updateValues)

    console.log(`✅ Жалоба обновлена: ID ${complaintId}`)

    res.json({
      success: true,
      message: "Жалоба успешно обновлена",
      complaint: result[0],
    })
  } catch (error) {
    console.error("Update complaint error:", error)
    res.status(500).json({
      error: "Ошибка при обновлении жалобы",
    })
  }
})

// Удаление жалобы (только владелец)
router.delete("/:id", authenticateToken, requireOwnership("id"), async (req, res) => {
  try {
    const complaintId = Number.parseInt(req.params.id)

    await query("DELETE FROM complaints WHERE id = $1", [complaintId])

    console.log(`✅ Жалоба удалена: ID ${complaintId}`)

    res.json({
      success: true,
      message: "Жалоба успешно удалена",
    })
  } catch (error) {
    console.error("Delete complaint error:", error)
    res.status(500).json({
      error: "Ошибка при удалении жалобы",
    })
  }
})

export default router
