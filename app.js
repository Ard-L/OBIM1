const express = require("express");
const session = require("express-session");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const customerRoutes = require("./routes/customerRoutes");

const app = express();
const PORT = 3000;

// MIDDLEWARE ============================================
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(express.json());

// Block emojis in any submitted form field
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/u;
app.use((req, res, next) => {
  const bad = Object.values(req.body || {}).some((v) => typeof v === "string" && EMOJI.test(v));
  if (bad) {
    return res
      .status(400)
      .send('<p style="font-family:sans-serif;padding:24px">Emojis are not allowed in the form. <a href="javascript:history.back()">Go back</a></p>');
  }
  next();
});
app.use(express.static("public"));

// SESSION ===============================================
app.use(
  session({
    secret: "online-banking-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// EJS ===================================================
app.set("view engine", "ejs");

// NO CACHE (back button after logout) ===================
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// ROUTES ================================================
app.use("/", authRoutes);
app.use("/admin", adminRoutes);
app.use("/customer", customerRoutes);

// SERVER ================================================
app.listen(PORT, () => {
  console.log(`Online Banking App running at http://localhost:${PORT}`);
});