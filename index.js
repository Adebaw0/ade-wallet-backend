const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const db = require("./db");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(bodyParser.json());

/* ================= SESSION STORE ================= */
const sessions = {};

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.json({ status: "Wallet API is running 🚀" });
});

/* ================= DEBUG USERS ================= */
app.get("/debug-users", (req, res) => {
  db.all("SELECT * FROM users", [], (err, rows) => {
    if (err) return res.json({ error: "DB error" });
    res.json(rows);
  });
});

/* ================= DATABASE ================= */

db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE,
  password TEXT
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  balance REAL DEFAULT 0
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER,
  type TEXT,
  amount REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

/* ================= REGISTER ================= */
app.post("/register", (req, res) => {
  const phone = req.body.phone?.trim();
  const password = req.body.password?.trim();

  db.run(
    "INSERT INTO users (phone, password) VALUES (?, ?)",
    [phone, password],
    function (err) {
      if (err) {
        return res.json({ error: "User already exists" });
      }

      db.run(
        "INSERT INTO wallets (user_id, balance) VALUES (?, ?)",
        [this.lastID, 0]
      );

      res.json({ message: "User created successfully" });
    }
  );
});

/* ================= LOGIN ================= */
app.post("/login", (req, res) => {
  const phone = req.body.phone?.trim();
  const password = req.body.password?.trim();

  db.get(
    "SELECT * FROM users WHERE phone = ? AND password = ?",
    [phone, password],
    (err, user) => {
      if (err || !user) {
        return res.json({ error: "Invalid credentials" });
      }

      db.get(
        "SELECT * FROM wallets WHERE user_id = ?",
        [user.id],
        (err2, wallet) => {
          if (err2 || !wallet) {
            return res.json({ error: "Wallet not found" });
          }

          const token = crypto.randomBytes(16).toString("hex");

          sessions[token] = {
            userId: user.id,
            walletId: wallet.id
          };

          res.json({
            token,
            wallet_id: wallet.id
          });
        }
      );
    }
  );
});

/* ================= BALANCE ================= */
app.get("/balance/:walletId", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!sessions[token]) {
    return res.json({ error: "Unauthorized" });
  }

  db.get(
    "SELECT balance FROM wallets WHERE id = ?",
    [req.params.walletId],
    (err, wallet) => {
      if (err || !wallet) {
        return res.json({ error: "Wallet not found" });
      }

      res.json({ balance: wallet.balance });
    }
  );
});

/* ================= FUND WALLET ================= */
app.post("/fund", (req, res) => {
  const { wallet_id, amount } = req.body;

  const amt = parseFloat(amount);

  if (!amt || amt <= 0) {
    return res.json({ error: "Invalid amount" });
  }

  db.run(
    "UPDATE wallets SET balance = balance + ? WHERE id = ?",
    [amt, wallet_id],
    function (err) {
      if (err) {
        return res.json({ error: "Funding failed" });
      }

      res.json({ message: "Wallet funded successfully" });
    }
  );
});

/* ================= TRANSFER ================= */
app.post("/transfer", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!sessions[token]) {
    return res.json({ error: "Unauthorized" });
  }

  const { from_wallet, to_wallet, amount } = req.body;
  const amt = parseFloat(amount);

  if (!amt || amt <= 0) {
    return res.json({ error: "Invalid amount" });
  }

  db.get(
    "SELECT balance FROM wallets WHERE id = ?",
    [from_wallet],
    (err, sender) => {
      if (err || !sender) {
        return res.json({ error: "Sender not found" });
      }

      if (sender.balance < amt) {
        return res.json({ error: "Insufficient balance" });
      }

      db.get(
        "SELECT balance FROM wallets WHERE id = ?",
        [to_wallet],
        (err2, receiver) => {
          if (err2 || !receiver) {
            return res.json({ error: "Receiver not found" });
          }

          db.run(
            "UPDATE wallets SET balance = balance - ? WHERE id = ?",
            [amt, from_wallet]
          );

          db.run(
            "UPDATE wallets SET balance = balance + ? WHERE id = ?",
            [amt, to_wallet]
          );

          db.run(
            "INSERT INTO transactions (wallet_id, type, amount) VALUES (?, ?, ?)",
            [from_wallet, "transfer", amt]
          );

          res.json({ message: "Transfer successful" });
        }
      );
    }
  );
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
