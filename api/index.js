const crypto = require("crypto");
const fs = require("fs");
const express = require("express");
const bcrypt = require("bcryptjs");

let Pool = null;
try {
  ({ Pool } = require("pg"));
} catch {
  Pool = null;
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const COOKIE_NAME = "tc_auth";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const TOKEN_SECRET = process.env.TOKEN_SECRET || "change-me";
const DATABASE_URL = process.env.DATABASE_URL || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const DATA_PATH = "/tmp/tekoa-db.json";
const useMemory = !DATABASE_URL || !Pool;

const ADMIN_EMAIL = "admin@admin.com";
const ADMIN_PASSWORD = "admin1233";

const pool = !useMemory
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    })
  : null;

let readyPromise = null;
let memoryStore = null;

const defaultStore = () => ({
  users: [],
  psychologists: [],
  packages: [],
  appointments: [],
  payments: [],
  tests: [],
  testResults: [],
  blogPosts: [],
  newsItems: [],
  videos: [],
  events: [],
  eventSignups: [],
  supportOrgs: [],
});

function nowIso() {
  return new Date().toISOString();
}

function getStore() {
  if (memoryStore) return memoryStore;
  if (!fs.existsSync(DATA_PATH)) {
    memoryStore = defaultStore();
    return memoryStore;
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    memoryStore = { ...defaultStore(), ...JSON.parse(raw) };
  } catch {
    memoryStore = defaultStore();
  }
  return memoryStore;
}

function saveStore() {
  if (!memoryStore) return;
  fs.writeFileSync(DATA_PATH, JSON.stringify(memoryStore, null, 2));
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url"
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const signature = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

function verifyToken(token) {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const data = `${header}.${body}`;
  const expected = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(data)
    .digest("base64url");
  if (expected !== signature) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

function getAuthToken(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax;${secure}`
  );
}

function clearAuthCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
}

async function query(text, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL not configured");
  }
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS psychologists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT,
      price_cents INT,
      rating NUMERIC,
      bio TEXT,
      tags JSONB,
      image_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS packages (
      code TEXT PRIMARY KEY,
      sessions INT NOT NULL,
      price_cents INT NOT NULL,
      discount_cents INT DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      psychologist_id TEXT REFERENCES psychologists(id),
      scheduled_at TIMESTAMPTZ NOT NULL,
      duration_minutes INT NOT NULL,
      status TEXT NOT NULL,
      package_code TEXT REFERENCES packages(code),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      appointment_id TEXT REFERENCES appointments(id),
      user_id TEXT REFERENCES users(id),
      amount_cents INT NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      duration_minutes INT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      test_id TEXT REFERENCES tests(id),
      score INT,
      result TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT,
      read_minutes INT,
      content TEXT,
      image_url TEXT,
      published_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      source TEXT,
      url TEXT,
      image_url TEXT,
      published_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      duration TEXT,
      channel TEXT,
      url TEXT,
      image_url TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      date_time TIMESTAMPTZ,
      image_url TEXT,
      status TEXT NOT NULL,
      is_recorded BOOLEAN DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS event_signups (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      event_id TEXT REFERENCES events(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS support_orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      city TEXT,
      country TEXT,
      description TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      tags JSONB,
      image_url TEXT
    );
  `);
}

async function ensureAdminUserDb() {
  const existing = await query("SELECT id FROM users WHERE email = $1", [ADMIN_EMAIL]);
  if (existing.rows[0]) return;
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await query(
    "INSERT INTO users (id, name, email, password_hash, is_admin) VALUES ($1,$2,$3,$4,$5)",
    [crypto.randomUUID(), "Admin", ADMIN_EMAIL, hash, true]
  );
}

function ensureAdminUserMemory(store) {
  if (store.users.some((item) => item.email === ADMIN_EMAIL)) return;
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  store.users.push({
    id: crypto.randomUUID(),
    name: "Admin",
    email: ADMIN_EMAIL,
    password_hash: hash,
    is_admin: true,
    created_at: nowIso(),
  });
}

function seedMemory(store) {
  ensureAdminUserMemory(store);
  if (store.psychologists.length === 0) {
    store.psychologists.push(
      {
        id: "psy-1",
        name: "Dra. Elena Silva",
        title: "Psicologa Clinica",
        price_cents: 1700,
        rating: 4.9,
        bio: "Especialista em ansiedade e adaptacao cultural.",
        tags: ["Ansiedade", "Adaptacao"],
        image_url:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuCa6bp0vFHcHwn1shKRuQ1SXkZ7RN1lU37jAScKrDiaLII3OjC0NQM8Kgqwz-XP3ZHUNE80Rs5GgVymsGpScmAPnpF18kVAtDTo9QREaNym_SDXlFcQWqlzOttOTY318tP09JDmT68KWook4jB0LmD7jlU79g5QEb6OewyUIDn1Nmji-_0imb7PCcp43juajim6LA6vsQX3H1oGn5e2kjroaUw7KN8gKHBo16ZTYnYGsm8h53uo5VAUHsyPt2Dr1YY_pYdwhUayYEQ",
        created_at: nowIso(),
      },
      {
        id: "psy-2",
        name: "Dr. Carlos Mendes",
        title: "Psicoterapeuta",
        price_cents: 2000,
        rating: 5.0,
        bio: "Foco em depressao e luto migratorio.",
        tags: ["Depressao", "Luto"],
        image_url:
          "https://lh3.googleusercontent.com/aida-public/AB6AXuCoLX-a_Xn3Pvh0QKZFPv1Bbq8PaaNsQPmE1IauaZGZjLva2jutjuJsNJnX868C1yhunHI19wJCWSTBCw9_jzEbKu8eV6gDnbjyYCw8weaavpokXfiQRATyShKo1u84RI9yMzzzQVW7kp4-Udx_CyCeCLMZn-LafU2DMkiKU0-OyhM11wgnyUZ41IZg2n1TKb5o-pFRu6Ein0mi91kHe9_JbV6nE6oQqgTMZ7fN6e0RTeAHWkvgYVnW77KjLs_jJ2LGPXywYOigYQc",
        created_at: nowIso(),
      }
    );
  }

  if (store.packages.length === 0) {
    store.packages.push(
      { code: "pkg-1", sessions: 1, price_cents: 1700, discount_cents: 0 },
      { code: "pkg-2", sessions: 2, price_cents: 3200, discount_cents: 200 },
      { code: "pkg-3", sessions: 3, price_cents: 4500, discount_cents: 600 }
    );
  }

  if (store.tests.length === 0) {
    store.tests.push(
      {
        id: "test-bai",
        name: "Escala de Ansiedade de Beck (BAI)",
        category: "Saude Emocional",
        duration_minutes: 5,
      },
      {
        id: "test-bdi",
        name: "Inventario de Depressao de Beck (BDI)",
        category: "Saude Emocional",
        duration_minutes: 7,
      }
    );
  }

  if (store.blogPosts.length === 0) {
    store.blogPosts.push({
      id: "blog-1",
      title: "Como lidar com a saudade de casa",
      category: "Saude Mental",
      summary: "Dicas praticas para manter sua saude mental forte.",
      read_minutes: 5,
      content: "Conteudo completo do artigo.",
      image_url:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuB7HEkATmtmvg7QmtLIP8_VMCqJUb_edsD029rSn3rOfnC2YVh8cJ9h-GVOdgKE_TUKS4ePSQ2O3ROWAtl-_T57KogNBVFN226amRJqQHyHYgJTeKG64RMBtlatc0v-AEAOtn_PxtmTDBRmCLWviQkSkeaifT-16SrpijtZNekqA-xR2FcV44xI2B6ORJwOILm0H1jV7mymVPQ0SSIK5ACx7M3DAasSbTngWCOAHdx2sFDcRIRT5wLcq9NagHiG5b3Cmr7uzCP88pA",
      published_at: nowIso(),
    });
  }

  if (store.newsItems.length === 0) {
    store.newsItems.push({
      id: "news-1",
      title: "Novas regras de visto para trabalhadores",
      summary: "Mudancas que entram em vigor no proximo mes.",
      source: "Publico",
      url: "https://example.com",
      image_url:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDJR6Hev3ybr3gaN5HHX03rcNo8UIVk6KXu1qK8rG7H0uoSz9ZJrPoVoMbq4261w0ia84i4fQF94WB38GjdA4T0D8DgXrQW8qG4bEEoqJdr7Ce0URih7Ai0g3va7lHk6OoYEdElU8J1WUkailSIe7RuaQWX69ge5LE_BBxFvBmIdhnFDjFeQflMAIxXKRGOg9fJVkY7-JfD4Em13q7f5kuweDaMhf8r7IDTsx7aQetjdMIbZ1dpv4igAWG3qpfqSQM5tkXv3WyROIE",
      published_at: nowIso(),
    });
  }

  if (store.videos.length === 0) {
    store.videos.push({
      id: "video-1",
      title: "Como lidar com a ansiedade da mudanca",
      category: "Saude Mental",
      duration: "12:45",
      channel: "Canal Tekoa",
      url: "https://youtube.com",
      image_url:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuCKA0PakLTrNCQ9Yx59zs-3luAPgAu2EDpesKbZUQeN8LwazTEinTUg_E6vAp8gnw8PnnbZuXQzeHrIpswq69j-OF4v6ak6LrWGwHfGQr8DYQ5dsC8KFndwZpGYk1CIGqZ-Wh___woyyS0ytfNFxOa_eJnhO3swZylVj0aY7C0IuDyFGcWGNlQS-Flm2G9lt9KMYX01YDLtJpSz6ve8pRn3W4kTdRIGfQMR1-LME8uHToWHrUa5VLR1wMQXMwQefnwsLyW5UWjdK_U",
    });
  }

  if (store.events.length === 0) {
    store.events.push({
      id: "event-1",
      title: "Cuidando da ansiedade no dia a dia",
      description: "Tecnicas simples de respiracao e mindfulness.",
      category: "Proximos",
      date_time: "2024-10-25T19:00:00Z",
      image_url:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDMkb4lsUv5sIp1IXB1uhDifkSUP0SOIxmw1VYG2pnoE0laIbuEj-Q3oDwSyZGxIkwNtImvDqfulNdd8R-LDNxbI1T3-gmPBC8DmYSGgtU16_jFZutw0CCvZ2EECect1NvtPl5SDRlluP7eXSFhiOJFBXFcpZkQg0xzqvREViVfXSdPSQFbwpIIbDRSeg71O8NQO2NX-sxF7Uc02_K86IO-ZdPhFJnMq5Nt8hzB29idBdeY3jur8pmNLm3tvf7XIU3vihTasmmrReM",
      status: "upcoming",
      is_recorded: false,
    });
  }

  if (store.supportOrgs.length === 0) {
    store.supportOrgs.push({
      id: "org-1",
      name: "Alto Comissariado para as Migracoes",
      category: "Instituicao Publica",
      city: "Lisboa",
      country: "Portugal",
      description: "Instituicao publica de apoio a integracao.",
      phone: "+351 111 111 111",
      email: "contato@acm.pt",
      website: "https://example.org",
      tags: [],
      image_url:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDrA19d4PP2kNuZ9cX_R_rfxBhr3DZOFwonmqqKGsr4VjxIoru4tCLOi2UzRYcroN-MS9YHGtNFIxgip_x8VGhDtYJ94pCr-6XTiw7Z0cJABxJTS5X8w14KX7b-UG_3TtC4IEcvXzaZQJDGjA2VPghntx4PoxkAoliugWZzL0hYxWJCGfyRo8uSSSFr6_hXM4_D3Ge5ijzLuKiW-A3GgTGYaYp-As0A3fu5hA1jaN0oMUyPoyeboyMVMRhXcs7sKXjz_ksqwZYD32M",
    });
  }
}

async function seedDb() {
  await ensureAdminUserDb();
  const { rows: psyCount } = await query(
    "SELECT COUNT(*)::int AS count FROM psychologists"
  );
  if (psyCount[0].count === 0) {
    await query(
      `INSERT INTO psychologists (id, name, title, price_cents, rating, bio, tags, image_url)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8),
       ($9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        "psy-1",
        "Dra. Elena Silva",
        "Psicologa Clinica",
        1700,
        4.9,
        "Especialista em ansiedade e adaptacao cultural.",
        JSON.stringify(["Ansiedade", "Adaptacao"]),
        "https://lh3.googleusercontent.com/aida-public/AB6AXuCa6bp0vFHcHwn1shKRuQ1SXkZ7RN1lU37jAScKrDiaLII3OjC0NQM8Kgqwz-XP3ZHUNE80Rs5GgVymsGpScmAPnpF18kVAtDTo9QREaNym_SDXlFcQWqlzOttOTY318tP09JDmT68KWook4jB0LmD7jlU79g5QEb6OewyUIDn1Nmji-_0imb7PCcp43juajim6LA6vsQX3H1oGn5e2kjroaUw7KN8gKHBo16ZTYnYGsm8h53uo5VAUHsyPt2Dr1YY_pYdwhUayYEQ",
        "psy-2",
        "Dr. Carlos Mendes",
        "Psicoterapeuta",
        2000,
        5.0,
        "Foco em depressao e luto migratorio.",
        JSON.stringify(["Depressao", "Luto"]),
        "https://lh3.googleusercontent.com/aida-public/AB6AXuCoLX-a_Xn3Pvh0QKZFPv1Bbq8PaaNsQPmE1IauaZGZjLva2jutjuJsNJnX868C1yhunHI19wJCWSTBCw9_jzEbKu8eV6gDnbjyYCw8weaavpokXfiQRATyShKo1u84RI9yMzzzQVW7kp4-Udx_CyCeCLMZn-LafU2DMkiKU0-OyhM11wgnyUZ41IZg2n1TKb5o-pFRu6Ein0mi91kHe9_JbV6nE6oQqgTMZ7fN6e0RTeAHWkvgYVnW77KjLs_jJ2LGPXywYOigYQc",
      ]
    );
  }

  const { rows: packageCount } = await query("SELECT COUNT(*)::int AS count FROM packages");
  if (packageCount[0].count === 0) {
    await query(
      `INSERT INTO packages (code, sessions, price_cents, discount_cents)
       VALUES ('pkg-1',1,1700,0),('pkg-2',2,3200,200),('pkg-3',3,4500,600)`
    );
  }

  const { rows: testsCount } = await query("SELECT COUNT(*)::int AS count FROM tests");
  if (testsCount[0].count === 0) {
    await query(
      `INSERT INTO tests (id, name, category, duration_minutes)
       VALUES
       ('test-bai','Escala de Ansiedade de Beck (BAI)','Saude Emocional',5),
       ('test-bdi','Inventario de Depressao de Beck (BDI)','Saude Emocional',7)`
    );
  }

  const { rows: blogCount } = await query("SELECT COUNT(*)::int AS count FROM blog_posts");
  if (blogCount[0].count === 0) {
    await query(
      `INSERT INTO blog_posts (id, title, category, summary, read_minutes, content, image_url)
       VALUES
       ('blog-1','Como lidar com a saudade de casa','Saude Mental','Dicas praticas para manter sua saude mental forte.',5,'Conteudo completo do artigo.','https://lh3.googleusercontent.com/aida-public/AB6AXuB7HEkATmtmvg7QmtLIP8_VMCqJUb_edsD029rSn3rOfnC2YVh8cJ9h-GVOdgKE_TUKS4ePSQ2O3ROWAtl-_T57KogNBVFN226amRJqQHyHYgJTeKG64RMBtlatc0v-AEAOtn_PxtmTDBRmCLWviQkSkeaifT-16SrpijtZNekqA-xR2FcV44xI2B6ORJwOILm0H1jV7mymVPQ0SSIK5ACx7M3DAasSbTngWCOAHdx2sFDcRIRT5wLcq9NagHiG5b3Cmr7uzCP88pA')`
    );
  }

  const { rows: newsCount } = await query("SELECT COUNT(*)::int AS count FROM news_items");
  if (newsCount[0].count === 0) {
    await query(
      `INSERT INTO news_items (id, title, summary, source, url, image_url)
       VALUES
       ('news-1','Novas regras de visto para trabalhadores','Mudancas que entram em vigor no proximo mes.','Publico','https://example.com','https://lh3.googleusercontent.com/aida-public/AB6AXuDJR6Hev3ybr3gaN5HHX03rcNo8UIVk6KXu1qK8rG7H0uoSz9ZJrPoVoMbq4261w0ia84i4fQF94WB38GjdA4T0D8DgXrQW8qG4bEEoqJdr7Ce0URih7Ai0g3va7lHk6OoYEdElU8J1WUkailSIe7RuaQWX69ge5LE_BBxFvBmIdhnFDjFeQflMAIxXKRGOg9fJVkY7-JfD4Em13q7f5kuweDaMhf8r7IDTsx7aQetjdMIbZ1dpv4igAWG3qpfqSQM5tkXv3WyROIE')`
    );
  }

  const { rows: videosCount } = await query("SELECT COUNT(*)::int AS count FROM videos");
  if (videosCount[0].count === 0) {
    await query(
      `INSERT INTO videos (id, title, category, duration, channel, url, image_url)
       VALUES
       ('video-1','Como lidar com a ansiedade da mudanca','Saude Mental','12:45','Canal Tekoa','https://youtube.com','https://lh3.googleusercontent.com/aida-public/AB6AXuCKA0PakLTrNCQ9Yx59zs-3luAPgAu2EDpesKbZUQeN8LwazTEinTUg_E6vAp8gnw8PnnbZuXQzeHrIpswq69j-OF4v6ak6LrWGwHfGQr8DYQ5dsC8KFndwZpGYk1CIGqZ-Wh___woyyS0ytfNFxOa_eJnhO3swZylVj0aY7C0IuDyFGcWGNlQS-Flm2G9lt9KMYX01YDLtJpSz6ve8pRn3W4kTdRIGfQMR1-LME8uHToWHrUa5VLR1wMQXMwQefnwsLyW5UWjdK_U')`
    );
  }

  const { rows: eventsCount } = await query("SELECT COUNT(*)::int AS count FROM events");
  if (eventsCount[0].count === 0) {
    await query(
      `INSERT INTO events (id, title, description, category, date_time, image_url, status, is_recorded)
       VALUES
       ('event-1','Cuidando da ansiedade no dia a dia','Tecnicas simples de respiracao e mindfulness.','Proximos','2024-10-25T19:00:00Z','https://lh3.googleusercontent.com/aida-public/AB6AXuDMkb4lsUv5sIp1IXB1uhDifkSUP0SOIxmw1VYG2pnoE0laIbuEj-Q3oDwSyZGxIkwNtImvDqfulNdd8R-LDNxbI1T3-gmPBC8DmYSGgtU16_jFZutw0CCvZ2EECect1NvtPl5SDRlluP7eXSFhiOJFBXFcpZkQg0xzqvREViVfXSdPSQFbwpIIbDRSeg71O8NQO2NX-sxF7Uc02_K86IO-ZdPhFJnMq5Nt8hzB29idBdeY3jur8pmNLm3tvf7XIU3vihTasmmrReM','upcoming',false)`
    );
  }

  const { rows: supportCount } = await query(
    "SELECT COUNT(*)::int AS count FROM support_orgs"
  );
  if (supportCount[0].count === 0) {
    await query(
      `INSERT INTO support_orgs (id, name, category, city, country, description, phone, email, website, tags, image_url)
       VALUES
       ('org-1','Alto Comissariado para as Migracoes','Instituicao Publica','Lisboa','Portugal','Instituicao publica de apoio a integracao.','+351 111 111 111','contato@acm.pt','https://example.org','[]','https://lh3.googleusercontent.com/aida-public/AB6AXuDrA19d4PP2kNuZ9cX_R_rfxBhr3DZOFwonmqqKGsr4VjxIoru4tCLOi2UzRYcroN-MS9YHGtNFIxgip_x8VGhDtYJ94pCr-6XTiw7Z0cJABxJTS5X8w14KX7b-UG_3TtC4IEcvXzaZQJDGjA2VPghntx4PoxkAoliugWZzL0hYxWJCGfyRo8uSSSFr6_hXM4_D3Ge5ijzLuKiW-A3GgTGYaYp-As0A3fu5hA1jaN0oMUyPoyeboyMVMRhXcs7sKXjz_ksqwZYD32M')`
    );
  }
}

async function ensureReady() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    if (useMemory) {
      const store = getStore();
      seedMemory(store);
      saveStore();
      return;
    }
    await ensureSchema();
    await seedDb();
  })();
  return readyPromise;
}

async function requireDb(req, res, next) {
  try {
    await ensureReady();
    return next();
  } catch (err) {
    return res.status(500).json({ error: "Database not configured", details: err.message });
  }
}

function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.userId = payload.userId;
  req.isAdmin = !!payload.isAdmin;
  return next();
}

function requireAdmin(req, res, next) {
  if (ADMIN_TOKEN) {
    const headerToken = req.headers["x-admin-token"] || "";
    if (headerToken === ADMIN_TOKEN) return next();
  }
  const token = getAuthToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload?.isAdmin) {
    return res.status(403).json({ error: "Admin somente" });
  }
  return next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/me", requireDb, async (req, res) => {
  const token = getAuthToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload?.userId) {
    return res.status(401).json({ authenticated: false });
  }
  if (useMemory) {
    const store = getStore();
    const user = store.users.find((item) => item.id === payload.userId);
    if (!user) return res.status(401).json({ authenticated: false });
    return res.json({
      authenticated: true,
      user: { id: user.id, name: user.name, email: user.email, isAdmin: !!user.is_admin },
    });
  }
  const result = await query("SELECT id, name, email, is_admin FROM users WHERE id = $1", [
    payload.userId,
  ]);
  if (!result.rows[0]) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    user: {
      id: result.rows[0].id,
      name: result.rows[0].name,
      email: result.rows[0].email,
      isAdmin: !!result.rows[0].is_admin,
    },
  });
});

app.post("/api/register", requireDb, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Preencha nome, e-mail e senha." });
  }
  if (useMemory) {
    const store = getStore();
    if (store.users.some((item) => item.email === email)) {
      return res.status(409).json({ error: "E-mail ja cadastrado." });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      password_hash: hash,
      is_admin: false,
      created_at: nowIso(),
    };
    store.users.push(user);
    saveStore();
    const token = signToken({ userId: user.id, isAdmin: false });
    setAuthCookie(res, token);
    return res.json({ ok: true, userId: user.id });
  }
  const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows[0]) {
    return res.status(409).json({ error: "E-mail ja cadastrado." });
  }
  const hash = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();
  await query(
    "INSERT INTO users (id, name, email, password_hash, is_admin) VALUES ($1,$2,$3,$4,$5)",
    [id, name, email, hash, false]
  );
  const token = signToken({ userId: id, isAdmin: false });
  setAuthCookie(res, token);
  return res.json({ ok: true, userId: id });
});

app.post("/api/login", requireDb, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Informe e-mail e senha." });
  }
  if (useMemory) {
    const store = getStore();
    const user = store.users.find((item) => item.email === email);
    if (!user) return res.status(401).json({ error: "Credenciais invalidas." });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciais invalidas." });
    const token = signToken({ userId: user.id, isAdmin: !!user.is_admin });
    setAuthCookie(res, token);
    return res.json({ ok: true, userId: user.id, isAdmin: !!user.is_admin });
  }
  const result = await query(
    "SELECT id, password_hash, is_admin FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: "Credenciais invalidas." });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Credenciais invalidas." });
  const token = signToken({ userId: user.id, isAdmin: !!user.is_admin });
  setAuthCookie(res, token);
  return res.json({ ok: true, userId: user.id, isAdmin: !!user.is_admin });
});

app.post("/api/logout", (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

app.get("/api/psychologists", requireDb, async (req, res) => {
  if (useMemory) return res.json(getStore().psychologists);
  const { rows } = await query(
    "SELECT id, name, title, price_cents, rating, tags, image_url FROM psychologists ORDER BY created_at DESC"
  );
  return res.json(rows);
});

app.get("/api/psychologists/:id", requireDb, async (req, res) => {
  if (useMemory) {
    const psy = getStore().psychologists.find((item) => item.id === req.params.id);
    if (!psy) return res.status(404).json({ error: "Not found" });
    return res.json(psy);
  }
  const { rows } = await query("SELECT * FROM psychologists WHERE id = $1", [
    req.params.id,
  ]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

app.get("/api/packages", requireDb, async (req, res) => {
  if (useMemory) return res.json(getStore().packages);
  const { rows } = await query("SELECT * FROM packages ORDER BY sessions ASC");
  return res.json(rows);
});

app.post("/api/appointments", requireDb, requireAuth, async (req, res) => {
  const { psychologistId, scheduledAt, packageCode } = req.body || {};
  if (!psychologistId || !scheduledAt || !packageCode) {
    return res.status(400).json({ error: "Dados incompletos" });
  }
  if (useMemory) {
    const store = getStore();
    const appointment = {
      id: crypto.randomUUID(),
      user_id: req.userId,
      psychologist_id: psychologistId,
      scheduled_at: scheduledAt,
      duration_minutes: 50,
      status: "scheduled",
      package_code: packageCode,
      created_at: nowIso(),
    };
    store.appointments.push(appointment);
    saveStore();
    return res.json({ ok: true, appointmentId: appointment.id });
  }
  const id = crypto.randomUUID();
  await query(
    "INSERT INTO appointments (id, user_id, psychologist_id, scheduled_at, duration_minutes, status, package_code) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, req.userId, psychologistId, scheduledAt, 50, "scheduled", packageCode]
  );
  return res.json({ ok: true, appointmentId: id });
});

app.post("/api/checkout", requireDb, requireAuth, async (req, res) => {
  const { psychologistId, scheduledAt, packageCode, amountCents, currency } = req.body || {};
  if (!psychologistId || !scheduledAt || !packageCode) {
    return res.status(400).json({ error: "Dados incompletos" });
  }
  const amount = amountCents || 1700;
  const curr = currency || "EUR";
  if (useMemory) {
    const store = getStore();
    const appointmentId = crypto.randomUUID();
    const paymentId = crypto.randomUUID();
    store.appointments.push({
      id: appointmentId,
      user_id: req.userId,
      psychologist_id: psychologistId,
      scheduled_at: scheduledAt,
      duration_minutes: 50,
      status: "paid",
      package_code: packageCode,
      created_at: nowIso(),
    });
    store.payments.push({
      id: paymentId,
      appointment_id: appointmentId,
      user_id: req.userId,
      amount_cents: amount,
      currency: curr,
      status: "paid",
      provider: "card",
      created_at: nowIso(),
    });
    saveStore();
    return res.json({ ok: true, appointmentId, paymentId });
  }
  const appointmentId = crypto.randomUUID();
  await query(
    "INSERT INTO appointments (id, user_id, psychologist_id, scheduled_at, duration_minutes, status, package_code) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [appointmentId, req.userId, psychologistId, scheduledAt, 50, "paid", packageCode]
  );
  const paymentId = crypto.randomUUID();
  await query(
    "INSERT INTO payments (id, appointment_id, user_id, amount_cents, currency, status, provider) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [paymentId, appointmentId, req.userId, amount, curr, "paid", "card"]
  );
  return res.json({ ok: true, appointmentId, paymentId });
});

app.get("/api/appointments", requireDb, requireAuth, async (req, res) => {
  if (useMemory) {
    const items = getStore().appointments.filter((item) => item.user_id === req.userId);
    return res.json(items);
  }
  const { rows } = await query(
    "SELECT * FROM appointments WHERE user_id = $1 ORDER BY created_at DESC",
    [req.userId]
  );
  return res.json(rows);
});

app.get("/api/tests", requireDb, async (req, res) => {
  if (useMemory) return res.json(getStore().tests);
  const { rows } = await query("SELECT * FROM tests ORDER BY category ASC");
  return res.json(rows);
});

app.post("/api/test-results", requireDb, requireAuth, async (req, res) => {
  const { testId, score, result } = req.body || {};
  if (!testId) return res.status(400).json({ error: "Teste invalido" });
  if (useMemory) {
    const store = getStore();
    const entry = {
      id: crypto.randomUUID(),
      user_id: req.userId,
      test_id: testId,
      score: score || null,
      result: result || null,
      created_at: nowIso(),
    };
    store.testResults.push(entry);
    saveStore();
    return res.json({ ok: true, id: entry.id });
  }
  const id = crypto.randomUUID();
  await query(
    "INSERT INTO test_results (id, user_id, test_id, score, result) VALUES ($1,$2,$3,$4,$5)",
    [id, req.userId, testId, score || null, result || null]
  );
  return res.json({ ok: true, id });
});

app.get("/api/blog", requireDb, async (req, res) => {
  if (useMemory) return res.json(getStore().blogPosts);
  const { rows } = await query("SELECT * FROM blog_posts ORDER BY published_at DESC");
  return res.json(rows);
});

app.get("/api/blog/:id", requireDb, async (req, res) => {
  if (useMemory) {
    const post = getStore().blogPosts.find((item) => item.id === req.params.id);
    if (!post) return res.status(404).json({ error: "Not found" });
    return res.json(post);
  }
  const { rows } = await query("SELECT * FROM blog_posts WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

app.get("/api/news", requireDb, async (req, res) => {
  if (useMemory) return res.json(getStore().newsItems);
  const { rows } = await query("SELECT * FROM news_items ORDER BY published_at DESC");
  return res.json(rows);
});

app.get("/api/videos", requireDb, async (req, res) => {
  if (useMemory) return res.json(getStore().videos);
  const { rows } = await query("SELECT * FROM videos");
  return res.json(rows);
});

app.get("/api/events", requireDb, async (req, res) => {
  if (useMemory) return res.json(getStore().events);
  const { rows } = await query("SELECT * FROM events ORDER BY date_time DESC");
  return res.json(rows);
});

app.get("/api/events/:id", requireDb, async (req, res) => {
  if (useMemory) {
    const event = getStore().events.find((item) => item.id === req.params.id);
    if (!event) return res.status(404).json({ error: "Not found" });
    return res.json(event);
  }
  const { rows } = await query("SELECT * FROM events WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

app.post("/api/events/:id/signup", requireDb, requireAuth, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    store.eventSignups.push({
      id: crypto.randomUUID(),
      user_id: req.userId,
      event_id: req.params.id,
      created_at: nowIso(),
    });
    saveStore();
    return res.json({ ok: true });
  }
  const id = crypto.randomUUID();
  await query("INSERT INTO event_signups (id, user_id, event_id) VALUES ($1,$2,$3)", [
    id,
    req.userId,
    req.params.id,
  ]);
  return res.json({ ok: true });
});

app.get("/api/support-orgs", requireDb, async (req, res) => {
  if (useMemory) return res.json(getStore().supportOrgs);
  const { rows } = await query("SELECT * FROM support_orgs");
  return res.json(rows);
});

app.get("/api/support-orgs/:id", requireDb, async (req, res) => {
  if (useMemory) {
    const org = getStore().supportOrgs.find((item) => item.id === req.params.id);
    if (!org) return res.status(404).json({ error: "Not found" });
    return res.json(org);
  }
  const { rows } = await query("SELECT * FROM support_orgs WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

app.post("/api/admin/blog", requireDb, requireAdmin, async (req, res) => {
  const { id, title, category, summary, readMinutes, content, imageUrl } = req.body || {};
  const postId = id || crypto.randomUUID();
  if (useMemory) {
    const store = getStore();
    store.blogPosts.push({
      id: postId,
      title,
      category,
      summary,
      read_minutes: readMinutes,
      content,
      image_url: imageUrl,
      published_at: nowIso(),
    });
    saveStore();
    return res.json({ ok: true, id: postId });
  }
  await query(
    "INSERT INTO blog_posts (id, title, category, summary, read_minutes, content, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [postId, title, category, summary, readMinutes, content, imageUrl]
  );
  return res.json({ ok: true, id: postId });
});

app.post("/api/admin/news", requireDb, requireAdmin, async (req, res) => {
  const { id, title, summary, source, url, imageUrl } = req.body || {};
  const newsId = id || crypto.randomUUID();
  if (useMemory) {
    const store = getStore();
    store.newsItems.push({
      id: newsId,
      title,
      summary,
      source,
      url,
      image_url: imageUrl,
      published_at: nowIso(),
    });
    saveStore();
    return res.json({ ok: true, id: newsId });
  }
  await query(
    "INSERT INTO news_items (id, title, summary, source, url, image_url) VALUES ($1,$2,$3,$4,$5,$6)",
    [newsId, title, summary, source, url, imageUrl]
  );
  return res.json({ ok: true, id: newsId });
});

app.post("/api/admin/videos", requireDb, requireAdmin, async (req, res) => {
  const { id, title, category, duration, channel, url, imageUrl } = req.body || {};
  const videoId = id || crypto.randomUUID();
  if (useMemory) {
    const store = getStore();
    store.videos.push({
      id: videoId,
      title,
      category,
      duration,
      channel,
      url,
      image_url: imageUrl,
    });
    saveStore();
    return res.json({ ok: true, id: videoId });
  }
  await query(
    "INSERT INTO videos (id, title, category, duration, channel, url, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [videoId, title, category, duration, channel, url, imageUrl]
  );
  return res.json({ ok: true, id: videoId });
});

app.post("/api/admin/events", requireDb, requireAdmin, async (req, res) => {
  const { id, title, description, category, dateTime, imageUrl, status, isRecorded } =
    req.body || {};
  const eventId = id || crypto.randomUUID();
  if (useMemory) {
    const store = getStore();
    store.events.push({
      id: eventId,
      title,
      description,
      category,
      date_time: dateTime,
      image_url: imageUrl,
      status: status || "upcoming",
      is_recorded: !!isRecorded,
    });
    saveStore();
    return res.json({ ok: true, id: eventId });
  }
  await query(
    "INSERT INTO events (id, title, description, category, date_time, image_url, status, is_recorded) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [eventId, title, description, category, dateTime, imageUrl, status || "upcoming", !!isRecorded]
  );
  return res.json({ ok: true, id: eventId });
});

app.post("/api/admin/support-orgs", requireDb, requireAdmin, async (req, res) => {
  const { id, name, category, city, country, description, phone, email, website, tags, imageUrl } =
    req.body || {};
  const orgId = id || crypto.randomUUID();
  if (useMemory) {
    const store = getStore();
    store.supportOrgs.push({
      id: orgId,
      name,
      category,
      city,
      country,
      description,
      phone,
      email,
      website,
      tags: tags || [],
      image_url: imageUrl,
    });
    saveStore();
    return res.json({ ok: true, id: orgId });
  }
  await query(
    "INSERT INTO support_orgs (id, name, category, city, country, description, phone, email, website, tags, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [orgId, name, category, city, country, description, phone, email, website, tags || "[]", imageUrl]
  );
  return res.json({ ok: true, id: orgId });
});

app.post("/api/admin/tests", requireDb, requireAdmin, async (req, res) => {
  const { id, name, category, durationMinutes } = req.body || {};
  const testId = id || crypto.randomUUID();
  if (useMemory) {
    const store = getStore();
    store.tests.push({
      id: testId,
      name,
      category,
      duration_minutes: durationMinutes,
    });
    saveStore();
    return res.json({ ok: true, id: testId });
  }
  await query(
    "INSERT INTO tests (id, name, category, duration_minutes) VALUES ($1,$2,$3,$4)",
    [testId, name, category, durationMinutes]
  );
  return res.json({ ok: true, id: testId });
});

app.post("/api/admin/psychologists", requireDb, requireAdmin, async (req, res) => {
  const { id, name, title, priceCents, rating, bio, tags, imageUrl } = req.body || {};
  const psyId = id || crypto.randomUUID();
  if (useMemory) {
    const store = getStore();
    store.psychologists.push({
      id: psyId,
      name,
      title,
      price_cents: priceCents,
      rating,
      bio,
      tags: tags || [],
      image_url: imageUrl,
      created_at: nowIso(),
    });
    saveStore();
    return res.json({ ok: true, id: psyId });
  }
  await query(
    "INSERT INTO psychologists (id, name, title, price_cents, rating, bio, tags, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [psyId, name, title, priceCents, rating, bio, tags || "[]", imageUrl]
  );
  return res.json({ ok: true, id: psyId });
});

app.get("/api/admin/stats", requireDb, requireAdmin, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    return res.json({
      users: store.users.length,
      blog: store.blogPosts.length,
      news: store.newsItems.length,
      videos: store.videos.length,
      events: store.events.length,
      support: store.supportOrgs.length,
      tests: store.tests.length,
    });
  }
  const users = await query("SELECT COUNT(*)::int AS count FROM users");
  const blog = await query("SELECT COUNT(*)::int AS count FROM blog_posts");
  const news = await query("SELECT COUNT(*)::int AS count FROM news_items");
  const videos = await query("SELECT COUNT(*)::int AS count FROM videos");
  const events = await query("SELECT COUNT(*)::int AS count FROM events");
  const support = await query("SELECT COUNT(*)::int AS count FROM support_orgs");
  const tests = await query("SELECT COUNT(*)::int AS count FROM tests");
  return res.json({
    users: users.rows[0].count,
    blog: blog.rows[0].count,
    news: news.rows[0].count,
    videos: videos.rows[0].count,
    events: events.rows[0].count,
    support: support.rows[0].count,
    tests: tests.rows[0].count,
  });
});

app.get("/api/admin/users", requireDb, requireAdmin, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    const users = store.users.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      is_admin: !!item.is_admin,
      created_at: item.created_at,
    }));
    return res.json(users);
  }
  const { rows } = await query(
    "SELECT id, name, email, is_admin, created_at FROM users ORDER BY created_at DESC"
  );
  return res.json(rows);
});

app.delete("/api/admin/users/:id", requireDb, requireAdmin, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    const idx = store.users.findIndex((item) => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    if (store.users[idx].is_admin || store.users[idx].email === ADMIN_EMAIL) {
      return res.status(400).json({ error: "Nao pode remover admin principal." });
    }
    store.users.splice(idx, 1);
    saveStore();
    return res.json({ ok: true });
  }
  const existing = await query("SELECT email, is_admin FROM users WHERE id = $1", [
    req.params.id,
  ]);
  if (!existing.rows[0]) return res.status(404).json({ error: "Not found" });
  if (existing.rows[0].is_admin || existing.rows[0].email === ADMIN_EMAIL) {
    return res.status(400).json({ error: "Nao pode remover admin principal." });
  }
  const result = await query("DELETE FROM users WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

app.put("/api/admin/blog/:id", requireDb, requireAdmin, async (req, res) => {
  const { title, category, summary, readMinutes, content, imageUrl } = req.body || {};
  if (useMemory) {
    const store = getStore();
    const item = store.blogPosts.find((post) => post.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    Object.assign(item, {
      title: title ?? item.title,
      category: category ?? item.category,
      summary: summary ?? item.summary,
      read_minutes: readMinutes ?? item.read_minutes,
      content: content ?? item.content,
      image_url: imageUrl ?? item.image_url,
    });
    saveStore();
    return res.json({ ok: true, id: item.id });
  }
  const existing = await query("SELECT * FROM blog_posts WHERE id = $1", [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: "Not found" });
  const row = existing.rows[0];
  await query(
    "UPDATE blog_posts SET title=$1, category=$2, summary=$3, read_minutes=$4, content=$5, image_url=$6 WHERE id=$7",
    [
      title ?? row.title,
      category ?? row.category,
      summary ?? row.summary,
      readMinutes ?? row.read_minutes,
      content ?? row.content,
      imageUrl ?? row.image_url,
      req.params.id,
    ]
  );
  return res.json({ ok: true, id: req.params.id });
});

app.delete("/api/admin/blog/:id", requireDb, requireAdmin, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    const idx = store.blogPosts.findIndex((post) => post.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    store.blogPosts.splice(idx, 1);
    saveStore();
    return res.json({ ok: true });
  }
  const result = await query("DELETE FROM blog_posts WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

app.put("/api/admin/news/:id", requireDb, requireAdmin, async (req, res) => {
  const { title, summary, source, url, imageUrl } = req.body || {};
  if (useMemory) {
    const store = getStore();
    const item = store.newsItems.find((post) => post.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    Object.assign(item, {
      title: title ?? item.title,
      summary: summary ?? item.summary,
      source: source ?? item.source,
      url: url ?? item.url,
      image_url: imageUrl ?? item.image_url,
    });
    saveStore();
    return res.json({ ok: true, id: item.id });
  }
  const existing = await query("SELECT * FROM news_items WHERE id = $1", [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: "Not found" });
  const row = existing.rows[0];
  await query(
    "UPDATE news_items SET title=$1, summary=$2, source=$3, url=$4, image_url=$5 WHERE id=$6",
    [
      title ?? row.title,
      summary ?? row.summary,
      source ?? row.source,
      url ?? row.url,
      imageUrl ?? row.image_url,
      req.params.id,
    ]
  );
  return res.json({ ok: true, id: req.params.id });
});

app.delete("/api/admin/news/:id", requireDb, requireAdmin, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    const idx = store.newsItems.findIndex((post) => post.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    store.newsItems.splice(idx, 1);
    saveStore();
    return res.json({ ok: true });
  }
  const result = await query("DELETE FROM news_items WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

app.put("/api/admin/videos/:id", requireDb, requireAdmin, async (req, res) => {
  const { title, category, duration, channel, url, imageUrl } = req.body || {};
  if (useMemory) {
    const store = getStore();
    const item = store.videos.find((post) => post.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    Object.assign(item, {
      title: title ?? item.title,
      category: category ?? item.category,
      duration: duration ?? item.duration,
      channel: channel ?? item.channel,
      url: url ?? item.url,
      image_url: imageUrl ?? item.image_url,
    });
    saveStore();
    return res.json({ ok: true, id: item.id });
  }
  const existing = await query("SELECT * FROM videos WHERE id = $1", [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: "Not found" });
  const row = existing.rows[0];
  await query(
    "UPDATE videos SET title=$1, category=$2, duration=$3, channel=$4, url=$5, image_url=$6 WHERE id=$7",
    [
      title ?? row.title,
      category ?? row.category,
      duration ?? row.duration,
      channel ?? row.channel,
      url ?? row.url,
      imageUrl ?? row.image_url,
      req.params.id,
    ]
  );
  return res.json({ ok: true, id: req.params.id });
});

app.delete("/api/admin/videos/:id", requireDb, requireAdmin, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    const idx = store.videos.findIndex((post) => post.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    store.videos.splice(idx, 1);
    saveStore();
    return res.json({ ok: true });
  }
  const result = await query("DELETE FROM videos WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

app.put("/api/admin/events/:id", requireDb, requireAdmin, async (req, res) => {
  const { title, description, category, dateTime, imageUrl, status, isRecorded } =
    req.body || {};
  if (useMemory) {
    const store = getStore();
    const item = store.events.find((post) => post.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    Object.assign(item, {
      title: title ?? item.title,
      description: description ?? item.description,
      category: category ?? item.category,
      date_time: dateTime ?? item.date_time,
      image_url: imageUrl ?? item.image_url,
      status: status ?? item.status,
      is_recorded: isRecorded ?? item.is_recorded,
    });
    saveStore();
    return res.json({ ok: true, id: item.id });
  }
  const existing = await query("SELECT * FROM events WHERE id = $1", [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: "Not found" });
  const row = existing.rows[0];
  await query(
    "UPDATE events SET title=$1, description=$2, category=$3, date_time=$4, image_url=$5, status=$6, is_recorded=$7 WHERE id=$8",
    [
      title ?? row.title,
      description ?? row.description,
      category ?? row.category,
      dateTime ?? row.date_time,
      imageUrl ?? row.image_url,
      status ?? row.status,
      isRecorded ?? row.is_recorded,
      req.params.id,
    ]
  );
  return res.json({ ok: true, id: req.params.id });
});

app.delete("/api/admin/events/:id", requireDb, requireAdmin, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    const idx = store.events.findIndex((post) => post.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    store.events.splice(idx, 1);
    saveStore();
    return res.json({ ok: true });
  }
  const result = await query("DELETE FROM events WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

app.put("/api/admin/support-orgs/:id", requireDb, requireAdmin, async (req, res) => {
  const { name, category, city, country, description, phone, email, website, tags, imageUrl } =
    req.body || {};
  if (useMemory) {
    const store = getStore();
    const item = store.supportOrgs.find((post) => post.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    Object.assign(item, {
      name: name ?? item.name,
      category: category ?? item.category,
      city: city ?? item.city,
      country: country ?? item.country,
      description: description ?? item.description,
      phone: phone ?? item.phone,
      email: email ?? item.email,
      website: website ?? item.website,
      tags: tags ?? item.tags,
      image_url: imageUrl ?? item.image_url,
    });
    saveStore();
    return res.json({ ok: true, id: item.id });
  }
  const existing = await query("SELECT * FROM support_orgs WHERE id = $1", [
    req.params.id,
  ]);
  if (!existing.rows[0]) return res.status(404).json({ error: "Not found" });
  const row = existing.rows[0];
  await query(
    "UPDATE support_orgs SET name=$1, category=$2, city=$3, country=$4, description=$5, phone=$6, email=$7, website=$8, tags=$9, image_url=$10 WHERE id=$11",
    [
      name ?? row.name,
      category ?? row.category,
      city ?? row.city,
      country ?? row.country,
      description ?? row.description,
      phone ?? row.phone,
      email ?? row.email,
      website ?? row.website,
      JSON.stringify(tags ?? row.tags ?? []),
      imageUrl ?? row.image_url,
      req.params.id,
    ]
  );
  return res.json({ ok: true, id: req.params.id });
});

app.delete("/api/admin/support-orgs/:id", requireDb, requireAdmin, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    const idx = store.supportOrgs.findIndex((post) => post.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    store.supportOrgs.splice(idx, 1);
    saveStore();
    return res.json({ ok: true });
  }
  const result = await query("DELETE FROM support_orgs WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

app.put("/api/admin/tests/:id", requireDb, requireAdmin, async (req, res) => {
  const { name, category, durationMinutes } = req.body || {};
  if (useMemory) {
    const store = getStore();
    const item = store.tests.find((post) => post.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    Object.assign(item, {
      name: name ?? item.name,
      category: category ?? item.category,
      duration_minutes: durationMinutes ?? item.duration_minutes,
    });
    saveStore();
    return res.json({ ok: true, id: item.id });
  }
  const existing = await query("SELECT * FROM tests WHERE id = $1", [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: "Not found" });
  const row = existing.rows[0];
  await query(
    "UPDATE tests SET name=$1, category=$2, duration_minutes=$3 WHERE id=$4",
    [
      name ?? row.name,
      category ?? row.category,
      durationMinutes ?? row.duration_minutes,
      req.params.id,
    ]
  );
  return res.json({ ok: true, id: req.params.id });
});

app.delete("/api/admin/tests/:id", requireDb, requireAdmin, async (req, res) => {
  if (useMemory) {
    const store = getStore();
    const idx = store.tests.findIndex((post) => post.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    store.tests.splice(idx, 1);
    saveStore();
    return res.json({ ok: true });
  }
  const result = await query("DELETE FROM tests WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

module.exports = app;

