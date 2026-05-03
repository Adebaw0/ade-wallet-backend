const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

/* ================= SESSION STORE ================= */
const sessions = {};

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.json({ status: "Wallet API running 🚀" });
});

/* ================= REGISTER ================= */
app.post("/register", async (req, res) => {
  const { phone, password } = req.body;

  try {
    const userResult = await db.query(
      "INSERT INTO users (phone, password) VALUES ($1, $2) RETURNING id",
      [phone, password]
    );

    const userId = userResult.rows[0].id;

    await db.query(
      "INSERT INTO wallets (user_id, balance) VALUES ($1, $2)",
      [userId, 0]
    );

    res.json({ message: "User created successfully" });
  } catch (err) {
    res.json({ error: "User already exists or error occurred" });
  }
});

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  try {
    const userResult = await db.query(
      "SELECT * FROM users WHERE phone = $1 AND password = $2",
      [phone, password]
    );

    if (userResult.rows.length === 0) {
      return res.json({ error: "Invalid credentials" });
    }

    const user = userResult.rows[0];

    const walletResult = await db.query(
      "SELECT * FROM wallets WHERE user_id = $1",
      [user.id]
    );

    const wallet = walletResult.rows[0];

    const token = crypto.randomBytes(16).toString("hex");

    sessions[token] = {
      userId: user.id,
      walletId: wallet.id
    };

    res.json({
      token,
      wallet_id: wallet.id
    });
  } catch (err) {
    res.json({ error: "Login failed" });
  }
});

/* ================= BALANCE ================= */
app.get("/balance/:walletId", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!sessions[token]) {
    return res.json({ error: "Unauthorized" });
  }

  const result = await db.query(
    "SELECT balance FROM wallets WHERE id = $1",
    [req.params.walletId]
  );

  res.json({ balance: result.rows[0].balance });
});

/* ================= FUND WALLET ================= */
app.post("/fund", async (req, res) => {
  const { wallet_id, amount } = req.body;

  await db.query(
    "UPDATE wallets SET balance = balance + $1 WHERE id = $2",
    [amount, wallet_id]
  );

  res.json({ message: "Wallet funded successfully" });
});

/* ================= TRANSFER ================= */
app.post("/transfer", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!sessions[token]) {
    return res.json({ error: "Unauthorized" });
  }

  const { from_wallet, to_wallet, amount } = req.body;

  const sender = await db.query(
    "SELECT balance FROM wallets WHERE id = $1",
    [from_wallet]
  );

  if (sender.rows[0].balance < amount) {
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
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
