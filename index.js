const express = require("express");
const db = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const SECRET = process.env.JWT_SECRET || "secretkey";

// =======================
// HOME
// =======================
app.get("/", (req, res) => {
  res.send("Fintech API running 🚀");
});

// =======================
// REGISTER
// =======================
app.post("/register", async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);

    const user = await db.query(
      "INSERT INTO users (name, phone, password) VALUES ($1,$2,$3) RETURNING id,name,phone",
      [name, phone, hashed]
    );

    res.json(user.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// LOGIN
// =======================
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await db.query(
      "SELECT * FROM users WHERE phone=$1",
      [phone]
    );

    if (user.rows.length === 0)
      return res.status(400).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.rows[0].password);

    if (!valid)
      return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign(
      { id: user.rows[0].id },
      SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// AUTH MIDDLEWARE
// =======================
function auth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header)
      return res.status(401).json({ error: "No token" });

    const token = header.split(" ")[1];

    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;

    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// =======================
// WALLET
// =======================
app.post("/wallet", auth, async (req, res) => {
  try {
    const wallet = await db.query(
      "INSERT INTO wallets (user_id, balance, currency) VALUES ($1,0,'NGN') RETURNING *",
      [req.user.id]
    );

    res.json(wallet.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// CREDIT (FIXED)
// =======================
app.post("/credit", auth, async (req, res) => {
  try {
    const { wallet_id, amount } = req.body;

    const updated = await db.query(
      "UPDATE wallets SET balance = balance + $1 WHERE id=$2 RETURNING *",
      [amount, wallet_id]
    );

    if (updated.rows.length === 0)
      return res.status(404).json({ error: "Wallet not found" });

    // ✅ FIXED TRANSACTION LOGGING
    await db.query(
      "INSERT INTO transactions (wallet_id,type,amount,description) VALUES ($1,'credit',$2,'Wallet funded')",
      [wallet_id, amount]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// TRANSFER
// =======================
app.post("/transfer", auth, async (req, res) => {
  try {
    const { from_wallet, to_wallet, amount } = req.body;

    const sender = await db.query(
      "SELECT * FROM wallets WHERE id=$1",
      [from_wallet]
    );

    if (sender.rows.length === 0)
      return res.status(404).json({ error: "Sender not found" });

    if (Number(sender.rows[0].balance) < Number(amount))
      return res.status(400).json({ error: "Insufficient balance" });

    const receiver = await db.query(
      "SELECT * FROM wallets WHERE id=$1",
      [to_wallet]
    );

    if (receiver.rows.length === 0)
      return res.status(404).json({ error: "Receiver not found" });

    await db.query(
      "UPDATE wallets SET balance = balance - $1 WHERE id=$2",
      [amount, from_wallet]
    );

    await db.query(
      "UPDATE wallets SET balance = balance + $1 WHERE id=$2",
      [amount, to_wallet]
    );

    // debit log
    await db.query(
      "INSERT INTO transactions (wallet_id,type,amount,description) VALUES ($1,'debit',$2,'Transfer sent')",
      [from_wallet, amount]
    );

    // credit log
    await db.query(
      "INSERT INTO transactions (wallet_id,type,amount,description) VALUES ($1,'credit',$2,'Transfer received')",
      [to_wallet, amount]
    );

    res.json({ message: "Transfer successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// BALANCE
// =======================
app.get("/balance/:wallet_id", auth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id,user_id,balance,currency FROM wallets WHERE id=$1",
      [req.params.wallet_id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Wallet not found" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// TRANSACTIONS
// =======================
app.get("/transactions/:wallet_id", auth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM transactions WHERE wallet_id=$1 ORDER BY created_at DESC",
      [req.params.wallet_id]
    );

    res.json({
      count: result.rows.length,
      transactions: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// SERVER
// =======================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
