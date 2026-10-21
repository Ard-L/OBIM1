const db = require("../config/database");

// Billers grouped by category
const BILLERS = {
  Electricity: ["Meralco", "Veco", "Davao Light"],
  Water: ["Maynilad", "Manila Water"],
  "Internet & Phone": ["PLDT", "Globe", "Smart", "Converge"],
  Government: ["SSS", "PhilHealth", "Pag-IBIG"],
};

function findCategory(biller) {
  return Object.keys(BILLERS).find((c) => BILLERS[c].includes(biller));
}

function getAccount(userId, cb) {
  db.query("SELECT * FROM vw_customer_accounts WHERE user_id = ?", [userId], (err, rows) =>
    cb(err, rows && rows[0])
  );
}

// ================================
// DASHBOARD
// ================================
function customerDashboard(req, res) {
  getAccount(req.session.user.user_id, (err, account) => {
    if (err) {
      console.error(err);
      return res.send("Database error.");
    }
    if (!account) return res.send("No bank account found.");

    const sql = `
      SELECT * FROM VW_transaction_history
      WHERE account_number = ?
      ORDER BY transaction_date DESC
    `;
    db.query(sql, [account.account_number], (err, transactions) => {
      if (err) {
        console.error(err);
        return res.send("Unable to load transactions.");
      }
      res.render("customer-dashboard", {
        account,
        transactions,
        success: req.query.success,
        error: req.query.error,
      });
    });
  });
}

// ================================
// DEPOSIT / WITHDRAW
// ================================
function runCashOp(proc, label, desc) {
  return (req, res) => {
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.redirect("/customer?error=" + encodeURIComponent(`Invalid ${label} amount`));
    }
    getAccount(req.session.user.user_id, (err, account) => {
      if (err || !account) return res.redirect("/customer?error=" + encodeURIComponent("Account not found."));

      db.query(`CALL ${proc}(?, ?, ?)`, [account.account_number, amount, desc], (err) => {
        if (err) {
          console.error(err);
          return res.redirect(
            "/customer?error=" + encodeURIComponent(err.sqlMessage || `${label} failed`)
          );
        }
        res.redirect("/customer?success=" + encodeURIComponent(`${label} completed successfully.`));
      });
    });
  };
}

const deposit = runCashOp("sp_deposit", "Deposit", "Online Cash Deposit");
const withdraw = runCashOp("sp_withdraw", "Withdrawal", "Online Cash Withdrawal");

// ================================
// PAY BILLS
// ================================
function showBills(req, res) {
  getAccount(req.session.user.user_id, (err, account) => {
    if (err || !account) return res.send("Database error.");

    db.query(
      "SELECT * FROM bill_payments WHERE account_number = ? ORDER BY paid_at DESC LIMIT 10",
      [account.account_number],
      (err, payments) => {
        if (err) console.error(err);
        res.render("bills", {
          account,
          billers: BILLERS,
          payments: err ? [] : payments,
          success: req.query.success,
          error: err ? "Bill payments table missing. Run migration.sql." : req.query.error,
        });
      }
    );
  });
}

function payBill(req, res) {
  const { biller, reference_no } = req.body;
  const amount = parseFloat(req.body.amount);
  const back = (type, msg) => res.redirect(`/customer/bills?${type}=` + encodeURIComponent(msg));

  const category = findCategory(biller);
  const ref = (reference_no || "").trim();

  if (!category) return back("error", "Please choose a valid biller.");
  if (!/^[A-Za-z0-9-]{3,40}$/.test(ref)) return back("error", "Enter a valid reference / account number.");
  if (isNaN(amount) || amount <= 0) return back("error", "Invalid amount.");

  getAccount(req.session.user.user_id, (err, account) => {
    if (err || !account) return back("error", "Account not found.");

    const description = `Bill Payment - ${biller} (Ref: ${ref})`;

    db.query("CALL sp_withdraw(?, ?, ?)", [account.account_number, amount, description], (err) => {
      if (err) {
        console.error(err);
        return back("error", err.sqlMessage || "Payment failed.");
      }
      db.query(
        `INSERT INTO bill_payments (account_number, biller, category, reference_no, amount)
         VALUES (?, ?, ?, ?, ?)`,
        [account.account_number, biller, category, ref, amount],
        (err) => {
          if (err) console.error("Bill log failed:", err);
          back("success", `Paid ₱${amount.toFixed(2)} to ${biller}.`);
        }
      );
    });
  });
}

// ================================
// TRANSFER
// ================================
function showTransfer(req, res) {
  getAccount(req.session.user.user_id, (err, account) => {
    if (err || !account) return res.send("Database error.");
    db.query(
      `SELECT * FROM VW_transaction_history
       WHERE account_number = ? AND description LIKE 'Transfer%'
       ORDER BY transaction_date DESC LIMIT 5`,
      [account.account_number],
      (err, transfers) => {
        if (err) console.error(err);
        res.render("transfer", {
          account,
          transfers: err ? [] : transfers,
          success: req.query.success,
          error: req.query.error,
        });
      }
    );
  });
}

function transfer(req, res) {
  const to = (req.body.to_account || "").trim();
  const amount = parseFloat(req.body.amount);
  const note = (req.body.note || "").trim().slice(0, 40);
  const back = (type, msg) => res.redirect(`/customer/transfer?${type}=` + encodeURIComponent(msg));

  if (!/^[A-Za-z0-9-]{6,30}$/.test(to)) return back("error", "Enter a valid recipient account number.");
  if (isNaN(amount) || amount <= 0) return back("error", "Invalid amount.");

  getAccount(req.session.user.user_id, (err, account) => {
    if (err || !account) return back("error", "Account not found.");
    if (account.account_number === to) return back("error", "You cannot transfer to your own account.");
    if (Number(account.balance) < amount) return back("error", "Insufficient balance.");

    db.query(
      "SELECT first_name, last_name, account_number, status FROM vw_customer_accounts WHERE account_number = ?",
      [to],
      (err, rows) => {
        if (err || rows.length === 0) return back("error", "Recipient account not found.");
        const rec = rows[0];
        if (/^(closed|frozen|inactive|suspended)$/i.test(rec.status || "")) {
          return back("error", "Recipient account is not active.");
        }

        const suffix = note ? " - " + note : "";
        const outDesc = `Transfer to ${rec.account_number}${suffix}`;
        const inDesc = `Transfer from ${account.account_number}${suffix}`;

        db.query("CALL sp_withdraw(?, ?, ?)", [account.account_number, amount, outDesc], (err) => {
          if (err) {
            console.error(err);
            return back("error", err.sqlMessage || "Transfer failed.");
          }
          db.query("CALL sp_deposit(?, ?, ?)", [rec.account_number, amount, inDesc], (err) => {
            if (err) {
              console.error(err);
              // give the money back to the sender
              db.query("CALL sp_deposit(?, ?, ?)", [account.account_number, amount, "Transfer refund"], () =>
                back("error", "Transfer failed and your money was returned.")
              );
              return;
            }
            back(
              "success",
              `Sent ₱${amount.toFixed(2)} to ${rec.first_name} ${rec.last_name.charAt(0)}. (${rec.account_number})`
            );
          });
        });
      }
    );
  });
}

// ================================
// PROFILE / ACCOUNT MANAGEMENT
// ================================
function showProfile(req, res) {
  const userId = req.session.user.user_id;
  getAccount(userId, (err, account) => {
    if (err || !account) return res.send("Database error.");
    db.query("SELECT * FROM customers WHERE user_id = ?", [userId], (err, rows) => {
      if (err || rows.length === 0) return res.send("Database error.");
      res.render("profile", {
        account,
        customer: rows[0],
        username: req.session.user.username,
        success: req.query.success,
        error: req.query.error,
      });
    });
  });
}

function updateProfile(req, res) {
  const { first_name, last_name, email, phone, address } = req.body;
  const back = (type, msg) => res.redirect(`/customer/profile?${type}=` + encodeURIComponent(msg));

  if (!(first_name || "").trim() || !(last_name || "").trim()) return back("error", "First and last name are required.");
  if (!/^\S+@\S+\.\S+$/.test(email || "")) return back("error", "Enter a valid email address.");
  if (phone && !/^[0-9+\- ]{7,15}$/.test(phone)) return back("error", "Enter a valid phone number.");

  db.query(
    "UPDATE customers SET first_name = ?, last_name = ?, email = ?, phone = ?, address = ? WHERE user_id = ?",
    [first_name.trim(), last_name.trim(), email.trim(), phone || null, address || null, req.session.user.user_id],
    (err) => {
      if (err) {
        console.error(err);
        return back("error", "Unable to update profile.");
      }
      back("success", "Profile updated.");
    }
  );
}

function changePassword(req, res) {
  const { current_password, new_password, confirm_password } = req.body;
  const back = (type, msg) => res.redirect(`/customer/profile?${type}=` + encodeURIComponent(msg));

  if (!new_password || new_password.length < 6) return back("error", "New password must be at least 6 characters.");
  if (new_password !== confirm_password) return back("error", "New passwords do not match.");

  db.query(
    "UPDATE users SET password = ? WHERE user_id = ? AND password = ?",
    [new_password, req.session.user.user_id, current_password],
    (err, result) => {
      if (err) {
        console.error(err);
        return back("error", "Unable to change password.");
      }
      if (result.affectedRows === 0) return back("error", "Current password is incorrect.");
      back("success", "Password changed.");
    }
  );
}

module.exports = {
  customerDashboard, deposit, withdraw, showBills, payBill,
  showTransfer, transfer, showProfile, updateProfile, changePassword,
};
