CREATE DATABASE IF NOT EXISTS waste_management_balunijuk
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE waste_management_balunijuk;

CREATE TABLE IF NOT EXISTS users (
  user_id INT NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(15) NOT NULL,
  role ENUM('RESIDENT', 'OFFICER', 'ADMIN') NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_phone_number (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS waste_bins (
  bin_id INT NOT NULL AUTO_INCREMENT,
  bin_code VARCHAR(20) NOT NULL,
  capacity INT NOT NULL,
  status ENUM('AVAILABLE', 'FULL', 'MAINTENANCE') DEFAULT 'AVAILABLE',
  location POINT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  PRIMARY KEY (bin_id),
  UNIQUE KEY uq_waste_bins_code (bin_code),
  KEY fk_bin_user (created_by),
  CONSTRAINT fk_bin_user FOREIGN KEY (created_by) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS illegal_dumpsites (
  dump_id INT NOT NULL AUTO_INCREMENT,
  reported_by INT NOT NULL,
  description TEXT,
  status ENUM('REPORTED', 'IN_PROGRESS', 'CLEANED') DEFAULT 'REPORTED',
  photo_url VARCHAR(255) DEFAULT NULL,
  location POINT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dump_id),
  KEY fk_dump_user (reported_by),
  CONSTRAINT fk_dump_user FOREIGN KEY (reported_by) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS collection_routes (
  route_id INT NOT NULL AUTO_INCREMENT,
  officer_id INT NOT NULL,
  route_name VARCHAR(100) NOT NULL,
  schedule VARCHAR(50) NOT NULL,
  boundary POLYGON NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (route_id),
  KEY fk_route_officer (officer_id),
  CONSTRAINT fk_route_officer FOREIGN KEY (officer_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cleanup_reports (
  report_id INT NOT NULL AUTO_INCREMENT,
  dump_id INT NOT NULL,
  officer_id INT NOT NULL,
  cleaned_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  PRIMARY KEY (report_id),
  KEY fk_cleanup_dump (dump_id),
  KEY fk_cleanup_officer (officer_id),
  CONSTRAINT fk_cleanup_dump FOREIGN KEY (dump_id) REFERENCES illegal_dumpsites (dump_id),
  CONSTRAINT fk_cleanup_officer FOREIGN KEY (officer_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO users (user_id, full_name, phone_number, role) VALUES
  (1, 'Ahmad Warga', '081234567890', 'RESIDENT'),
  (2, 'Budi Petugas', '081298765432', 'OFFICER'),
  (3, 'Admin Desa', '081311223344', 'ADMIN');

INSERT IGNORE INTO waste_bins (bin_id, bin_code, capacity, status, location, created_by) VALUES
  (1, 'BAL-001', 120, 'AVAILABLE', ST_GeomFromText('POINT(106.085 -2.075)'), 3),
  (2, 'PAG-001', 120, 'FULL', ST_GeomFromText('POINT(106.091 -2.081)'), 3),
  (3, 'BAL-002', 240, 'MAINTENANCE', ST_GeomFromText('POINT(106.078 -2.071)'), 3);

INSERT IGNORE INTO illegal_dumpsites
  (dump_id, reported_by, description, status, photo_url, location)
VALUES
  (1, 1, 'Tumpukan sampah liar di pinggir jalan dekat kebun warga', 'REPORTED',
   NULL, ST_GeomFromText('POINT(106.088 -2.072)'));

INSERT IGNORE INTO collection_routes (route_id, officer_id, route_name, schedule, boundary) VALUES
  (1, 2, 'Rute Balunijuk Utara', 'Senin & Kamis, 07.00', ST_GeomFromText(
    'POLYGON((106.075 -2.065,106.095 -2.065,106.095 -2.085,106.075 -2.085,106.075 -2.065))'
  ));
