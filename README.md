# Skill Gap Analyzer - DBMS Prototype

This is a user-friendly full prototype for your DBMS project with:

- User enters job + skills
- System checks database
- Unknown job/skill is stored in pending tables
- Analysis continues with available data
- Admin approves/rejects pending records
- Email notification is simulated in server logs

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: MySQL

## 1) Setup Database

Run the SQL file:

```sql
SOURCE sql/schema.sql;
```

Or copy and execute `sql/schema.sql` in MySQL Workbench.

## 2) Configure DB Connection (Optional)

Defaults used by server:

- `DB_HOST=localhost`
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASSWORD=` (empty)
- `DB_NAME=skill_gap_analyzer`

Set environment variables if your MySQL setup is different.

## 3) Start Project

```bash
npm install
npm start
```

Open:

- [http://localhost:3000](http://localhost:3000)
- Admin login page: [http://localhost:3000/admin-login.html](http://localhost:3000/admin-login.html)

Default admin credentials:

- Email: `admin@skillgap.com`
- Password: `admin123`

You can override with environment variables:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## Prototype Flow Covered

1. User submits job and skills.
2. Known items are used for normal processing.
3. Unknown items go to `pending_jobs` / `pending_skills`.
4. Gap analysis continues with known data.
5. Admin logs in and views dashboard statistics.
6. Admin reviews skill/job entries with status badges.
7. Approve adds entry to main tables and updates status.
8. Reject updates status to `Rejected`.
9. Email event is logged in server console.

