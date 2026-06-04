-- raw_records: 소스별 원본 1건씩 저장
CREATE TABLE IF NOT EXISTS raw_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  source_url  TEXT,
  raw_json    TEXT NOT NULL,
  collected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- companies: 병합·정규화된 최종 기업 레코드
CREATE TABLE IF NOT EXISTS companies (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name     TEXT NOT NULL,
  main_phone       TEXT,
  phone_status     TEXT NOT NULL DEFAULT 'unverified' CHECK(phone_status IN ('verified','unverified','none')),
  address          TEXT,
  region_sido      TEXT,
  region_sigungu   TEXT,
  industry         TEXT,
  employee_count   INTEGER,
  homepage_url     TEXT,
  biz_reg_no       TEXT,
  departments      TEXT,        -- JSON array of string
  keyman_candidates TEXT,       -- JSON array of {name,title,phone?,source}
  field_sources    TEXT,        -- JSON: {fieldName: {source, source_url, collected_at}}
  raw_record_ids   TEXT,        -- JSON array of raw_record ids
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_name);
CREATE INDEX IF NOT EXISTS idx_companies_biz_reg_no ON companies(biz_reg_no);
CREATE INDEX IF NOT EXISTS idx_companies_phone ON companies(main_phone);
CREATE INDEX IF NOT EXISTS idx_raw_records_source ON raw_records(source);
