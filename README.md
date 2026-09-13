BitEat — a full-stack restaurant management system covering the whole floor: live table status, order taking, stock tracking, payments, and reservations.

Real-time floor view — table status (free / occupied / reserved) derived live from open orders and today's bookings, not stored state
Transactional order handling — every order, line edit, and payment is one atomic operation with row-level locking; stock is decremented and restored automatically for drink items
Role-based auth — scrypt password hashing with legacy-password auto-upgrade, custom JWT sessions, waiter/manager/admin permissions
OCR order scanning — photograph a paper order slip and the API reads it (self-hosted Tesseract), matches items against the menu, and automatically opens or updates the table's order
300+ tests covering the API against a hand-rolled Postgres double, running in CI on every push
Stack: Node.js · Express · PostgreSQL · React · Tailwind CSS · Vercel · Neon
