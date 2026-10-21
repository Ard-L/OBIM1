const db = require("../config/database");

function dashboard(req, res) {
  const sql = `
    SELECT * FROM vw_customer_accounts ORDER BY customer_id DESC
  `;

  const pendingSQL = `
    SELECT u.user_id, u.username, c.first_name, c.last_name, c.email, c.phone,
           c.requested_account_type
    FROM users u JOIN customers c ON c.user_id = u.user_id
    WHERE u.approval_status = 'Pending' ORDER BY u.user_id
  `;

  db.query(sql, (err, customers) => {
    if (err) {
      console.error(err);
      return res.send("Database error.");
    }

    db.query(pendingSQL, (err2, pending) => {
      if (err2) {
        console.error(err2);
        return res.send("Database error.");
      }
      res.render("admin-dashboard", {
        customers,
        pending,
        success: req.query.success,
        error: req.query.error,
      });
    });
  });
}

function generateAccountNumber() {
  return "10" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
}

function approveUser(req, res, attempt = 0) {
  const userId = req.params.id;

  db.query(
    `SELECT c.customer_id, c.requested_account_type FROM customers c
     JOIN users u ON u.user_id = c.user_id
     WHERE u.user_id = ? AND u.approval_status = 'Pending'`,
    [userId],
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.redirect("/admin?error=" + encodeURIComponent("Pending user not found."));
      }
      const { customer_id, requested_account_type } = rows[0];

      db.query(
        `INSERT INTO accounts (customer_id, account_number, account_type, balance, status)
         VALUES (?, ?, ?, 0.00, 'Active')`,
        [customer_id, generateAccountNumber(), requested_account_type || "Savings"],
        (err2) => {
          if (err2) {
            if (err2.code === "ER_DUP_ENTRY" && attempt < 5) return approveUser(req, res, attempt + 1);
            console.error(err2);
            return res.redirect("/admin?error=" + encodeURIComponent("Unable to create bank account."));
          }
          db.query("UPDATE users SET approval_status = 'Approved' WHERE user_id = ?", [userId], (err3) => {
            if (err3) {
              console.error(err3);
              return res.redirect("/admin?error=" + encodeURIComponent("Unable to approve user."));
            }
            res.redirect("/admin?success=" + encodeURIComponent("Account approved and created."));
          });
        }
      );
    }
  );
}

function rejectUser(req, res) {
  db.query(
    "UPDATE users SET approval_status = 'Rejected' WHERE user_id = ? AND approval_status = 'Pending'",
    [req.params.id],
    (err) => {
      if (err) console.error(err);
      res.redirect("/admin?success=" + encodeURIComponent("Registration rejected."));
    }
  );
}

function showCreateCustomer(req, res) {
  res.render("create-customer", {
    error: null,
  });
}

function createCustomer(req, res) {
  const {
    username,
    password,
    first_name,
    last_name,
    email,
    phone,
    address,
    account_number,
    account_type,
  } = req.body;

  const userSQL = `
    INSERT INTO users (username, password, role)
    VALUES (?, ?, 'customer')
  `;

  db.query(userSQL, [username, password], (err, userResult) => {
    if (err) {
      console.error(err);
      return res.render("create-customer", {
        error: "Unable to create login account.",
      });
    }
    const userId = userResult.insertId;

    const customerSQL = `
      INSERT INTO customers
      (user_id, first_name, last_name, email, phone, address)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(
      customerSQL,
      [userId, first_name, last_name, email, phone, address],
      (err, customerResult) => {
        if (err) {
          console.error(err);
          return res.render("create-customer", {
            error: "Unable to create customer.",
          });
        }
        const customerId = customerResult.insertId;

        const accountSQL = `
          INSERT INTO accounts
          (customer_id, account_number, account_type, balance, status)
          VALUES (?, ?, ?, 0.00, 'Active')
        `;

        db.query(accountSQL, [customerId, account_number, account_type], (err) => {
          if (err) {
            console.error(err);
            return res.render("create-customer", {
              error: "Unable to create bank account.",
            });
          }
          res.redirect("/admin");
        });
      }
    );
  });
}

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function analytics(req, res) {
  const q = (sql) => db.promise().query(sql).then(([rows]) => rows);
  try {
    const [summary] = await q(`
      SELECT (SELECT COUNT(*) FROM customers) AS customers,
             (SELECT COUNT(*) FROM accounts) AS accounts,
             (SELECT COUNT(*) FROM users WHERE approval_status = 'Pending') AS pending,
             (SELECT COALESCE(SUM(balance), 0) FROM accounts) AS total_balance`);

    const [totals] = await q(`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'Deposit' THEN amount END), 0) AS deposits,
             COALESCE(SUM(CASE WHEN transaction_type <> 'Deposit' THEN amount END), 0) AS withdrawals,
             COUNT(*) AS cnt
      FROM VW_transaction_history`);

    const flowRows = await q(`
      SELECT DATE_FORMAT(transaction_date, '%Y-%m-%d') AS d,
             SUM(CASE WHEN transaction_type = 'Deposit' THEN amount ELSE 0 END) AS deposits,
             SUM(CASE WHEN transaction_type <> 'Deposit' THEN amount ELSE 0 END) AS withdrawals
      FROM VW_transaction_history
      WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
      GROUP BY d`);

    const types = await q(`
      SELECT account_type, COUNT(*) AS cnt, COALESCE(SUM(balance), 0) AS total
      FROM vw_customer_accounts GROUP BY account_type`);

    const top = await q(`
      SELECT first_name, last_name, account_number, balance
      FROM vw_customer_accounts ORDER BY balance DESC LIMIT 5`);

    let bills = [];
    try {
      bills = await q(`
        SELECT biller, COUNT(*) AS cnt, SUM(amount) AS total
        FROM bill_payments GROUP BY biller ORDER BY total DESC`);
    } catch (e) {
      console.error("bill_payments not available:", e.message);
    }

    // last 14 days, filling empty days
    const byDay = new Map(flowRows.map((r) => [r.d, r]));
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const r = byDay.get(dayKey(d)) || {};
      days.push({
        label: d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
        deposits: Number(r.deposits || 0),
        withdrawals: Number(r.withdrawals || 0),
      });
    }
    const maxFlow = Math.max(1, ...days.flatMap((d) => [d.deposits, d.withdrawals]));
    days.forEach((d) => {
      d.dPct = (d.deposits / maxFlow) * 100;
      d.wPct = (d.withdrawals / maxFlow) * 100;
    });

    const maxBill = Math.max(1, ...bills.map((b) => Number(b.total)));
    bills.forEach((b) => (b.pct = (Number(b.total) / maxBill) * 100));
    const maxType = Math.max(1, ...types.map((t) => Number(t.total)));
    types.forEach((t) => (t.pct = (Number(t.total) / maxType) * 100));

    res.render("analytics", {
      summary,
      totals,
      days,
      types,
      top,
      bills,
      billTotal: bills.reduce((a, b) => a + Number(b.total), 0),
    });
  } catch (err) {
    console.error(err);
    res.send("Database error.");
  }
}

const validDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : null);
const REPORT_TYPES = ["Deposit", "Withdrawal", "Bill", "Transfer"];

function kindOf(r) {
  const d = r.description || "";
  if (d.startsWith("Bill Payment")) return "bill";
  if (d.startsWith("Transfer")) return "transfer";
  return r.transaction_type === "Deposit" ? "deposit" : "withdrawal";
}

async function fetchReport(qs) {
  const q = (sql, params) => db.promise().query(sql, params).then(([rows]) => rows);

  const fromDefault = new Date();
  fromDefault.setDate(fromDefault.getDate() - 30);
  const from = validDate(qs.from) || dayKey(fromDefault);
  const to = validDate(qs.to) || dayKey(new Date());
  const type = REPORT_TYPES.includes(qs.type) ? qs.type : "all";

  const where = ["DATE(transaction_date) BETWEEN ? AND ?"];
  if (type === "Deposit") where.push("transaction_type = 'Deposit' AND description NOT LIKE 'Transfer%'");
  if (type === "Withdrawal")
    where.push("transaction_type <> 'Deposit' AND description NOT LIKE 'Bill Payment%' AND description NOT LIKE 'Transfer%'");
  if (type === "Bill") where.push("description LIKE 'Bill Payment%'");
  if (type === "Transfer") where.push("description LIKE 'Transfer%'");

  const rows = await q(
    `SELECT * FROM VW_transaction_history WHERE ${where.join(" AND ")} ORDER BY transaction_date DESC`,
    [from, to]
  );
  const accounts = await q("SELECT account_number, first_name, last_name FROM vw_customer_accounts");
  const names = new Map(accounts.map((a) => [String(a.account_number), `${a.first_name} ${a.last_name}`]));

  let deposits = 0;
  let withdrawals = 0;
  rows.forEach((r) => {
    r.kind = kindOf(r);
    r.customer = names.get(String(r.account_number)) || "-";
    if (r.transaction_type === "Deposit") deposits += Number(r.amount);
    else withdrawals += Number(r.amount);
  });

  return { rows, filters: { from, to, type }, totals: { deposits, withdrawals, count: rows.length } };
}

async function reports(req, res) {
  try {
    const report = await fetchReport(req.query);
    res.render("reports", {
      rows: report.rows.slice(0, 500),
      truncated: report.rows.length > 500,
      filters: report.filters,
      totals: report.totals,
    });
  } catch (err) {
    console.error(err);
    res.send("Database error.");
  }
}

async function reportsCsv(req, res) {
  try {
    const { rows, filters } = await fetchReport(req.query);
    const cell = (v) => {
      let t = String(v ?? "");
      if (/^[=+\-@]/.test(t)) t = "'" + t; // block spreadsheet formula injection
      return `"${t.replace(/"/g, '""')}"`;
    };
    const lines = [["Date", "Account", "Customer", "Type", "Description", "Amount"].map(cell).join(",")];
    rows.forEach((r) =>
      lines.push(
        [new Date(r.transaction_date).toLocaleString("en-PH"), r.account_number, r.customer, r.kind, r.description, Number(r.amount).toFixed(2)]
          .map(cell)
          .join(",")
      )
    );
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="transactions-${filters.from}-to-${filters.to}.csv"`);
    res.send("\ufeff" + lines.join("\r\n"));
  } catch (err) {
    console.error(err);
    res.send("Database error.");
  }
}

module.exports = {
  dashboard, showCreateCustomer, createCustomer, approveUser, rejectUser,
  analytics, reports, reportsCsv,
};

