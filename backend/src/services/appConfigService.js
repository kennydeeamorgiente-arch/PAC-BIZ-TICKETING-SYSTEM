const db = require('../config/database');

const CACHE_TTL_MS = 60 * 1000;
const DEFAULTS = {
  report_overdue_days: 3,
  report_sla_healthy_threshold: 90,
  report_sla_monitor_threshold: 70,
};

let cache = null;
let cacheAt = 0;

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

async function loadConfigMap() {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const [rows] = await db.query(
      `SELECT config_key, config_value
       FROM app_config
       WHERE is_active = 1`
    );

    const map = Object.create(null);
    for (const row of rows || []) {
      map[String(row.config_key)] = row.config_value;
    }

    cache = map;
    cacheAt = Date.now();
    return map;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return Object.create(null);
    }
    throw error;
  }
}

async function getReportSettings() {
  const map = await loadConfigMap();
  const overdueDays = clampNumber(map.report_overdue_days, DEFAULTS.report_overdue_days, 1, 30);
  const healthyThreshold = clampNumber(
    map.report_sla_healthy_threshold,
    DEFAULTS.report_sla_healthy_threshold,
    1,
    100
  );
  const monitorThresholdRaw = clampNumber(
    map.report_sla_monitor_threshold,
    DEFAULTS.report_sla_monitor_threshold,
    0,
    99
  );
  const monitorThreshold = Math.min(monitorThresholdRaw, healthyThreshold - 1);

  return {
    overdueDays,
    slaHealthyThreshold: healthyThreshold,
    slaMonitorThreshold: Math.max(0, monitorThreshold),
  };
}

function clearConfigCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = {
  getReportSettings,
  clearConfigCache,
};

