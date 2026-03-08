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

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage: storage });


const db = new sqlite3.Database('user.db', (err) => {
  if (err) {
    console.error(err.message);
  }
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
  image TEXT
)
`);

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");


//Route Register
app.post("/register", (req, res) => {
  const { username, password, phone, email, address, gender } = req.body;
  if (!username || !password || !email) {
    return res.send(`
      <script>
      alert("Please fill Username, Email and Password");
      window.location.href="/register";
      </script>
    `);
  }
  // ตรวจ email ซ้ำ
  const checkSql = `SELECT * FROM users WHERE email = ?`;
  db.get(checkSql, [email], (err, row) => {
    if (row) {
      return res.send(`
        <script>
        alert("This email is already registered");
        window.location.href="/register";
        </script>
      `);
    }
    const insertSql = `
    INSERT INTO users (username,password,phone,email,address,gender,image)
    VALUES (?,?,?,?,?,?,?)
    `;
    db.run(insertSql, [username, password, phone, email, address, gender, null], function (err) {
      if (err) {
        console.log(err.message);
        return res.send("Register failed");
      }
      // เก็บ session
      req.session.user = {
        id: this.lastID,
        username,
        email
      };
      res.redirect("/home");
    });
  });
});

//สร้าง Route Login
app.post("/login", (req, res) => {
  const { login, password } = req.body;
  const sql = `
  SELECT * FROM users
  WHERE (username=? OR email=?) AND password=?
  `;
  db.get(sql, [login, login, password], (err, row) => {
    if (row) {
      req.session.user = row;
      res.redirect("/home");
    } else {
      res.send(`
        <script>
        alert("Login failed");
        window.location.href="/login";
        </script>
      `);
    }
  });
});

app.get("/", (req, res) => {
  res.redirect("/Home");
});

// Login page
app.get("/login", (req, res) => {
    res.render("Loginpage");
});

// Home page
app.get("/home", (req, res) => {
    res.render("Home");
});

// Register page
app.get("/register", (req, res) => {
    res.render("Registerpage");
});

// Register page
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/home");
});

// Register page
app.get("/profile", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  res.render("Profilepage", { user: req.session.user });
});

//Route เปิดหน้า Edit
app.get("/profile/edit", (req, res) => {
  if (!currentUser) {
    return res.redirect("/login");
  }
  res.render("EditProfile", { user: currentUser });
});


//Route Update
app.post("/profile/update", upload.single("image"), (req, res) => {
  const { username, phone, email, address, gender } = req.body;
  let image = currentUser.image;
  if (req.file) {
    image = req.file.filename;
  }
  const sql = `
  UPDATE users
  SET username=?, phone=?, email=?, address=?, gender=?, image=?
  WHERE id=?
  `;
  db.run(sql, [username, phone, email, address, gender, image, currentUser.id], (err) => {
    if (err) {
      console.log(err.message);
      return res.send("Update failed");
    }
    currentUser.username = username;
    currentUser.phone = phone;
    currentUser.email = email;
    currentUser.address = address;
    currentUser.gender = gender;
    currentUser.image = image;
    res.redirect("/profile");
  });
});

//route เปิด server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});