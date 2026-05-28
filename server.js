const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Yodha@123",
  database: process.env.DB_NAME || "skill_gap_analyzer",
  waitForConnections: true,
  connectionLimit: 10,
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve pages from /pages directory
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "pages", "index.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(__dirname, "pages", "index.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "pages", "login.html")));
app.get("/signup.html", (req, res) => res.sendFile(path.join(__dirname, "pages", "signup.html")));
app.get("/verify.html", (req, res) => res.sendFile(path.join(__dirname, "pages", "verify.html")));
app.get("/admin-login.html", (req, res) => res.sendFile(path.join(__dirname, "pages", "admin-login.html")));
app.get("/admin-dashboard.html", (req, res) => res.sendFile(path.join(__dirname, "pages", "admin-dashboard.html")));

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@skillgap.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const activeAdminTokens = new Map();

function normalizeName(input) {
  return String(input || "").trim().replace(/\s+/g, " ");
}

function validatePasswordStrength(password) {
  const value = String(password || "");
  if (value.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[A-Z]/.test(value)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(value)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(value)) {
    return "Password must include at least one number.";
  }
  if (!/[!@#$%^&*()_+\[\]{};':"\\|,.<>\/?`~\-]/.test(value)) {
    return "Password must include at least one special character.";
  }
  return null;
}

async function ensureUser({ name, email, password }) {
  const safeName = normalizeName(name);
  const safeEmail = normalizeName(email).toLowerCase();
  const safePassword = String(password || "").trim();

  if (!safeName || !safeEmail || !safePassword) {
    throw new Error("Name, email, and password are required.");
  }

  const passwordError = validatePasswordStrength(safePassword);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const [existing] = await pool.query(
    "SELECT user_id FROM users WHERE email = ?",
    [safeEmail]
  );

  if (existing.length) {
    const userId = existing[0].user_id;

    await pool.query(
      "UPDATE users SET name = ?, password = ? WHERE user_id = ?",
      [safeName, safePassword, userId]
    );

    return userId;
  }

  const [result] = await pool.query(
    "INSERT INTO users(name, email, password) VALUES (?, ?, ?)",
    [safeName, safeEmail, safePassword]
  );

  return result.insertId;
}

async function getRoleByName(roleName) {
  const safe = normalizeName(roleName);

  const [rows] = await pool.query(
    "SELECT role_id, role_name FROM job_roles WHERE LOWER(role_name)=LOWER(?)",
    [safe]
  );

  return rows[0] || null;
}

async function getSkillByName(skillName) {
  const safe = normalizeName(skillName);

  const [rows] = await pool.query(
    "SELECT skill_id, skill_name FROM skills WHERE LOWER(skill_name)=LOWER(?)",
    [safe]
  );

  return rows[0] || null;
}

async function insertPendingSkill(skillName, userId) {
  const safe = normalizeName(skillName);

  if (!safe) return;

  await pool.query(
    `INSERT INTO pending_skills(skill_name, user_id)
     SELECT ?, ?
     WHERE NOT EXISTS (
       SELECT 1
       FROM pending_skills
       WHERE LOWER(skill_name)=LOWER(?)
       AND user_id=?
       AND status='Pending'
     )`,
    [safe, userId, safe, userId]
  );
}

async function insertPendingJob(jobName, userId) {
  const safe = normalizeName(jobName);

  if (!safe) return;

  await pool.query(
    `INSERT INTO pending_jobs(job_name, user_id)
     SELECT ?, ?
     WHERE NOT EXISTS (
       SELECT 1
       FROM pending_jobs
       WHERE LOWER(job_name)=LOWER(?)
       AND user_id=?
       AND status='Pending'
     )`,
    [safe, userId, safe, userId]
  );
}

function escapeHtmlForEmail(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSmtpCredentials() {
  const user = String(process.env.EMAIL_USER || "").trim();
  const pass = String(process.env.EMAIL_PASS || "")
    .replace(/\s+/g, "")
    .trim();
  return { user, pass };
}

async function sendSummaryEmail(to, skills, jobs) {
  const { user: smtpUser, pass: smtpPass } = getSmtpCredentials();

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const skillLinesText = skills.length
    ? skills.map((s) => `  - ${s.name}: ${s.status}`).join("\n")
    : "  (none)";

  const jobLinesText = jobs.length
    ? jobs.map((j) => `  - ${j.name}: ${j.status}`).join("\n")
    : "  (none)";

  const text = [
    "Your pending submissions have been reviewed.",
    "",
    "Skills:",
    skillLinesText,
    "",
    "Jobs:",
    jobLinesText,
    "",
    "— Skill Gap Analyzer",
  ].join("\n");

  const skillRowsHtml = skills.length
    ? `<ul>${skills
        .map(
          (s) =>
            `<li>${escapeHtmlForEmail(s.name)}: <strong>${escapeHtmlForEmail(
              s.status
            )}</strong></li>`
        )
        .join("")}</ul>`
    : "<p>(none)</p>";

  const jobRowsHtml = jobs.length
    ? `<ul>${jobs
        .map(
          (j) =>
            `<li>${escapeHtmlForEmail(j.name)}: <strong>${escapeHtmlForEmail(
              j.status
            )}</strong></li>`
        )
        .join("")}</ul>`
    : "<p>(none)</p>";

  const html = `<p>Your pending submissions have been reviewed.</p>
<h2>Skills</h2>
${skillRowsHtml}
<h2>Jobs</h2>
${jobRowsHtml}
<p>— Skill Gap Analyzer</p>`;

  await transporter.sendMail({
    from: `"Skill Gap Analyzer" <${smtpUser}>`,
    to,
    subject: "Skill Gap Analyzer - Review Updates",
    text,
    html,
  });
}

async function sendPendingReviewEmail(to, user, pendingSkills, pendingJobs) {
  const { user: smtpUser, pass: smtpPass } = getSmtpCredentials();

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const skillLinesText = pendingSkills.length
    ? pendingSkills.map((s) => `* ${s}`).join("\n")
    : "(none)";

  const jobLinesText = pendingJobs.length
    ? pendingJobs.map((j) => `* ${j}`).join("\n")
    : "(none)";

  const submittedAt = new Date().toISOString();

  const text = [
    `User #${user.id} submitted unknown entries.`,
    "",
    `User Name: ${user.name}`,
    `User Email: ${user.email}`,
    `User ID: ${user.id}`,
    `Submitted Time: ${submittedAt}`,
    "",
    "Unknown Skills:",
    skillLinesText,
    "",
    "Unknown Jobs:",
    jobLinesText,
    "",
    "— Skill Gap Analyzer",
  ].join("\n");

  const html = `<p>User #${escapeHtmlForEmail(String(user.id))} submitted unknown entries.</p>
<p><strong>User Name:</strong> ${escapeHtmlForEmail(user.name)}<br />
<strong>User Email:</strong> ${escapeHtmlForEmail(user.email)}<br />
<strong>User ID:</strong> ${escapeHtmlForEmail(String(user.id))}<br />
<strong>Submitted Time:</strong> ${escapeHtmlForEmail(submittedAt)}</p>
<h2>Unknown Skills</h2>
<ul>${pendingSkills
      .map((name) => `<li>${escapeHtmlForEmail(name)}</li>`)
      .join("")}</ul>
<h2>Unknown Jobs</h2>
<ul>${pendingJobs
      .map((name) => `<li>${escapeHtmlForEmail(name)}</li>`)
      .join("")}</ul>
<p>— Skill Gap Analyzer</p>`;

  await transporter.sendMail({
    from: `"Skill Gap Analyzer" <${smtpUser}>`,
    to,
    subject: "New Pending Review Request",
    text,
    html,
  });
}

async function sendVerificationEmail(to, code) {
  const { user: smtpUser, pass: smtpPass } = getSmtpCredentials();
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const text = `Your Skill Gap Analyzer verification code is: ${code}`;
  const html = `<p>Your Skill Gap Analyzer verification code is:</p><p><strong>${code}</strong></p>`;

  await transporter.sendMail({
    from: `"Skill Gap Analyzer" <${smtpUser}>`,
    to,
    subject: "Skill Gap Analyzer Email Verification",
    text,
    html,
  });
}

function getAdminToken(req) {
  const auth = String(req.headers.authorization || "");

  if (!auth.startsWith("Bearer ")) return "";

  return auth.slice("Bearer ".length).trim();
}

function requireAdminAuth(req, res, next) {
  const token = getAdminToken(req);

  if (!token || !activeAdminTokens.has(token)) {
    return res.status(401).json({
      error: "Unauthorized admin access.",
    });
  }

  req.admin = activeAdminTokens.get(token);

  next();
}

app.post("/api/admin/login", (req, res) => {
  const email = normalizeName(req.body?.email).toLowerCase();

  const password = String(req.body?.password || "");

  if (
    email !== ADMIN_EMAIL.toLowerCase() ||
    password !== ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      error: "Invalid admin credentials.",
    });
  }

  const token = crypto.randomBytes(24).toString("hex");

  const admin = {
    id: 1,
    email: ADMIN_EMAIL,
  };

  activeAdminTokens.set(token, admin);

  return res.json({
    token,
    admin,
  });
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    const safeName = normalizeName(name);
    const safeEmail = normalizeName(email).toLowerCase();
    const safePassword = String(password || "").trim();

    if (!safeName || !safeEmail || !safePassword) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const passwordError = validatePasswordStrength(safePassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const [existing] = await pool.query(
      "SELECT user_id FROM users WHERE email = ?",
      [safeEmail]
    );

    if (existing.length) {
      return res.status(409).json({ error: "Email is already registered." });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const [result] = await pool.query(
      "INSERT INTO users(name, email, password, verified, verification_code) VALUES (?, ?, ?, 0, ?)",
      [safeName, safeEmail, safePassword, verificationCode]
    );

    let verificationSent = true;
    let fallbackCode = null;

    try {
      await sendVerificationEmail(safeEmail, verificationCode);
    } catch (sendErr) {
      console.warn("Verification email failed to send:", sendErr.message);
      verificationSent = false;
      fallbackCode = verificationCode;
    }

    return res.json({
      user: {
        id: result.insertId,
        name: safeName,
        email: safeEmail,
      },
      message: "Signup successful. Please verify your email.",
      verificationSent,
      fallbackCode,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Server error",
    });
  }
});

app.post("/api/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const safeEmail = normalizeName(email).toLowerCase();
    const safeCode = String(code || "").trim();

    if (!safeEmail || !safeCode) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const [rows] = await pool.query(
      "SELECT user_id, verified FROM users WHERE LOWER(email) = LOWER(?) AND verification_code = ?",
      [safeEmail, safeCode]
    );

    if (!rows.length) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    if (rows[0].verified) {
      return res.status(400).json({ error: "This account is already verified." });
    }

    await pool.query(
      "UPDATE users SET verified = 1, verification_code = NULL WHERE user_id = ?",
      [rows[0].user_id]
    );

    return res.json({ message: "Email verified successfully. You may now log in." });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Server error",
    });
  }
});

app.post("/api/resend-verification", async (req, res) => {
  try {
    const { email } = req.body || {};
    const safeEmail = normalizeName(email).toLowerCase();

    if (!safeEmail) {
      return res.status(400).json({ error: "Email is required." });
    }

    const [rows] = await pool.query(
      "SELECT user_id, verified FROM users WHERE LOWER(email) = LOWER(?)",
      [safeEmail]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Email not found." });
    }

    if (rows[0].verified) {
      return res.status(400).json({ error: "Email is already verified." });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query(
      "UPDATE users SET verification_code = ? WHERE user_id = ?",
      [verificationCode, rows[0].user_id]
    );

    let verificationSent = true;
    let fallbackCode = null;

    try {
      await sendVerificationEmail(safeEmail, verificationCode);
    } catch (sendErr) {
      console.warn("Resend verification email failed:", sendErr.message);
      verificationSent = false;
      fallbackCode = verificationCode;
    }

    return res.json({
      message: "Verification code resent to your email.",
      verificationSent,
      fallbackCode,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Server error",
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const safeEmail = normalizeName(email).toLowerCase();
    const safePassword = String(password || "").trim();

    if (!safeEmail || !safePassword) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const [rows] = await pool.query(
      "SELECT user_id, name, email, password, verified FROM users WHERE LOWER(email) = LOWER(?)",
      [safeEmail]
    );

    if (!rows.length || rows[0].password !== safePassword) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (!rows[0].verified) {
      return res.status(403).json({ error: "Email not verified. Please verify your email before logging in." });
    }

    return res.json({
      user: {
        id: rows[0].user_id,
        name: rows[0].name,
        email: rows[0].email,
      },
      message: "Login successful.",
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Server error",
    });
  }
});

app.get("/api/skills", async (req, res) => {
  try {
    const q = normalizeName(req.query.q || "");

    const query =
      q.length > 0
        ? "SELECT skill_name AS name FROM skills WHERE skill_name LIKE ? ORDER BY skill_name LIMIT 50"
        : "SELECT skill_name AS name FROM skills ORDER BY skill_name LIMIT 200";

    const params = q.length > 0 ? [`%${q}%`] : [];

    const [rows] = await pool.query(query, params);

    res.json({
      items: rows,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to load skills.",
    });
  }
});

app.get("/api/jobs", async (req, res) => {
  try {
    const q = normalizeName(req.query.q || "");

    const query =
      q.length > 0
        ? "SELECT role_name AS name FROM job_roles WHERE role_name LIKE ? ORDER BY role_name LIMIT 50"
        : "SELECT role_name AS name FROM job_roles ORDER BY role_name LIMIT 200";

    const params = q.length > 0 ? [`%${q}%`] : [];

    const [rows] = await pool.query(query, params);

    res.json({
      items: rows,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to load jobs.",
    });
  }
});

app.post("/api/analyze", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { name, email, password, jobRole, skills } = req.body || {};

    const roleInput = normalizeName(jobRole);

    const skillInputs = Array.isArray(skills)
      ? skills.map(normalizeName).filter(Boolean)
      : [];

    if (!roleInput) {
      return res.status(400).json({
        error: "Job role is required.",
      });
    }

    if (!skillInputs.length) {
      return res.status(400).json({
        error: "At least one skill is required.",
      });
    }

    await connection.beginTransaction();

    const userId = await ensureUser({
      name,
      email,
      password,
    });

    const role = await getRoleByName(roleInput);

    const knownSkillIds = [];
    const pendingSkills = [];

    for (const skill of skillInputs) {
      const found = await getSkillByName(skill);

      if (found) {
        knownSkillIds.push(found.skill_id);
      } else {
        pendingSkills.push(skill);
        await insertPendingSkill(skill, userId);
      }
    }

    for (const skillId of knownSkillIds) {
      await connection.query(
        "INSERT IGNORE INTO user_skills(user_id, skill_id) VALUES (?, ?)",
        [userId, skillId]
      );
    }

    const pendingJobs = [];

    if (!role) {
      pendingJobs.push(roleInput);

      await insertPendingJob(roleInput, userId);
    }

    const hasUnknownEntries = pendingSkills.length > 0 || pendingJobs.length > 0;
    let analysis = null;
    let message = "Your request is pending admin review because it contains unknown skills or job roles.";
    let status = "Pending";

    if (!hasUnknownEntries) {
      let requiredSkills = [];

      if (role) {
        const [rows] = await connection.query(
          `SELECT s.skill_name
           FROM job_skills js
           JOIN skills s ON s.skill_id = js.skill_id
           WHERE js.role_id = ?`,
          [role.role_id]
        );

        requiredSkills = rows.map((r) => r.skill_name);
      }

      const [userSkillRows] = await connection.query(
        `SELECT DISTINCT s.skill_name
         FROM user_skills us
         JOIN skills s ON s.skill_id = us.skill_id
         WHERE us.user_id = ?`,
        [userId]
      );

      const userSkillNames = new Set(
        userSkillRows.map((r) => r.skill_name.toLowerCase())
      );

      const matchedSkills = requiredSkills.filter((s) =>
        userSkillNames.has(s.toLowerCase())
      );

      const missingSkills = requiredSkills.filter(
        (s) => !userSkillNames.has(s.toLowerCase())
      );

      const totalRequiredSkills = requiredSkills.length;
      const matchedSkillsCount = matchedSkills.length;
      const skillMatchPercentage =
        totalRequiredSkills > 0
          ? Math.round((matchedSkillsCount / totalRequiredSkills) * 100)
          : 0;

      analysis = {
        matchedSkills,
        missingSkills,
        totalRequiredSkills,
        matchedSkillsCount,
        skillMatchPercentage,
      };

      message = "Analysis completed successfully.";
      status = "Complete";
    }

    await connection.commit();

    if (hasUnknownEntries) {
      try {
        await sendPendingReviewEmail(
          ADMIN_EMAIL,
          {
            id: userId,
            name: normalizeName(name),
            email: normalizeName(email).toLowerCase(),
          },
          pendingSkills,
          pendingJobs
        );
      } catch (emailError) {
        console.warn("Failed to send pending review email:", emailError.message);
      }
    }

    res.json({
      user: {
        id: userId,
        name: normalizeName(name),
        email: normalizeName(email).toLowerCase(),
      },

      role: {
        input: roleInput,
        exists: Boolean(role),
      },

      pending: {
        skills: pendingSkills,
        jobs: pendingJobs,
      },

      status,
      analysis,
      message,
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      error: error.message || "Server error",
    });
  } finally {
    connection.release();
  }
});

app.get("/api/admin/stats", requireAdminAuth, async (_req, res) => {
  try {
    const [[users]] = await pool.query(
      "SELECT COUNT(*) AS count FROM users"
    );

    const [[skills]] = await pool.query(
      "SELECT COUNT(*) AS count FROM skills"
    );

    const [[pendingSkillsCount]] = await pool.query(
      "SELECT COUNT(*) AS count FROM pending_skills WHERE status='Pending'"
    );

    const [[pendingJobsCount]] = await pool.query(
      "SELECT COUNT(*) AS count FROM pending_jobs WHERE status='Pending'"
    );

    res.json({
      totalUsers: users.count,
      totalSkills: skills.count,
      pendingApprovals:
        pendingSkillsCount.count + pendingJobsCount.count,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to load stats.",
    });
  }
});

app.get("/api/admin/pending", requireAdminAuth, async (req, res) => {
  try {
    const safeStatus = normalizeName(
      req.query.status || "Pending"
    );

    const statusFilter = ["Pending", "Approved", "Rejected"].includes(
      safeStatus
    )
      ? safeStatus
      : "all";

    const skillParams = [];
    const jobParams = [];

    const skillWhere =
      statusFilter === "all" ? "" : "WHERE ps.status = ?";

    const jobWhere =
      statusFilter === "all" ? "" : "WHERE pj.status = ?";

    if (statusFilter !== "all") {
      skillParams.push(statusFilter);
      jobParams.push(statusFilter);
    }

    const [skillRows] = await pool.query(
      `SELECT ps.id,
              ps.skill_name AS name,
              ps.status,
              ps.notified,
              ps.user_id,
              ps.submitted_at,
              u.email AS user_email
       FROM pending_skills ps
       LEFT JOIN users u ON u.user_id = ps.user_id
       ${skillWhere}
       ORDER BY FIELD(ps.status,'Pending','Approved','Rejected'),
                ps.submitted_at DESC`,
      skillParams
    );

    const [jobRows] = await pool.query(
      `SELECT pj.id,
              pj.job_name AS name,
              pj.status,
              pj.notified,
              pj.user_id,
              pj.submitted_at,
              u.email AS user_email,
              jr.role_id AS role_id
       FROM pending_jobs pj
       LEFT JOIN users u ON u.user_id = pj.user_id
       LEFT JOIN job_roles jr
         ON pj.status = 'Approved'
         AND LOWER(jr.role_name) = LOWER(pj.job_name)
       ${jobWhere}
       ORDER BY FIELD(pj.status,'Pending','Approved','Rejected'),
                pj.submitted_at DESC`,
      jobParams
    );

    res.json({
      pendingSkills: skillRows,
      pendingJobs: jobRows,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to load pending data.",
    });
  }
});

app.post("/api/admin/review", requireAdminAuth, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { type, id, action } = req.body || {};

    const rowId = Number(id);

    const safeType = String(type || "").toLowerCase();

    const safeAction = String(action || "");

    if (!["skill", "job"].includes(safeType)) {
      return res.status(400).json({
        error: "Invalid review type.",
      });
    }

    if (!["Approved", "Rejected"].includes(safeAction)) {
      return res.status(400).json({
        error: "Invalid action.",
      });
    }

    if (!Number.isInteger(rowId) || rowId < 1) {
      return res.status(400).json({
        error: "Invalid id.",
      });
    }

    await connection.beginTransaction();

    const table =
      safeType === "skill"
        ? "pending_skills"
        : "pending_jobs";

    const nameCol =
      safeType === "skill"
        ? "skill_name"
        : "job_name";

    const [rows] = await connection.query(
      `SELECT p.id,
              p.${nameCol} AS item_name,
              p.status,
              p.user_id,
              u.email
       FROM ${table} p
       LEFT JOIN users u ON u.user_id = p.user_id
       WHERE p.id = ?`,
      [rowId]
    );

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        error: "Pending item not found.",
      });
    }

    const item = rows[0];

    if (item.status !== "Pending") {
      await connection.rollback();

      return res.status(400).json({
        error: "Only pending entries can be reviewed.",
      });
    }

    await connection.query(
      `UPDATE ${table} SET status = ? WHERE id = ?`,
      [safeAction, rowId]
    );

    if (safeAction === "Approved") {
      if (safeType === "skill") {
        await connection.query(
          "INSERT IGNORE INTO skills(skill_name) VALUES (?)",
          [item.item_name]
        );
      } else {
        await connection.query(
          "INSERT IGNORE INTO job_roles(role_name) VALUES (?)",
          [item.item_name]
        );
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: `${safeType} "${item.item_name}" ${safeAction.toLowerCase()} successfully.`,
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      error: error.message || "Review failed.",
    });
  } finally {
    connection.release();
  }
});

app.post("/api/admin/send-summary", requireAdminAuth, async (req, res) => {
  const userId = Number(req.body?.userId);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      error: "Valid userId is required.",
    });
  }

  const { user: smtpUser, pass: smtpPass } = getSmtpCredentials();

  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error:
        "Email is not configured. Set EMAIL_USER and EMAIL_PASS (Gmail app password) in your .env file.",
    });
  }

  try {
    const [[userRow]] = await pool.query(
      "SELECT user_id, name, email FROM users WHERE user_id = ?",
      [userId]
    );

    if (!userRow) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    const recipient = normalizeName(userRow.email).toLowerCase();

    if (!recipient) {
      return res.status(400).json({
        error: "This user has no email address on file.",
      });
    }

    const [skillRows] = await pool.query(
      `SELECT id, skill_name AS item_name, status
       FROM pending_skills
       WHERE user_id = ?
         AND status IN ('Approved','Rejected')
         AND notified = 0`,
      [userId]
    );

    const [jobRows] = await pool.query(
      `SELECT id, job_name AS item_name, status
       FROM pending_jobs
       WHERE user_id = ?
         AND status IN ('Approved','Rejected')
         AND notified = 0`,
      [userId]
    );

    if (!skillRows.length && !jobRows.length) {
      return res.status(200).json({
        success: false,
        message:
          "There are no approved or rejected items waiting to be emailed for this user.",
      });
    }

    const skillsPayload = skillRows.map((r) => ({
      name: r.item_name,
      status: r.status,
    }));

    const jobsPayload = jobRows.map((r) => ({
      name: r.item_name,
      status: r.status,
    }));

    try {
      await sendSummaryEmail(recipient, skillsPayload, jobsPayload);
    } catch (emailErr) {
      return res.status(502).json({
        error:
          emailErr.message ||
          "Email could not be sent. Check Gmail credentials, app passwords, and that less secure access or OAuth is configured correctly.",
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (skillRows.length) {
        const ids = skillRows.map((r) => r.id);
        await connection.query(
          `UPDATE pending_skills SET notified = 1 WHERE id IN (${ids
            .map(() => "?")
            .join(",")})`,
          ids
        );
      }

      if (jobRows.length) {
        const ids = jobRows.map((r) => r.id);
        await connection.query(
          `UPDATE pending_jobs SET notified = 1 WHERE id IN (${ids
            .map(() => "?")
            .join(",")})`,
          ids
        );
      }

      await connection.commit();

      res.json({
        success: true,
        message: `Review summary email sent to ${recipient}.`,
        skillsNotified: skillRows.length,
        jobsNotified: jobRows.length,
      });
    } catch (dbErr) {
      await connection.rollback();

      res.status(500).json({
        error:
          dbErr.message ||
          "Email was sent but the database could not be updated. Reconcile notified flags manually if needed.",
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({
      error: error.message || "Send summary failed.",
    });
  }
});

app.get("/api/admin/skills-catalog", requireAdminAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT skill_id AS id, skill_name AS name FROM skills ORDER BY skill_name"
    );

    res.json({ items: rows });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to load skills.",
    });
  }
});

app.get("/api/admin/job-roles-catalog", requireAdminAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT role_id AS id, role_name AS name FROM job_roles ORDER BY role_name"
    );

    res.json({ items: rows });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to load job roles.",
    });
  }
});

app.get(
  "/api/admin/job-skill-mappings",
  requireAdminAuth,
  async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT js.role_id AS roleId,
                jr.role_name AS roleName,
                js.skill_id AS skillId,
                s.skill_name AS skillName,
                js.importance
         FROM job_skills js
         JOIN job_roles jr ON jr.role_id = js.role_id
         JOIN skills s ON s.skill_id = js.skill_id
         ORDER BY jr.role_name, s.skill_name`
      );

      res.json({ mappings: rows });
    } catch (error) {
      res.status(500).json({
        error: error.message || "Failed to load job skill mappings.",
      });
    }
  }
);

app.post("/api/admin/map-skills", requireAdminAuth, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const body = req.body || {};
    const roleId = Number(body.roleId);

    const importanceValues = ["High", "Medium", "Low"];

    if (!Number.isInteger(roleId) || roleId < 1) {
      return res.status(400).json({
        error: "Valid roleId is required.",
      });
    }

    const [[roleRow]] = await connection.query(
      "SELECT role_id FROM job_roles WHERE role_id = ?",
      [roleId]
    );

    if (!roleRow) {
      return res.status(404).json({
        error: "Job role not found.",
      });
    }

    const pairs = [];

    if (Array.isArray(body.skills) && body.skills.length) {
      for (const entry of body.skills) {
        const skillId = Number(entry.skillId);
        const imp = String(entry.importance || "Medium");

        if (!Number.isInteger(skillId) || skillId < 1) continue;

        if (!importanceValues.includes(imp)) {
          return res.status(400).json({
            error: "Each importance must be High, Medium, or Low.",
          });
        }

        pairs.push({ skillId, importance: imp });
      }
    } else {
      const skillId = Number(body.skillId);
      const imp = String(body.importance || "Medium");

      if (!Number.isInteger(skillId) || skillId < 1) {
        return res.status(400).json({
          error: "Valid skillId is required (or use skills array).",
        });
      }

      if (!importanceValues.includes(imp)) {
        return res.status(400).json({
          error: "importance must be High, Medium, or Low.",
        });
      }

      pairs.push({ skillId, importance: imp });
    }

    if (!pairs.length) {
      return res.status(400).json({
        error: "Provide skillId/importance or a non-empty skills array.",
      });
    }

    await connection.beginTransaction();

    for (const { skillId, importance } of pairs) {
      const [[skillRow]] = await connection.query(
        "SELECT skill_id FROM skills WHERE skill_id = ?",
        [skillId]
      );

      if (!skillRow) {
        await connection.rollback();

        return res.status(404).json({
          error: `Skill id ${skillId} not found.`,
        });
      }

      await connection.query(
        `INSERT INTO job_skills (role_id, skill_id, importance)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE importance = VALUES(importance)`,
        [roleId, skillId, importance]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Job skill mapping(s) saved.",
      count: pairs.length,
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      error: error.message || "Failed to save mappings.",
    });
  } finally {
    connection.release();
  }
});

app.delete("/api/admin/map-skills", requireAdminAuth, async (req, res) => {
  try {
    const roleId = Number(req.body?.roleId);
    const skillId = Number(req.body?.skillId);

    if (!Number.isInteger(roleId) || roleId < 1) {
      return res.status(400).json({
        error: "Valid roleId is required.",
      });
    }

    if (!Number.isInteger(skillId) || skillId < 1) {
      return res.status(400).json({
        error: "Valid skillId is required.",
      });
    }

    const [result] = await pool.query(
      "DELETE FROM job_skills WHERE role_id = ? AND skill_id = ?",
      [roleId, skillId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Mapping not found.",
      });
    }

    res.json({
      success: true,
      message: "Mapping removed.",
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to remove mapping.",
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "skill-gap-analyzer-prototype",
  });
});

async function ensureNotifiedColumns() {
  const statements = [
    "ALTER TABLE pending_skills ADD COLUMN notified TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE pending_jobs ADD COLUMN notified TINYINT(1) NOT NULL DEFAULT 0",
  ];

  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (err) {
      if (err.code !== "ER_DUP_FIELDNAME") {
        throw err;
      }
    }
  }
}

async function ensureUserVerificationColumns() {
  const statements = [
    "ALTER TABLE users ADD COLUMN verified TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN verification_code VARCHAR(10) DEFAULT NULL",
  ];

  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (err) {
      if (err.code !== "ER_DUP_FIELDNAME") {
        throw err;
      }
    }
  }
}

async function start() {
  try {
    await pool.query("SELECT 1 FROM job_roles LIMIT 1");
    await ensureNotifiedColumns();
    await ensureUserVerificationColumns();
  } catch (err) {
    if (err && err.code === "ER_NO_SUCH_TABLE") {
      console.error(
        "\n[skill_gap_analyzer] Tables are missing (e.g. job_roles).\n" +
          "Create them with: npm run init-db\n" +
          "Or import sql/schema.sql in MySQL Workbench / CLI.\n"
      );
    } else {
      console.error("Database check failed:", err.message);
    }
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
}

start();