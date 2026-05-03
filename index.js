const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");

const app = express();
app.use(cors());
app.use(bodyParser.json());

/* ================= ROOT (FIX FOR RENDER + EXPO TEST) ================= */
app.get("/", (req, res) => {
  res.json({ status: "Wallet API is running 🚀" });
});

/* ================= TABLES ================= */

db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT,
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
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

/* ================= LOGIN ================= */
app.post("/login", (req, res) => {
  const { phone, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE phone = ? AND password = ?",
    [phone, password],
    (err, user) => {
      if (err || !user) {
        return res.json({ error: "Invalid login" });
      }

      res.json({
        token: "token-" + user.id,
        user_id: user.id
      });
    }
  );
});

/* ================= BALANCE ================= */
app.get("/balance/:walletId", (req, res) => {
  db.get(
    "SELECT * FROM wallets WHERE id = ?",
    [req.params.walletId],
    (err, wallet) => {
      if (err || !wallet) {
        return res.json({ balance: 0 });
      }

      res.json({ balance: wallet.balance });
    }
  );
});

/* ================= TRANSFER ================= */
app.post("/transfer", (req, res) => {
  const { from_wallet, to_wallet, amount } = req.body;
  const amt = Number(amount);

  db.get(
    "SELECT * FROM wallets WHERE id = ?",
    [from_wallet],
    (err, sender) => {
      if (!sender || sender.balance < amt) {
        return res.json({ error: "Insufficient balance" });
      }

      // deduct sender
      db.run(
        "UPDATE wallets SET balance = balance - ? WHERE id = ?",
        [amt, from_wallet]
      );

      // add receiver
      db.run(
        "UPDATE wallets SET balance = balance + ? WHERE id = ?",
        [amt, to_wallet]
      );

      // ================= SAVE TRANSACTIONS (FIXED) =================

      db.run(
        "INSERT INTO transactions (wallet_id, type, amount, description) VALUES (?, ?, ?, ?)",
        [from_wallet, "debit", amt, `Sent to wallet ${to_wallet}`]
      );

      db.run(
        "INSERT INTO transactions (wallet_id, type, amount, description) VALUES (?, ?, ?, ?)",
        [to_wallet, "credit", amt, `Received from wallet ${from_wallet}`]
      );

      res.json({ message: "Transfer successful" });
    }
  );
});

/* ================= TRANSACTIONS ================= */
app.get("/transactions/:walletId", (req, res) => {
  db.all(
    "SELECT * FROM transactions WHERE wallet_id = ? ORDER BY created_at DESC",
    [req.params.walletId],
    (err, rows) => {
      if (err) {
        return res.json({ transactions: [] });
      }

      res.json({ transactions: rows || [] });
    }
  );
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Wallet backend running on port", PORT);
});
