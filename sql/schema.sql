CREATE DATABASE IF NOT EXISTS skill_gap_analyzer;

USE skill_gap_analyzer;


CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    verified TINYINT(1) NOT NULL DEFAULT 0,
    verification_code VARCHAR(10) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE skills (
    skill_id INT AUTO_INCREMENT PRIMARY KEY,
    skill_name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE job_roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE job_skills (
    role_id INT,
    skill_id INT,
    importance ENUM('High','Medium','Low') DEFAULT 'Medium',

    PRIMARY KEY (role_id, skill_id),

    FOREIGN KEY (role_id)
    REFERENCES job_roles(role_id)
    ON DELETE CASCADE,

    FOREIGN KEY (skill_id)
    REFERENCES skills(skill_id)
    ON DELETE CASCADE
);

CREATE TABLE user_skills (
    user_id INT,
    skill_id INT,

    PRIMARY KEY (user_id, skill_id),

    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON DELETE CASCADE,

    FOREIGN KEY (skill_id)
    REFERENCES skills(skill_id)
    ON DELETE CASCADE
);

CREATE TABLE pending_skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    skill_name VARCHAR(50) NOT NULL,
    user_id INT,

    status ENUM('Pending','Approved','Rejected')
    DEFAULT 'Pending',

    notified TINYINT(1) NOT NULL DEFAULT 0,

    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON DELETE SET NULL
);

CREATE TABLE pending_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_name VARCHAR(50) NOT NULL,
    user_id INT,

    status ENUM('Pending','Approved','Rejected')
    DEFAULT 'Pending',

    notified TINYINT(1) NOT NULL DEFAULT 0,

    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON DELETE SET NULL
);




SELECT jr.role_name, s.skill_name, js.importance
FROM job_roles jr
JOIN job_skills js USING(role_id)
JOIN skills s USING(skill_id);

-- Job Roles


-- Skills


-- Job Skills



