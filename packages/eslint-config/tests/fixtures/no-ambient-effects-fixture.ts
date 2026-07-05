// Should flag Date.now(), new Date(), and Math.random() via f0rbit/no-ambient-effects
const created_at = Date.now();
const now = new Date();
const roll = Math.random();

export { created_at, now, roll };
