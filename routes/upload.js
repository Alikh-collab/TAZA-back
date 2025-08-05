import express from "express"
import multer from "multer"
import path from "path"
import { authenticateToken } from "../middleware/auth.js"

const router = express.Router()

// Настройка multer для общих загрузок
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadType = req.body.type || "general"
    const folder = uploadType === "avatar" ? "uploads/avatars/" : "uploads/complaints/"
    cb(null, folder)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const prefix = req.body.type === "avatar" ? "avatar" : "complaint"
    cb(null, prefix + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1, // максимум 1 файл
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"]

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Разрешены только изображения (JPEG, PNG, GIF)"))
    }
  },
})

// Загрузка файла (требует авторизации)
router.post("/", authenticateToken, upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Файл не был загружен",
      })
    }

    const fileUrl = `/${req.file.path.replace(/\\/g, "/")}`

    console.log(`✅ Файл загружен: ${req.file.filename} пользователем ${req.user.email}`)

    res.json({
      success: true,
      message: "Файл успешно загружен",
      file: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    })
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({
      error: "Ошибка при загрузке файла",
    })
  }
})

// Множественная загрузка файлов
router.post("/multiple", authenticateToken, upload.array("files", 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: "Файлы не были загружены",
      })
    }

    const files = req.files.map((file) => ({
      url: `/${file.path.replace(/\\/g, "/")}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    }))

    console.log(`✅ Загружено ${files.length} файлов пользователем ${req.user.email}`)

    res.json({
      success: true,
      message: `Успешно загружено ${files.length} файлов`,
      files,
    })
  } catch (error) {
    console.error("Multiple upload error:", error)
    res.status(500).json({
      error: "Ошибка при загрузке файлов",
    })
  }
})

export default router
