-- Создание таблиц для приложения TAZA SU

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица жалоб
CREATE TABLE IF NOT EXISTS complaints (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    location_lat DECIMAL(10, 8) NOT NULL,
    location_lng DECIMAL(11, 8) NOT NULL,
    location_address TEXT,
    description TEXT NOT NULL,
    photo_url TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_location ON complaints(location_lat, location_lng);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- Вставка тестового админа (пароль: admin123)
INSERT INTO users (name, email, password, role) 
VALUES ('Администратор', 'admin@tazasu.kz', '$2b$10$rOvHPnRkQqGtGvn5YrXxKOQqGqGqGqGqGqGqGqGqGqGqGqGqGqGqGq', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Вставка тестовых жалоб
INSERT INTO complaints (user_id, name, location_lat, location_lng, location_address, description, status)
VALUES 
    (1, 'Айгуль Нурланова', 43.2220, 76.8512, 'Алматы, ул. Абая 150', 'Вода имеет неприятный запах и мутный цвет. Проблема наблюдается уже неделю.', 'pending'),
    (1, 'Ерлан Касымов', 51.1694, 71.4491, 'Нур-Султан, ул. Кенесары 40', 'Низкое давление воды, иногда полностью отсутствует подача.', 'in_progress'),
    (1, 'Гульнара Абдуллина', 43.6532, 51.1694, 'Актобе, ул. Молдагуловой 25', 'Вода с привкусом хлора, дети жалуются на боли в животе.', 'resolved')
ON CONFLICT DO NOTHING;
