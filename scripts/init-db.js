const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const mysql = require("mysql2/promise");

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "Yodha@123",
    multipleStatements: true,
  });

  const sqlPath = path.join(__dirname, "..", "sql", "schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  console.log("Applying sql/schema.sql …");
  await connection.query(sql);
  await connection.end();
  console.log("Done. Database skill_gap_analyzer is ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
