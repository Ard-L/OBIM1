const db = require("../config/database");

function showLogin(req, res) {
  res.render("login", { error: null, success: req.query.success });
}

function login(req, res) {
  const { username, password } = req.body;

  const sql = `SELECT user_id, username, role, approval_status FROM users
               WHERE username = ? AND password = ?`;

  db.query(sql, [username, password], (err, results) => {
    if (err) {
      console.error(err);
      return res.render("login", { error: "Database error.", success: null });
    }

    if (results.length === 0) {
      return res.render("login", { error: "Invalid username or password.", success: null });
    }

    const user = results[0];

    if (user.approval_status === "Pending") {
      return res.render("login", {
        error: "Your registration is still waiting for admin approval.",
        success: null,
      });
    }
    if (user.approval_status === "Rejected") {
      return res.render("login", {
        error: "Your registration was rejected. Please contact the bank.",
        success: null,
      });
    }

    req.session.user = { user_id: user.user_id, username: user.username, role: user.role };

    if (user.role === "admin") return res.redirect("/admin");
    return res.redirect("/customer");
  });
}

function showRegister(req, res) {
  res.render("register", { error: null, form: {} });
}

function register(req, res) {
  const { username, password, first_name, last_name, email, phone, address, account_type } = req.body;
  const type = account_type === "Checking" ? "Checking" : "Savings";
  const fail = (msg) => res.render("register", { error: msg, form: req.body });

  if (!/^[A-Za-z0-9_]{4,20}$/.test(username || "")) return fail("Username must be 4-20 letters, numbers or underscores.");
  if (!password || password.length < 6) return fail("Password must be at least 6 characters.");
  if (password !== req.body.confirm_password) return fail("Passwords do not match.");
  if (!/^\S+@\S+\.\S+$/.test(email || "")) return fail("Enter a valid email address.");
  if (phone && !/^[0-9+\- ]{7,15}$/.test(phone)) return fail("Enter a valid phone number.");

  const userSQL = `INSERT INTO users (username, password, role, approval_status)
                   VALUES (?, ?, 'customer', 'Pending')`;

  db.query(userSQL, [username, password], (err, userResult) => {
    if (err) {
      console.error(err);
      return fail(err.code === "ER_DUP_ENTRY" ? "Username is already taken." : "Unable to register.");
    }
    const userId = userResult.insertId;

    const customerSQL = `INSERT INTO customers
      (user_id, first_name, last_name, email, phone, address, requested_account_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.query(customerSQL, [userId, first_name, last_name, email, phone, address, type], (err2) => {
      if (err2) {
        console.error(err2);
        db.query("DELETE FROM users WHERE user_id = ?", [userId]);
        return fail("Unable to save your details.");
      }
      res.redirect("/?success=" + encodeURIComponent("Registration submitted. Please wait for admin approval."));
    });
  });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
}

module.exports = { showLogin, login, showRegister, register, logout };
