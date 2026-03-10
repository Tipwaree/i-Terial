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

// สร้าง student
db.get("SELECT * FROM users WHERE username=?", ["student"], (err, row) => {
  if (!row) {
    db.run(`INSERT INTO users (username,password,email,role) VALUES (?,?,?,?)`,
      ["student", "123", "student@mail.com", "student"]);
    console.log("Student account created");
  }
});

// courses database
// courses database
const coursesDb = new sqlite3.Database('courses.db', (err) => {
  if (err) console.error(err.message);
  console.log("Connected to courses database");
});

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

coursesDb.run(`
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  course_id INTEGER
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
  const userId = req.session.user.id;
  coursesDb.all(
    `SELECT courses.* FROM bookmarks 
     JOIN courses ON bookmarks.course_id = courses.id
     WHERE bookmarks.user_id=?`,
    [userId],
    (err, courses) => {
      if (err) courses = [];
      res.render("Profilepage", {
        user: req.session.user,
        bookmarks: courses
      });
    }
  );
});

//bookmark
app.post("/bookmark/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;
  const courseId = req.params.id;
  coursesDb.get(
    "SELECT * FROM bookmarks WHERE user_id=? AND course_id=?",
    [userId, courseId],
    (err, row) => {
      if (row) {
        // ถ้ามีอยู่แล้ว → ลบ bookmark
        coursesDb.run(
          "DELETE FROM bookmarks WHERE user_id=? AND course_id=?",
          [userId, courseId],
          () => {
            res.redirect("/courses");
          }
        );
      } else {
        // ถ้ายังไม่มี → เพิ่ม bookmark
        coursesDb.run(
          "INSERT INTO bookmarks (user_id, course_id) VALUES (?,?)",
          [userId, courseId],
          () => {
            res.redirect("/courses");
          }
        );
      }
    }
  );
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

// หลัง login teacher
app.get("/teacher", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.role !== "teacher" && req.session.user.role !== "admin") {
    return res.send("Access denied");
  }
  res.redirect("/home"); // เปลี่ยนจาก res.render("home") เป็น res.redirect เพื่อให้ตัวแปร user ทำงานปกติ
});

// Admin Manage User
app.get("/admin/manageUser", (req, res) => {

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.send("Access denied");
  }

  db.all(
    "SELECT * FROM users WHERE role != 'admin'",
    [],
    (err, rows) => {

      if (err) {
        console.log(err);
        return res.send("Database error");
      }

      res.render("admin/manageUser", {
        users: rows,
        user: req.session.user
      });

    }
  );
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
      function (err) {
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

//student exam page
app.get("/exam", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  const exams = [
    { id: 1, name: "TGAT1" },
    { id: 2, name: "TGAT2" },
    { id: 3, name: "TPAT3" },
    { id: 4, name: "A-level คณิต 1" },
    { id: 5, name: "A-level อังกฤษ" }
  ];

  res.render("student/examList", {
    exams: exams,
    user: req.session.user
  });

});

app.get("/student/result", (req, res) => {
  res.render("student/result", { user: req.session.user });
});

//exam from teacher
app.get("/student/exam/:id", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login")
  }

  const subject_id = req.params.id

  examDb.all(
    "SELECT * FROM questions WHERE subject_id=?",
    [subject_id],
    (err, rows) => {

      res.render("student/examPage", {
        questions: rows,
        user: req.session.user,
        answers: null
      })

    }
  )

})

app.post("/student/submit", (req, res) => {

  const subject_id = req.body.subject_id
  const answers = req.body

  let score = 0
  let total = 0

  examDb.all(
    "SELECT * FROM questions WHERE subject_id=?",
    [subject_id],
    (err, rows) => {

      rows.forEach(q => {

        total++

        const studentAnswer = answers["q" + q.id]

        if (parseInt(studentAnswer) === q.answer) {
          score++
        }

      })

      res.render("student/result", {
        user: req.session.user,
        score: score,
        total: total,
        subject_id: subject_id
      })

    }
  )

})

// teacher exam page
// exam database
const examDb = new sqlite3.Database("exam.db", (err) => {
  if (err) console.error(err.message)
  console.log("Connected to exam database")
});

app.get("/teacher/exams", (req, res) => {

  if (!req.session.user || req.session.user.role !== "teacher") {
    return res.redirect("/login");
  }

  const subjects = [
    { id: 1, name: "TGAT1" },
    { id: 2, name: "TGAT2" },
    { id: 3, name: "TPAT3" },
    { id: 4, name: "A-level คณิต 1" },
    { id: 5, name: "A-level อังกฤษ" }
  ];

  res.render("teacher/examList", {
    user: req.session.user,
    subjects: subjects
  });

});

app.get("/teacher/create-exam/:id", (req, res) => {

  if (!req.session.user || req.session.user.role !== "teacher") {
    return res.redirect("/login");
  }

  const subject_id = req.params.id;

  const subjects = {
    1: "TGAT1",
    2: "TGAT2",
    3: "TPAT3",
    4: "A-level คณิต 1",
    5: "A-level อังกฤษ"
  };

  examDb.all(
    "SELECT * FROM questions WHERE subject_id=?",
    [subject_id],
    (err, rows) => {

      if (err) {
        console.log(err);
        return res.send("Database error");
      }

      res.render("teacher/createExam", {
        user: req.session.user,
        exam: { id: subject_id, name: subjects[subject_id] },
        subject_id: subject_id,
        questions: rows
      });

    }
  );

});

app.post("/teacher/saveExam", (req, res) => {

  const subject_id = req.body.subject_id
  const questions = req.body.question
  const c1 = req.body.choice1
  const c2 = req.body.choice2
  const c3 = req.body.choice3
  const c4 = req.body.choice4
  const answers = req.body.answer

  examDb.serialize(() => {

    for (let i = 0; i < questions.length; i++) {

      examDb.run(
        `INSERT INTO questions
        (question,choice1,choice2,choice3,choice4,answer,subject_id)
        VALUES (?,?,?,?,?,?,?)`,
        [
          questions[i],
          c1[i],
          c2[i],
          c3[i],
          c4[i],
          answers[i],
          subject_id
        ]
      )

    }

  })

  res.redirect("/teacher/create-exam/" + subject_id + "?saved=1")

})

app.post("/teacher/delete-question/:id", (req, res) => {

  const question_id = req.params.id
  const subject_id = req.body.subject_id

  examDb.run(
    "DELETE FROM questions WHERE id=?",
    [question_id],
    (err) => {
      if (err) {
        console.log(err)
        return res.send("delete error")
      }

      res.redirect("/teacher/create-exam/" + subject_id)
    }
  )

})

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
    function (err) {
      if (err) {
        console.error("Database Error:", err.message);
        return res.send(`<script>alert('เกิดข้อผิดพลาดในการสร้างคอร์ส อาจเป็นเพราะชื่อซ้ำ'); window.location.href='/teacher/create-course';</script>`);
      }
      res.send("<script>alert('สร้างคอร์สสำเร็จ!'); window.location.href='/courses';</script>");
    }
  );
});

// Course detail (หน้าดูรายละเอียดคอร์ส และแสดงบทเรียน)
app.get("/courses/:slug", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  // 1. ดึงข้อมูลคอร์ส
  coursesDb.get("SELECT * FROM courses WHERE slug=?", [req.params.slug], (err, course) => {
    if (!course) return res.status(404).send("Course not found");

    // ข้อมูลจำลอง (Mock) สำหรับ Sidebar
    course.teacher = "คุณครูผู้สอน";
    course.students = 0;
    course.rating = 5.0;
    course.reviewText = "ยังไม่มีรีวิว";
    course.progress = 0;

    // 2. ดึงข้อมูลบทเรียน (Lessons) ทั้งหมดที่อยู่ในคอร์สนี้
    coursesDb.all("SELECT * FROM lessons WHERE course_id=?", [course.id], (err, lessons) => {
      // ส่งตัวแปร course และ lessons ไปให้หน้า detail.ejs
      res.render("detail", {
        course: course,
        lessons: lessons || [],
        user: req.session.user
      });
    });
  });
});

// ─── START SERVER ─────────────────────────────────────────
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});