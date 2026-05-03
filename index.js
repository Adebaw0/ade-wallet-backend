const express = require("express");
const db = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const SECRET = "secretkey";

// HOME
app.get("/", (req, res) => {
  res.send("Fintech API running 🚀");
});

// REGISTER
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

// LOGIN
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

    const token = jwt.sign({ id: user.rows[0].id }, SECRET, {
      expiresIn: "1d",
    });

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AUTH
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header)
    return res.status(401).json({ error: "No token" });

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// WALLET
app.post("/wallet", auth, async (req, res) => {
  const wallet = await db.query(
    "INSERT INTO wallets (user_id, balance, currency) VALUES ($1,0,'NGN') RETURNING *",
    [req.user.id]
  );

  res.json(wallet.rows[0]);
});

// CREDIT
app.post("/credit", auth, async (req, res) => {
  const { wallet_id, amount } = req.body;

  const check = await db.query(
    "SELECT * FROM wallets WHERE id=$1 AND user_id=$2",
    [wallet_id, req.user.id]
  );

  if (check.rows.length === 0)
    return res.status(403).json({ error: "Not your wallet" });

  const updated = await db.query(
    "UPDATE wallets SET balance = balance + $1 WHERE id=$2 RETURNING *",
    [amount, wallet_id]
  );

  res.json(updated.rows[0]);
});

// TRANSFER
app.post("/transfer", auth, async (req, res) => {
  const { to_wallet, amount } = req.body;

  const sender = await db.query(
    "SELECT * FROM wallets WHERE user_id=$1",
    [req.user.id]
  );

  if (sender.rows.length === 0)
    return res.status(404).json({ error: "No wallet" });

  const from = sender.rows[0];

  const receiver = await db.query(
    "SELECT * FROM wallets WHERE id=$1",
    [to_wallet]
  );

  if (receiver.rows.length === 0)
    return res.status(404).json({ error: "Receiver not found" });

  if (Number(from.balance) < Number(amount))
    return res.status(400).json({ error: "Insufficient balance" });

  await db.query(
    "UPDATE wallets SET balance = balance - $1 WHERE id=$2",
    [amount, from.id]
  );

  await db.query(
    "UPDATE wallets SET balance = balance + $1 WHERE id=$2",
    [amount, to_wallet]
  );

  res.json({ message: "Transfer successful" });
});

// START SERVER
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
