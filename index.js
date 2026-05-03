const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

/* ================= SESSIONS ================= */
const sessions = {};

/* ================= HEALTH CHECK ================= */
app.get("/", (req, res) => {
  res.json({ status: "Wallet API running 🚀" });
});

/* ================= TEST DB ================= */
app.get("/test-db", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.json({
      success: true,
      time: result.rows[0]
    });
  } catch (err) {
    console.log("DB ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= REGISTER ================= */
app.post("/register", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await db.query(
      "INSERT INTO users (phone, password) VALUES ($1, $2) RETURNING id",
      [phone, password]
    );

    const userId = user.rows[0].id;

    await db.query(
      "INSERT INTO wallets (user_id, balance) VALUES ($1, 0)",
      [userId]
    );

    res.json({ message: "User created successfully" });

  } catch (err) {
    console.log("REGISTER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await db.query(
      "SELECT * FROM users WHERE phone = $1 AND password = $2",
      [phone, password]
    );

    if (user.rows.length === 0) {
      return res.json({ error: "Invalid credentials" });
    }

    const wallet = await db.query(
      "SELECT * FROM wallets WHERE user_id = $1",
      [user.rows[0].id]
    );

    const token = crypto.randomBytes(16).toString("hex");

    sessions[token] = {
      userId: user.rows[0].id,
      walletId: wallet.rows[0].id
    };

    res.json({
      token,
      wallet_id: wallet.rows[0].id
    });

  } catch (err) {
    console.log("LOGIN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= BALANCE ================= */
app.get("/balance/:walletId", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!sessions[token]) {
      return res.json({ error: "Unauthorized" });
    }

    const result = await db.query(
      "SELECT balance FROM wallets WHERE id = $1",
      [req.params.walletId]
    );

    res.json({ balance: result.rows[0].balance });

  } catch (err) {
    console.log("BALANCE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= FUND WALLET ================= */
app.post("/fund", async (req, res) => {
  try {
    const { wallet_id, amount } = req.body;

    await db.query(
      "UPDATE wallets SET balance = balance + $1 WHERE id = $2",
      [amount, wallet_id]
    );

    res.json({ message: "Wallet funded successfully" });

  } catch (err) {
    console.log("FUND ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= TRANSFER ================= */
app.post("/transfer", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!sessions[token]) {
      return res.json({ error: "Unauthorized" });
    }

    const { from_wallet, to_wallet, amount } = req.body;

    const sender = await db.query(
      "SELECT balance FROM wallets WHERE id = $1",
      [from_wallet]
    );

    if (!sender.rows.length || sender.rows[0].balance < amount) {
      return res.json({ error: "Insufficient balance" });
    }

    await db.query(
      "UPDATE wallets SET balance = balance - $1 WHERE id = $2",
      [amount, from_wallet]
    );

    await db.query(
      "UPDATE wallets SET balance = balance + $1 WHERE id = $2",
      [amount, to_wallet]
    );

    res.json({ message: "Transfer successful" });

  } catch (err) {
    console.log("TRANSFER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
