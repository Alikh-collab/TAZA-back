-- Обновление таблиц для приложения TAZA SU с поддержкой аватарок

-- Добавляем поле avatar_url в таблицу пользователей
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Обновляем существующую таблицу пользователей
CREATE TABLE IF NOT EXISTS users_new (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Копируем данные если таблица users уже существует
INSERT INTO users_new (id, name, email, password, role, created_at, updated_at)
SELECT id, name, email, password, role, created_at, updated_at 
FROM users 
ON CONFLICT (email) DO NOTHING;

-- Заменяем старую таблицу
DROP TABLE IF EXISTS users CASCADE;
ALTER TABLE users_new RENAME TO users;

-- Пересоздаем внешние ключи для жалоб
ALTER TABLE complaints 
DROP CONSTRAINT IF EXISTS complaints_user_id_fkey,
ADD CONSTRAINT complaints_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Обновляем индексы
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_location ON complaints(location_lat, location_lng);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- Вставка тестового админа с аватаркой (пароль: admin123)
INSERT INTO users (name, email, password, role, avatar_url) 
VALUES ('Администратор', 'admin@tazasu.kz', '$2b$10$rOvHPnRkQqGtGvn5YrXxKOQqGqGqGqGqGqGqGqGqGqGqGqGqGqGqGq', 'admin', '/placeholder.svg?height=100&width=100')
ON CONFLICT (email) DO UPDATE SET 
  avatar_url = EXCLUDED.avatar_url,
  updated_at = CURRENT_TIMESTAMP;

-- Обновляем тестовые жалобы
UPDATE complaints SET user_id = (SELECT id FROM users WHERE email = 'admin@tazasu.kz' LIMIT 1)
WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM users);
