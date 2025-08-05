import express from "express"
import { query } from "../config/database.js"
import { authenticateToken, requireAdmin } from "../middleware/auth.js"

const router = express.Router()

router.use(authenticateToken, requireAdmin)

router.get("/complaints", async (req, res) => {
  try {
    const { status, limit = 100, offset = 0, search } = req.query

    let queryText = `
      SELECT 
        c.*,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone
      FROM complaints c
      JOIN users u ON c.user_id = u.id
    `

    const queryParams = []
    const conditions = []
    let paramIndex = 1

    if (status && ["pending", "in_progress", "resolved"].includes(status)) {
      conditions.push(`c.status = $${paramIndex}`)
      queryParams.push(status)
      paramIndex++
    }

    if (search && search.trim()) {
      conditions.push(
        `(c.name ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex} OR c.location_address ILIKE $${paramIndex})`,
      )
      queryParams.push(`%${search.trim()}%`)
      paramIndex++
    }

    if (conditions.length > 0) {
      queryText += ` WHERE ${conditions.join(" AND ")}`
    }

    queryText += ` ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    queryParams.push(Number.parseInt(limit), Number.parseInt(offset))

    const complaints = await query(queryText, queryParams)

    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as this_week,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as this_month
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
    console.error("Get admin complaints error:", error)
    res.status(500).json({
      error: "Ошибка при получении жалоб",
    })
  }
})

// Обновление статуса жалобы
router.patch("/complaints/:id/status", async (req, res) => {
  try {
    const { status } = req.body
    const complaintId = Number.parseInt(req.params.id)

    if (!["pending", "in_progress", "resolved"].includes(status)) {
      return res.status(400).json({
        error: "Недопустимый статус. Разрешены: pending, in_progress, resolved",
      })
    }

    if (isNaN(complaintId)) {
      return res.status(400).json({
        error: "Некорректный ID жалобы",
      })
    }

    const result = await query(
      "UPDATE complaints SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [status, complaintId],
    )

    if (result.length === 0) {
      return res.status(404).json({
        error: "Жалоба не найдена",
      })
    }

    console.log(`✅ Статус жалобы изменен: ID ${complaintId} -> ${status} (админ: ${req.user.email})`)

    res.json({
      success: true,
      message: "Статус успешно обновлен",
      complaint: result[0],
    })
  } catch (error) {
    console.error("Update complaint status error:", error)
    res.status(500).json({
      error: "Ошибка при обновлении статуса",
    })
  }
})

router.delete("/complaints/:id", async (req, res) => {
  try {
    const complaintId = Number.parseInt(req.params.id)

    if (isNaN(complaintId)) {
      return res.status(400).json({
        error: "Некорректный ID жалобы",
      })
    }

    const result = await query("DELETE FROM complaints WHERE id = $1 RETURNING *", [complaintId])

    if (result.length === 0) {
      return res.status(404).json({
        error: "Жалоба не найдена",
      })
    }

    console.log(`✅ Жалоба удалена администратором: ID ${complaintId} (админ: ${req.user.email})`)

    res.json({
      success: true,
      message: "Жалоба успешно удалена",
    })
  } catch (error) {
    console.error("Admin delete complaint error:", error)
    res.status(500).json({
      error: "Ошибка при удалении жалобы",
    })
  }
})

// Получение статистики для дашборда
router.get("/dashboard", async (req, res) => {
  try {
    // Общая статистика
    const generalStats = await query(`
      SELECT 
        COUNT(*) as total_complaints,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as this_week,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as this_month
      FROM complaints
    `)

    // Статистика пользователей
    const userStats = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as new_this_week,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_this_month
      FROM users
    `)

    // Статистика по дням (последние 7 дней)
    const dailyStats = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as complaints_count
      FROM complaints
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `)

    // Топ регионов по жалобам
    const regionStats = await query(`
      SELECT 
        location_address,
        COUNT(*) as complaints_count
      FROM complaints
      WHERE location_address IS NOT NULL
      GROUP BY location_address
      ORDER BY complaints_count DESC
      LIMIT 10
    `)

    res.json({
      success: true,
      dashboard: {
        complaints: generalStats[0],
        users: userStats[0],
        daily_stats: dailyStats,
        top_regions: regionStats,
      },
    })
  } catch (error) {
    console.error("Get dashboard error:", error)
    res.status(500).json({
      error: "Ошибка при получении статистики",
    })
  }
})

router.get("/users", async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query

    let queryText = `
      SELECT 
        id, name, email, phone, role, avatar_url, created_at,
        (SELECT COUNT(*) FROM complaints WHERE user_id = users.id) as complaints_count
      FROM users
    `

    const queryParams = []
    let paramIndex = 1

    if (search && search.trim()) {
      queryText += ` WHERE (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`
      queryParams.push(`%${search.trim()}%`)
      paramIndex++
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    queryParams.push(Number.parseInt(limit), Number.parseInt(offset))

    const users = await query(queryText, queryParams)

    // Общее количество пользователей
    const totalUsers = await query("SELECT COUNT(*) as total FROM users")

    res.json({
      success: true,
      users,
      pagination: {
        limit: Number.parseInt(limit),
        offset: Number.parseInt(offset),
        total: Number.parseInt(totalUsers[0].total),
      },
    })
  } catch (error) {
    console.error("Get users error:", error)
    res.status(500).json({
      error: "Ошибка при получении пользователей",
    })
  }
})

export default router
