const sqlite3 = require("sqlite3").verbose()

const db = new sqlite3.Database("./database/exam.db", (err) => {
    if (err) {
        console.error(err.message)
    }
    console.log("Connected to SQLite database")
})

db.serialize(() => {

    db.run(`
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
    `)

})



module.exports = db

