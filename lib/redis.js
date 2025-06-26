// Simple in-memory Redis-like implementation
const store = new Map();

export default {
  async get(key) {
    const item = store.get(key);
    if (!item) return null;
    
    // Check if the item has expired
    if (item.expiry && item.expiry < Date.now()) {
      store.delete(key);
      return null;
    }
    
    return item.value;
  },
  
  async set(key, value, expiry) {
    store.set(key, {
      value,
      expiry: expiry ? Date.now() + (expiry * 1000) : null
    });
  },
  
  async del(key) {
    store.delete(key);
  }
}; 