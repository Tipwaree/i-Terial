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

// สร้าง teacher
db.get("SELECT * FROM users WHERE username=?", ["teacher"], (err, row) => {
  if (!row) {
    db.run(`INSERT INTO users (username,password,email,role) VALUES (?,?,?,?)`,
      ["teacher", "123", "teacher@mail.com", "teacher"]);
    console.log("Teacher account created");
  }
});

// courses database
const coursesDb = new sqlite3.Database('courses.db', (err) => {
  if (err) console.error(err.message);
  console.log("Connected to courses database");
});

// สร้างตาราง courses (หากยังไม่มี)
coursesDb.run(`
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    slug TEXT UNIQUE,
    description TEXT,
    image TEXT,
    teacher_id INTEGER
  )
`);

// middleware
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


// ─── ROUTES ───────────────────────────────────────────────

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

//forgot page
app.get("/forgot", (req, res) => {
  res.render("ForgotPassword");
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

// Courses (หน้ารวมคอร์ส)
app.get("/courses", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  coursesDb.all("SELECT * FROM courses", [], (err, courses) => {
    if (err) return res.send("Error loading courses");
    res.render("courses", { courses, user: req.session.user });
  });
});

// Course detail (หน้าดูรายละเอียดคอร์ส - แก้ไขป้องกันเว็บพังแล้ว)
app.get("/courses/:slug", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  
  coursesDb.get("SELECT * FROM courses WHERE slug=?", [req.params.slug], (err, course) => {
    if (!course) return res.status(404).send("Course not found");
    
    // พยายามดึงข้อมูลส่วนของ Part ต่างๆ ของคอร์ส (เผื่อในอนาคตมีตาราง course_parts)
    coursesDb.all(
      "SELECT part_number, label, count FROM course_parts WHERE course_id=? ORDER BY part_number, id",
      [course.id],
      (err, parts) => {
        // ดัก Error ไว้: ถ้าไม่มีตาราง course_parts ให้ใช้ Array ว่างแทน เพื่อไม่ให้เว็บพัง
        const safeParts = parts || []; 
        
        course.part1 = safeParts.filter(p => p.part_number === 1);
        course.part2 = safeParts.filter(p => p.part_number === 2);
        
        // ข้อมูลจำลอง (Mock) ไปก่อน เนื่องจากในฐานข้อมูลเรายังไม่มีข้อมูลเหล่านี้
        course.teacher = "คุณครูผู้สอน";
        course.students = 0;
        course.rating = 5.0;
        course.reviewText = "ยังไม่มีรีวิว";
        course.progress = 0;

        res.render("detail", { course, user: req.session.user });
      }
    );
  });
});

// หลัง login teacher
app.get("/teacher", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.role !== "teacher" && req.session.user.role !== "admin") {
    return res.send("Access denied");
  }
  res.redirect("/home"); // เปลี่ยนจาก res.render("home") เป็น res.redirect เพื่อให้ตัวแปร user ทำงานปกติ
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

// forgotpage
app.post("/forgot", (req, res) => {
  const { login, newpassword } = req.body;
  db.get(
    "SELECT * FROM users WHERE username=? OR email=?",
    [login, login],
    (err, row) => {
      if (!row) {
        return res.send(`<script>alert("User not found"); window.location.href="/forgot";</script>`);
      }
      db.run(
        "UPDATE users SET password=? WHERE id=?",
        [newpassword, row.id],
        (err) => {
          if (err) return res.send("Error resetting password");
          res.send(`<script>alert("Password reset success"); window.location.href="/login";</script>`);
        }
      );
    }
  );
});

//─── EXAM & STUDENT PAGES ───────────────────────────────────────

app.get("/student", (req, res) => {
  // เพิ่ม mockExams เพื่อแก้บั๊ก exams is not defined
  const mockExams = [
    { id: 1, name: "วิชาเทคโนโลยีสารสนเทศเบื้องต้น" },
    { id: 2, name: "วิชาการเขียนโปรแกรม (Programming)" },
    { id: 3, name: "วิชาคณิตศาสตร์คอมพิวเตอร์" }
  ];
  res.render("student/examList", { exams: mockExams, user: req.session.user });
});

app.get("/student/exam", (req, res) => {
  res.render("student/examPage", { user: req.session.user });
});

app.get("/student/result", (req, res) => {
  res.render("student/result", { user: req.session.user });
});

// teacher exam page
app.get("/teacher/create-exam", (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) return res.redirect("/login");
  res.render("teacher/createExam", { user: req.session.user });
});


// ─── TEACHER PAGES (CREATE COURSE) ────────────────────────────────

// GET: แสดงหน้าฟอร์มสร้างคอร์สเรียน
app.get("/teacher/create-course", (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
     return res.send("<script>alert('Unauthorized access: สำหรับ Teacher เท่านั้น'); window.location.href='/home';</script>");
  }
  res.render("teacher/createCourse", { user: req.session.user });
});

// POST: รับข้อมูลจากฟอร์มเพื่อบันทึกลง Database
app.post("/teacher/create-course", upload.single("image"), (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
     return res.redirect("/login");
  }

  const { title, description } = req.body;
  const image = req.file ? req.file.filename : null; 
  const slug = title.toLowerCase().replace(/[^a-zA-Z0-9ก-๙]+/g, '-').replace(/(^-|-$)+/g, '') || Date.now().toString();

  coursesDb.run(
    `INSERT INTO courses (title, slug, description, image, teacher_id) VALUES (?, ?, ?, ?, ?)`,
    [title, slug, description, image, req.session.user.id],
    function(err) {
      if (err) {
        console.error("Database Error:", err.message);
        return res.send(`<script>alert('เกิดข้อผิดพลาดในการสร้างคอร์ส อาจเป็นเพราะชื่อซ้ำ'); window.location.href='/teacher/create-course';</script>`);
      }
      res.send("<script>alert('สร้างคอร์สสำเร็จ!'); window.location.href='/courses';</script>");
    }
  );
});

// ─── TEACHER PAGES: EDIT COURSE & MANAGE LESSONS ────────────────────────

// 1. สร้างตาราง lessons (บทเรียน) ใน courses.db
coursesDb.run(`
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    title TEXT,
    pdf_file TEXT,
    video_file TEXT
  )
`);

// 2. GET: หน้าแก้ไขคอร์ส
app.get("/teacher/edit-course/:id", (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) return res.redirect("/login");
  
  coursesDb.get("SELECT * FROM courses WHERE id=? AND teacher_id=?", [req.params.id, req.session.user.id], (err, course) => {
    if (!course) return res.send("<script>alert('ไม่พบคอร์ส หรือคุณไม่มีสิทธิ์แก้ไข'); window.location.href='/courses';</script>");
    res.render("teacher/editCourse", { course, user: req.session.user });
  });
});

// 3. POST: บันทึกการแก้ไขคอร์ส
app.post("/teacher/edit-course/:id", upload.single("image"), (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) return res.redirect("/login");

  const { title, description } = req.body;
  
  // ดึงรูปเก่ามาใช้ถ้ารูปใหม่ไม่ได้อัปโหลด
  coursesDb.get("SELECT image FROM courses WHERE id=?", [req.params.id], (err, course) => {
    const image = req.file ? req.file.filename : course.image;
    
    coursesDb.run(
      `UPDATE courses SET title=?, description=?, image=? WHERE id=? AND teacher_id=?`,
      [title, description, image, req.params.id, req.session.user.id],
      (err) => {
        if (err) return res.send("Update failed");
        res.redirect("/courses");
      }
    );
  });
});

// 4. GET: หน้าจัดการบทเรียน (เพิ่ม PDF / Video)
app.get("/teacher/manage-lessons/:course_id", (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) return res.redirect("/login");

  const courseId = req.params.course_id;
  coursesDb.get("SELECT * FROM courses WHERE id=?", [courseId], (err, course) => {
    if (!course) return res.send("Course not found");
    
    // ดึงบทเรียนทั้งหมดของคอร์สนี้มาแสดง
    coursesDb.all("SELECT * FROM lessons WHERE course_id=?", [courseId], (err, lessons) => {
      res.render("teacher/manageLessons", { course, lessons, user: req.session.user });
    });
  });
});

// 5. POST: บันทึกบทเรียนใหม่ (รองรับการอัปโหลด 2 ไฟล์พร้อมกัน: pdf และ video)
const uploadLessonFiles = upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]);

app.post("/teacher/add-lesson/:course_id", uploadLessonFiles, (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) return res.redirect("/login");

  const { title } = req.body;
  const courseId = req.params.course_id;
  
  // เช็คว่ามีการอัปโหลดไฟล์มาไหม ถ้ามีให้เอาชื่อไฟล์มา
  const pdfFile = req.files['pdf'] ? req.files['pdf'][0].filename : null;
  const videoFile = req.files['video'] ? req.files['video'][0].filename : null;

  coursesDb.run(
    `INSERT INTO lessons (course_id, title, pdf_file, video_file) VALUES (?, ?, ?, ?)`,
    [courseId, title, pdfFile, videoFile],
    function(err) {
      if (err) return res.send("Error adding lesson");
      res.redirect(`/teacher/manage-lessons/${courseId}`);
    }
  );
});

// ─── START SERVER ─────────────────────────────────────────
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});