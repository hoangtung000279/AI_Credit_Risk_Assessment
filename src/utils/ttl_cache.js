class TtlCache {
  constructor() {
    this.map = new Map(); // key -> { value, expiresAt }
  }

  get(key) {
    const v = this.map.get(key);
    if (!v) return null;
    if (Date.now() > v.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return v.value;
  }

  set(key, value, ttlMs) {
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  clear(key) {
    if (key) this.map.delete(key);
    else this.map.clear();
  }
}

module.exports = { TtlCache };
