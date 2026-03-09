const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const session = require("express-session");

const app = express();
const port = 3000;

app.use(session({
  secret: "mysecretkey",
  resave: false,
  saveUninitialized: true
}));

// อัปโหลดรูป
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage: storage });

// user database
const db = new sqlite3.Database('user.db', (err) => {
  if (err) console.error(err.message);
  console.log("Connected to user database");
});

db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  password TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  gender TEXT,
  role TEXT,
  image TEXT
)
`);

// สร้าง admin
db.get("SELECT * FROM users WHERE username=?", ["admin"], (err, row) => {
  if (!row) {
    db.run(`INSERT INTO users (username,password,email,role) VALUES (?,?,?,?)`,
      ["admin", "123", "admin@mail.com", "admin"]);
    console.log("Admin account created");
  }
});

// courses database
const coursesDb = new sqlite3.Database('courses.db', (err) => {
  if (err) console.error(err.message);
  console.log("Connected to courses database");
});

// middleware
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");


// ─── ROUTES ──────────────────────────────────────────────

app.get("/", (req, res) => {
  res.redirect("/home");
});

// Home
app.get("/home", (req, res) => {
  res.render("Home", { user: req.session.user || null });
});

// Login page
app.get("/login", (req, res) => {
  res.render("Loginpage");
});

// Register page
app.get("/register", (req, res) => {
  res.render("Registerpage");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/home");
});

// Profile
app.get("/profile", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("Profilepage", { user: req.session.user });
});

// Edit profile
app.get("/profile/edit", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("EditProfile", { user: req.session.user });
});

// Courses (ต้อง login)
app.get("/courses", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  coursesDb.all("SELECT * FROM courses", [], (err, courses) => {
    if (err) return res.send("Error loading courses");
    res.render("courses", { courses });
  });
});

// Course detail (ต้อง login)
app.get("/courses/:slug", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  coursesDb.get("SELECT * FROM courses WHERE slug=?", [req.params.slug], (err, course) => {
    if (!course) return res.status(404).send("Course not found");
    coursesDb.all(
      "SELECT part_number, label, count FROM course_parts WHERE course_id=? ORDER BY part_number, id",
      [course.id],
      (err, parts) => {
        course.part1 = parts.filter(p => p.part_number === 1);
        course.part2 = parts.filter(p => p.part_number === 2);
        res.render("detail", { course });
      }
    );
  });
});


// ─── POST ROUTES ─────────────────────────────────────────

// POST Register
app.post("/register", (req, res) => {
  const { username, password, phone, email, address, gender, role } = req.body;
  if (!username || !password || !email) {
    return res.send(`<script>alert("Please fill Username, Email and Password"); window.location.href="/register";</script>`);
  }
  db.get(`SELECT * FROM users WHERE email=?`, [email], (err, row) => {
    if (row) {
      return res.send(`<script>alert("This email is already registered"); window.location.href="/register";</script>`);
    }
    db.run(
      `INSERT INTO users (username,password,phone,email,address,gender,role,image) VALUES (?,?,?,?,?,?,?,?)`,
      [username, password, phone, email, address, gender, role, null],
      function(err) {
        if (err) return res.send("Register failed");
        req.session.user = { id: this.lastID, username, email, role };
        res.redirect("/home");
      }
    );
  });
});

// POST Login
app.post("/login", (req, res) => {
  const { login, password } = req.body;
  db.get(
    `SELECT * FROM users WHERE (username=? OR email=?) AND password=?`,
    [login, login, password],
    (err, row) => {
      if (row) {
        req.session.user = row;
        res.redirect("/home");
      } else {
        res.send(`<script>alert("Login failed"); window.location.href="/login";</script>`);
      }
    }
  );
});

// POST Update profile
app.post("/profile/update", upload.single("image"), (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { username, phone, email, address, gender } = req.body;
  let image = req.session.user.image;
  if (req.file) image = req.file.filename;

  db.run(
    `UPDATE users SET username=?, phone=?, email=?, address=?, gender=?, image=? WHERE id=?`,
    [username, phone, email, address, gender, image, req.session.user.id],
    (err) => {
      if (err) return res.send("Update failed");
      req.session.user = { ...req.session.user, username, phone, email, address, gender, image };
      res.redirect("/profile");
    }
  );
});


// ─── START SERVER ─────────────────────────────────────────

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});