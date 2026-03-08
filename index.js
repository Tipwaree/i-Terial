const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = 3000;

/* view engine */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* static files */

app.use(express.static(path.join(__dirname, "public")));

/* database */

const courseDB = new sqlite3.Database(
  path.join(__dirname, "course.db"),
  (err) => {
    if (err) {
      console.error(err.message);
    } else {
      console.log("Connected to course.db");
    }
  }
);

/* homepage */

app.get("/", (req, res) => {
  res.redirect("/search");
});

/* search page */

app.get("/search", (req, res) => {

  const keyword = req.query.keyword || "";

  if (keyword === "") {
    return res.render("search", {
      keyword: "",
      courses: null
    });
  }

  const sql = `
    SELECT * FROM courses
    WHERE course_name LIKE ? COLLATE NOCASE
  `;

  courseDB.all(sql, [`%${keyword}%`], (err, rows) => {

    if (err) {
      console.log(err);
      return res.send("Database error");
    }

    res.render("search", {
      keyword: keyword,
      courses: rows
    });

  });

});

/* course page */

app.get("/course/:name", (req, res) => {

  const name = decodeURIComponent(req.params.name);

  db.get(
    "SELECT * FROM courses WHERE course_name = ?",
    [name],
    (err, course) => {

      if (err) return res.send("Database error");

      if (!course) {
        return res.send("Course not found");
      }

      res.render("course", { course: course });

    }
  );

});

/* server */

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});