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

// อัปโหลดไฟล์
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage: storage });

// ─── DATABASES ────────────────────────────────────────────

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

// Migration: add teacher_id column if old DB schema doesn't have it
coursesDb.run("ALTER TABLE courses ADD COLUMN teacher_id INTEGER", () => {});
// Fix old image paths (e.g. '/images/tgat1.jpg') — set to NULL since /images/ folder doesn't exist
coursesDb.run("UPDATE courses SET image = NULL WHERE image LIKE '/%'", () => {});

coursesDb.run(`
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  course_id INTEGER
)
`);

coursesDb.run(`
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER,
  title TEXT,
  pdf_file TEXT,
  video_file TEXT
)
`);

coursesDb.run(`
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER,
  user_id INTEGER,
  rating INTEGER,
  review_text TEXT
)
`);

coursesDb.run(`
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  course_id INTEGER
)
`);

// exam database
const examDb = new sqlite3.Database("exam.db", (err) => {
  if (err) console.error(err.message);
  console.log("Connected to exam database");
});

examDb.run(`
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT,
  choice1 TEXT,
  choice2 TEXT,
  choice3 TEXT,
  choice4 TEXT,
  answer INTEGER,
  subject_id INTEGER
)
`);

// ─── MIDDLEWARE ────────────────────────────────────────────

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

// Forgot page
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

// Search
app.get("/search", (req, res) => {
  const keyword = req.query.keyword || "";
  if (!keyword.trim()) {
    return res.render("search", { courses: null, keyword: "", user: req.session.user || null });
  }
  coursesDb.all(
    "SELECT * FROM courses WHERE title LIKE ?",
    ["%" + keyword + "%"],
    (err, courses) => {
      if (err) courses = [];
      res.render("search", { courses, keyword, user: req.session.user || null });
    }
  );
});

// Course detail
app.get("/courses/:slug", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  coursesDb.get("SELECT * FROM courses WHERE slug=?", [req.params.slug], (err, course) => {
    if (!course) return res.status(404).send("Course not found");

    const userId = req.session.user.id;
    const role = req.session.user.role;

    // ดึงชื่อ teacher จาก user database
    db.get("SELECT username FROM users WHERE id=?", [course.teacher_id], (err, teacher) => {
      course.teacher = teacher ? teacher.username : "ไม่ระบุ";

      // นับจำนวนผู้เรียน
      coursesDb.get(
        "SELECT COUNT(*) as cnt FROM enrollments WHERE course_id=?",
        [course.id],
        (err, countRow) => {
          course.students = countRow ? countRow.cnt : 0;

          // ดึง avg rating
          coursesDb.get(
            "SELECT AVG(rating) as avg FROM reviews WHERE course_id=?",
            [course.id],
            (err, ratingRow) => {
              course.rating = ratingRow && ratingRow.avg ? ratingRow.avg.toFixed(1) : "ยังไม่มี";

              // ตรวจสอบว่า enroll แล้วหรือยัง
              coursesDb.get(
                "SELECT * FROM enrollments WHERE user_id=? AND course_id=?",
                [userId, course.id],
                (err, enrollment) => {
                  const isEnrolled = !!enrollment || role === "teacher" || role === "admin";

                  // ดึง lessons (แสดงเฉพาะ enrolled หรือ teacher/admin)
                  if (isEnrolled) {
                    coursesDb.all("SELECT * FROM lessons WHERE course_id=?", [course.id], (err, lessons) => {
                      res.render("detail", {
                        course,
                        lessons: lessons || [],
                        user: req.session.user,
                        isEnrolled,
                        courseId: course.id
                      });
                    });
                  } else {
                    res.render("detail", {
                      course,
                      lessons: [],
                      user: req.session.user,
                      isEnrolled,
                      courseId: course.id
                    });
                  }
                }
              );
            }
          );
        }
      );
    });
  });
});

// Bookmark toggle
app.post("/bookmark/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;
  const courseId = req.params.id;
  const redirectTo = req.headers.referer || "/courses";

  coursesDb.get(
    "SELECT * FROM bookmarks WHERE user_id=? AND course_id=?",
    [userId, courseId],
    (err, row) => {
      if (row) {
        coursesDb.run(
          "DELETE FROM bookmarks WHERE user_id=? AND course_id=?",
          [userId, courseId],
          () => res.redirect(redirectTo)
        );
      } else {
        coursesDb.run(
          "INSERT INTO bookmarks (user_id, course_id) VALUES (?,?)",
          [userId, courseId],
          () => res.redirect(redirectTo)
        );
      }
    }
  );
});

// Enroll toggle
app.post("/enroll/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;
  const courseId = req.params.id;
  const redirectTo = req.headers.referer || "/courses";

  coursesDb.get(
    "SELECT * FROM enrollments WHERE user_id=? AND course_id=?",
    [userId, courseId],
    (err, row) => {
      if (row) {
        coursesDb.run(
          "DELETE FROM enrollments WHERE user_id=? AND course_id=?",
          [userId, courseId],
          () => res.redirect(redirectTo)
        );
      } else {
        coursesDb.run(
          "INSERT INTO enrollments (user_id, course_id) VALUES (?,?)",
          [userId, courseId],
          () => res.redirect(redirectTo)
        );
      }
    }
  );
});

// Review - GET (view reviews for a course)
app.get("/review", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const courseId = req.query.course;
  if (!courseId) return res.redirect("/courses");

  coursesDb.get("SELECT * FROM courses WHERE id=?", [courseId], (err, course) => {
    if (!course) return res.redirect("/courses");

    db.get("SELECT username FROM users WHERE id=?", [course.teacher_id], (err, teacher) => {
      course.teacher = teacher ? teacher.username : "ไม่ระบุ";

      coursesDb.all(
        "SELECT * FROM reviews WHERE course_id=? ORDER BY id DESC",
        [courseId],
        (err, reviews) => {
          if (err) reviews = [];
          // Fetch usernames for each review (cross-db lookup)
          const userIds = [...new Set(reviews.map(r => r.user_id).filter(Boolean))];
          if (userIds.length === 0) {
            return finishRender(reviews);
          }
          const placeholders = userIds.map(() => "?").join(",");
          db.all(`SELECT id, username FROM users WHERE id IN (${placeholders})`, userIds, (err2, users) => {
            const userMap = {};
            if (users) users.forEach(u => { userMap[u.id] = u.username; });
            reviews.forEach(r => { r.username = userMap[r.user_id] || "ไม่ระบุ"; });
            finishRender(reviews);
          });

          function finishRender(reviews) {
            coursesDb.get(
              "SELECT AVG(rating) as avg FROM reviews WHERE course_id=?",
              [courseId],
              (err, ratingRow) => {
                const avgRating = ratingRow && ratingRow.avg ? Math.round(ratingRow.avg * 10) / 10 : 0;
                res.render("student/review", {
                  course,
                  courseId: course.id,
                  role: req.session.user.role,
                  reviews,
                  avgRating,
                  user: req.session.user
                });
              }
            );
          }
        }
      );
    });
  });
});

// Review - POST (submit review)
app.post("/review/:courseId", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.role !== "student") return res.redirect("/courses");

  const { rating, comment } = req.body;
  const courseId = req.params.courseId;
  const userId = req.session.user.id;

  coursesDb.run(
    "INSERT INTO reviews (course_id, user_id, rating, review_text) VALUES (?,?,?,?)",
    [courseId, userId, rating, comment],
    (err) => {
      res.redirect("/review?course=" + courseId);
    }
  );
});

// Review - DELETE (admin only)
app.post("/review/delete/:id", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }
  const reviewId = req.params.id;

  coursesDb.get("SELECT * FROM reviews WHERE id=?", [reviewId], (err, review) => {
    if (!review) return res.redirect("/courses");
    coursesDb.run("DELETE FROM reviews WHERE id=?", [reviewId], () => {
      res.redirect("/review?course=" + review.course_id);
    });
  });
});

// หลัง login teacher
app.get("/teacher", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.role !== "teacher" && req.session.user.role !== "admin") {
    return res.redirect("/home");
  }
  res.redirect("/home");
});

// Admin Manage User
app.get("/admin/manageUser", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  db.all("SELECT * FROM users WHERE role != 'admin'", [], (err, rows) => {
    if (err) return res.send("Database error");
    res.render("admin/manageUser", { users: rows, user: req.session.user });
  });
});

// Admin Search User
app.get("/admin/searchUser", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  const keyword = req.query.keyword || "";
  db.all(
    "SELECT * FROM users WHERE role != 'admin' AND username LIKE ?",
    ["%" + keyword + "%"],
    (err, rows) => {
      if (err) rows = [];
      res.render("admin/manageUser", { users: rows, user: req.session.user });
    }
  );
});

// Admin Delete User
app.post("/admin/deleteUser/:id", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }
  db.run("DELETE FROM users WHERE id=?", [req.params.id], () => {
    res.redirect("/admin/manageUser");
  });
});

// Admin Change Role
app.post("/admin/changeRole/:id", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }
  const newRole = req.body.role;
  if (!["student", "teacher"].includes(newRole)) {
    return res.redirect("/admin/manageUser");
  }
  db.run("UPDATE users SET role=? WHERE id=?", [newRole, req.params.id], () => {
    res.redirect("/admin/manageUser");
  });
});


// ─── POST ROUTES ─────────────────────────────────────────

// POST Register
app.post("/register", (req, res) => {
  const { username, password, phone, email, address, gender } = req.body;
  const role = "student";
  db.get(`SELECT * FROM users WHERE email=?`, [email], (err, row) => {
    if (row) {
      return res.send(`<script>alert("Email already used"); window.location.href="/register";</script>`);
    }
    db.run(
      `INSERT INTO users (username,password,phone,email,address,gender,role,image)
       VALUES (?,?,?,?,?,?,?,?)`,
      [username, password, phone, email, address, gender, role, null],
      function (err) {
        if (err) return res.send("Register failed");
        req.session.user = {
          id: this.lastID,
          username,
          phone,
          email,
          address,
          gender,
          role,
          image: null
        };
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

// Forgot password
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

// ─── EXAM & STUDENT PAGES ─────────────────────────────────────────

// Student exam list
app.get("/exam", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const exams = [
    { id: 1, name: "TGAT1" },
    { id: 2, name: "TGAT2" },
    { id: 3, name: "TPAT3" },
    { id: 4, name: "A-level คณิต 1" },
    { id: 5, name: "A-level อังกฤษ" }
  ];

  res.render("student/examList", { exams, user: req.session.user });
});

// Exam page for a subject
app.get("/student/exam/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const subject_id = req.params.id;

  examDb.all(
    "SELECT * FROM questions WHERE subject_id=?",
    [subject_id],
    (err, rows) => {
      res.render("student/examPage", {
        questions: rows || [],
        user: req.session.user,
        answers: null
      });
    }
  );
});

// Submit exam
app.post("/student/submit", (req, res) => {
  const subject_id = req.body.subject_id;
  const answers = req.body;

  let score = 0;
  let total = 0;

  examDb.all(
    "SELECT * FROM questions WHERE subject_id=?",
    [subject_id],
    (err, rows) => {
      rows.forEach(q => {
        total++;
        const studentAnswer = answers["q" + q.id];
        if (parseInt(studentAnswer) === q.answer) score++;
      });

      res.render("student/result", {
        user: req.session.user,
        score,
        total,
        subject_id
      });
    }
  );
});

// ─── TEACHER EXAM PAGES ────────────────────────────────────────

// Teacher exam list (subjects)
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

  res.render("teacher/examList", { user: req.session.user, subjects });
});

// Teacher create/edit exam questions
app.get("/teacher/create-exam/:id", (req, res) => {
  if (!req.session.user || req.session.user.role !== "teacher") {
    return res.redirect("/login");
  }

  const subject_id = req.params.id;
  const subjects = {
    1: "TGAT1", 2: "TGAT2", 3: "TPAT3",
    4: "A-level คณิต 1", 5: "A-level อังกฤษ"
  };

  examDb.all(
    "SELECT * FROM questions WHERE subject_id=?",
    [subject_id],
    (err, rows) => {
      if (err) return res.send("Database error");
      res.render("teacher/createExam", {
        user: req.session.user,
        exam: { id: subject_id, name: subjects[subject_id] },
        subject_id,
        questions: rows || []
      });
    }
  );
});

// Save exam questions
app.post("/teacher/saveExam", (req, res) => {
  const subject_id = req.body.subject_id;
  let questions = req.body.question;
  let c1 = req.body.choice1;
  let c2 = req.body.choice2;
  let c3 = req.body.choice3;
  let c4 = req.body.choice4;
  let answers = req.body.answer;

  // รองรับทั้งกรณีคำถามเดียวและหลายคำถาม
  if (!Array.isArray(questions)) {
    questions = [questions];
    c1 = [c1]; c2 = [c2]; c3 = [c3]; c4 = [c4];
    answers = [answers];
  }

  // Delete existing questions for this subject, then re-insert all (avoids duplicates)
  examDb.run("DELETE FROM questions WHERE subject_id=?", [subject_id], () => {
    examDb.serialize(() => {
      for (let i = 0; i < questions.length; i++) {
        if (!questions[i]) continue;
        examDb.run(
          `INSERT INTO questions (question,choice1,choice2,choice3,choice4,answer,subject_id)
           VALUES (?,?,?,?,?,?,?)`,
          [questions[i], c1[i], c2[i], c3[i], c4[i], answers[i], subject_id]
        );
      }
    });
    res.redirect("/teacher/create-exam/" + subject_id + "?saved=1");
  });
});

// Delete exam question
app.post("/teacher/delete-question/:id", (req, res) => {
  const question_id = req.params.id;
  const subject_id = req.body.subject_id;

  examDb.run("DELETE FROM questions WHERE id=?", [question_id], (err) => {
    if (err) return res.send("delete error");
    res.redirect("/teacher/create-exam/" + subject_id);
  });
});

// ─── TEACHER COURSE PAGES ─────────────────────────────────────────

// GET: Create course form
app.get("/teacher/create-course", (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
    return res.send("<script>alert('Unauthorized access'); window.location.href='/home';</script>");
  }
  res.render("teacher/createCourse", { user: req.session.user });
});

// POST: Save new course
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
        return res.redirect("/teacher/create-course?error=1");
      }
      res.redirect("/courses");
    }
  );
});

// GET: Edit course form
app.get("/teacher/edit-course/:id", (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
    return res.redirect("/login");
  }

  coursesDb.get("SELECT * FROM courses WHERE id=?", [req.params.id], (err, course) => {
    if (!course) return res.status(404).send("Course not found");
    res.render("teacher/editCourse", { user: req.session.user, course });
  });
});

// POST: Save course edits
app.post("/teacher/edit-course/:id", upload.single("image"), (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
    return res.redirect("/login");
  }

  const { title, description } = req.body;
  const courseId = req.params.id;

  coursesDb.get("SELECT * FROM courses WHERE id=?", [courseId], (err, course) => {
    if (!course) return res.status(404).send("Course not found");

    const image = req.file ? req.file.filename : course.image;
    const slug = title.toLowerCase().replace(/[^a-zA-Z0-9ก-๙]+/g, '-').replace(/(^-|-$)+/g, '') || course.slug;

    coursesDb.run(
      "UPDATE courses SET title=?, slug=?, description=?, image=? WHERE id=?",
      [title, slug, description, image, courseId],
      (err) => {
        if (err) return res.send("Update failed");
        res.redirect("/courses/" + slug);
      }
    );
  });
});

// GET: Manage lessons
app.get("/teacher/manage-lessons/:id", (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
    return res.redirect("/login");
  }

  const courseId = req.params.id;
  coursesDb.get("SELECT * FROM courses WHERE id=?", [courseId], (err, course) => {
    if (!course) return res.status(404).send("Course not found");

    coursesDb.all("SELECT * FROM lessons WHERE course_id=?", [courseId], (err, lessons) => {
      res.render("teacher/manageLessons", {
        user: req.session.user,
        course,
        lessons: lessons || []
      });
    });
  });
});

// POST: Add lesson
app.post("/teacher/add-lesson/:course_id", upload.fields([
  { name: "pdf_file", maxCount: 1 },
  { name: "video_file", maxCount: 1 }
]), (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
    return res.redirect("/login");
  }

  const course_id = req.params.course_id;
  const title = req.body.title;
  const pdf_file = req.files && req.files["pdf_file"] ? req.files["pdf_file"][0].filename : null;
  const video_file = req.files && req.files["video_file"] ? req.files["video_file"][0].filename : null;

  coursesDb.run(
    "INSERT INTO lessons (course_id, title, pdf_file, video_file) VALUES (?,?,?,?)",
    [course_id, title, pdf_file, video_file],
    (err) => {
      if (err) return res.send("Error adding lesson");
      res.redirect("/teacher/manage-lessons/" + course_id);
    }
  );
});

// POST: Delete lesson
app.post("/teacher/delete-lesson/:id", (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'teacher' && req.session.user.role !== 'admin')) {
    return res.redirect("/login");
  }

  const lessonId = req.params.id;
  const course_id = req.body.course_id;

  coursesDb.run("DELETE FROM lessons WHERE id=?", [lessonId], (err) => {
    res.redirect("/teacher/manage-lessons/" + course_id);
  });
});

// ─── START SERVER ─────────────────────────────────────────
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
