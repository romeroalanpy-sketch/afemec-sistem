const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use('/UPLOAD', express.static(path.join(__dirname, 'UPLOAD')));

// ===== CONFIGURACIÓN DE CLOUDINARY (Almacenamiento Permanente) =====
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Si no hay variables de entorno (local), usa estos por defecto para que no falle
// Pero en Railway DEBES configurar CLOUDINARY_URL o las 3 variables separadas
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dcpsqf5on',
    api_key: process.env.CLOUDINARY_API_KEY || '513511116631891',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'O_Jq9X_8rF7lR-7_V8J_rE-vXpI'
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'afemec_cedulas',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }] // Optimizar tamaño
    },
});

const upload = multer({ storage: storage });

// ===== CONFIGURACIÓN DE BASE DE DATOS (Híbrida: SQLite local / Postgres nuble) =====
const isPostgres = !!process.env.DATABASE_URL;
let db;
let pgClient;

if (isPostgres) {
    console.log('🚀 Usando PostgreSQL (Nube detected)');
    pgClient = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    pgClient.connect()
        .then(() => console.log('📦 Base de datos Postgres conectada'))
        .catch(err => console.error('Error conectando Postgres:', err));

    // Inicializar tabla Postgres
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS players (
            id SERIAL PRIMARY KEY,
            fullName TEXT,
            dni TEXT,
            phone TEXT,
            email TEXT,
            playerType TEXT,
            teamName TEXT,
            category TEXT,
            jerseyNumber TEXT,
            socioName TEXT,
            socioDni TEXT,
            socioPhone TEXT,
            dniPlayerPath TEXT,
            dniSocioPath TEXT,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    pgClient.query(createTableQuery).catch(err => console.error(err));

    // Migraciones rápidas para Postgres
    pgClient.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS dniPlayerPath TEXT`).catch(() => { });
    pgClient.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS dniSocioPath TEXT`).catch(() => { });

} else {
    // SQLite (Local)
    const dbFile = path.join(__dirname, 'afemec.db');
    db = new sqlite3.Database(dbFile, (err) => {
        if (err) console.error('❌ Error al abrir la base de datos:', err.message);
        else console.log('📦 Base de datos Local (SQLite) conectada');
    });

    db.run(`CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT,
        dni TEXT,
        phone TEXT,
        email TEXT,
        playerType TEXT,
        teamName TEXT,
        category TEXT,
        jerseyNumber TEXT,
        socioName TEXT,
        socioDni TEXT,
        socioPhone TEXT,
        dniPlayerPath TEXT,
        dniSocioPath TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Intentar agregar columnas si ya existe la tabla (migración rápida)
    db.run(`ALTER TABLE players ADD COLUMN dniPlayerPath TEXT`, (err) => { });
    db.run(`ALTER TABLE players ADD COLUMN dniSocioPath TEXT`, (err) => { });
}

// Helper para mapear nombres de columnas de Postgres (minúsculas) a camelCase (esperado por el frontend)
function mapPgRow(row) {
    if (!row) return row;
    const mapped = {};
    for (const key in row) {
        const camelKey = {
            'fullname': 'fullName',
            'playertype': 'playerType',
            'teamname': 'teamName',
            'jerseynumber': 'jerseyNumber',
            'socioname': 'socioName',
            'sociodni': 'socioDni',
            'sociophone': 'socioPhone',
            'dniplayerpath': 'dniPlayerPath',
            'dnisociopath': 'dniSocioPath',
            'createdat': 'createdAt'
        }[key.toLowerCase()] || key;
        let value = row[key];
        // Convertir counts de Postgres (bigint strings) a Numbers
        if (key.toLowerCase() === 'count' || key.toLowerCase() === 'total') {
            value = Number(value);
        }
        mapped[camelKey] = value;
    }
    return mapped;
}

// Helper para consultas compatibles
async function dbRun(sql, params = []) {
    if (isPostgres) {
        let i = 1;
        let pgSql = sql.replace(/\?/g, () => '$' + (i++));

        // Si es un INSERT, intentar devolver el ID
        if (pgSql.trim().toLowerCase().startsWith('insert')) {
            pgSql += ' RETURNING id';
        }

        const res = await pgClient.query(pgSql, params);
        return { lastID: res.rows[0]?.id || 0 };
    } else {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID });
            });
        });
    }
}

async function dbAll(sql, params = []) {
    if (isPostgres) {
        let i = 1;
        const pgSql = sql.replace(/\?/g, () => '$' + (i++));
        const res = await pgClient.query(pgSql, params);
        return res.rows.map(mapPgRow);
    } else {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

async function dbGet(sql, params = []) {
    if (isPostgres) {
        const rows = await dbAll(sql, params);
        return rows[0] || null;
    } else {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

// ===== CONFIGURACIÓN DE EMAIL (Nodemailer) =====
// Email functionality removed as per user request

// ===== API: INSCRIPCIÓN =====
app.post('/api/inscripcion', upload.fields([
    { name: 'dniPlayerFile', maxCount: 1 },
    { name: 'dniSocioFile', maxCount: 1 }
]), async (req, res) => {
    console.log('📥 Recibida petición de inscripción:', req.body);
    try {
        const { fullName, dni, phone, email, playerType, teamName, category, jerseyNumber, socioName, socioDni, socioPhone } = req.body;

        const dniPlayerPath = req.files['dniPlayerFile'] ? req.files['dniPlayerFile'][0].path : null;
        const dniSocioPath = req.files['dniSocioFile'] ? req.files['dniSocioFile'][0].path : null;

        const sql = `INSERT INTO players (fullName, dni, phone, email, playerType, teamName, category, jerseyNumber, socioName, socioDni, socioPhone, dniPlayerPath, dniSocioPath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        // Ejecutar query (compatible con SQLite y PG)
        const result = await dbRun(sql, [fullName, dni, phone, email, playerType, teamName, category, jerseyNumber, socioName, socioDni, socioPhone, dniPlayerPath, dniSocioPath]);

        console.log('✅ Jugador inscrito exitosamente:', fullName);
        res.json({ success: true, message: 'Inscripción guardada exitosamente.', id: result.lastID });

    } catch (error) {
        console.error('Error servidor:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ===== API: ADMIN =====
// Middleware simple de seguridad (Hardcoded por ahora, idealmente usar tokens)
const adminAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader === 'Bearer admin123') { // CONTRASEÑA SIMPLE
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
};

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'admin123') {
        res.json({ success: true, token: 'admin123' });
    } else {
        res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    }
});

app.get('/api/admin/players', adminAuth, async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM players ORDER BY createdAt DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/players/bulk', adminAuth, async (req, res) => {
    const { players } = req.body;
    if (!players || !Array.isArray(players)) {
        return res.status(400).json({ success: false, message: 'Datos inválidos' });
    }

    console.log(`📥 Recibida carga masiva de ${players.length} jugadores`);

    try {
        const sql = `INSERT INTO players (fullName, dni, phone, email, playerType, teamName, category, jerseyNumber, socioName, socioDni, socioPhone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        for (const p of players) {
            await dbRun(sql, [
                p.fullName, p.dni, p.phone, p.email,
                p.playerType || 'socio',
                p.teamName, p.category,
                p.jerseyNumber,
                p.socioName || null,
                p.socioDni || null,
                p.socioPhone || null
            ]);
        }

        res.json({ success: true, message: `${players.length} jugadores importados correctamente.` });
    } catch (error) {
        console.error('Error en carga masiva:', error);
        res.status(500).json({ success: false, message: 'Error al procesar la carga masiva' });
    }
});

app.delete('/api/admin/players/:id', adminAuth, async (req, res) => {
    try {
        const playerId = req.params.id;
        if (isPostgres) {
            await pgClient.query('DELETE FROM players WHERE id = $1', [playerId]);
        } else {
            await dbRun('DELETE FROM players WHERE id = ?', [playerId]);
        }
        res.json({ success: true, message: 'Jugador eliminado' });
    } catch (err) {
        console.error('Error eliminando:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        // Ejecutar consultas en paralelo
        const [byTeam, byCategory, totalRow] = await Promise.all([
            dbAll("SELECT teamName, COUNT(*) as count FROM players GROUP BY teamName"),
            dbAll("SELECT category, COUNT(*) as count FROM players GROUP BY category"),
            dbGet("SELECT COUNT(*) as total FROM players")
        ]);

        res.json({
            byTeam,
            byCategory,
            total: totalRow ? totalRow.total : 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error calculando estadísticas' });
    }
});

// Rutas Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor AFEMEC corriendo en http://localhost:${PORT}`);
    console.log(`📊 Base de datos: ${isPostgres ? 'PostgreSQL (Nube)' : 'SQLite (Local)'} activa\n`);
});

