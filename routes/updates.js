import express from "express"
import { query } from "../config/database.js"

const router = express.Router()

// Получить все новости
router.get("/", async (req, res) => {
  try {
    const updates = await query(`SELECT * FROM updates ORDER BY created_at DESC`)
    res.json({ updates })
  } catch (error) {
    console.error("Ошибка при получении новостей:", error)
    res.status(500).json({ error: "Ошибка сервера" })
  }
})

export default router
