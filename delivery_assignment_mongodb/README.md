# Delivery Assignment System — MongoDB version

Same project, same screens, same API — but the database is **MongoDB** and the
backend is **Node.js + Express + Mongoose** (replaces Django + SQLite).
Your existing frontend (login / driver / customer / manager pages) is included
**unchanged**.

```
delivery_assignment_mongodb/
├── docker-compose.yml        optional: starts MongoDB for you
├── frontend/                 your original HTML/JS (unchanged)
└── backend/
    ├── package.json
    ├── .env.example          copy to .env
    ├── scripts/seed.js       1 restaurant, 20 drivers, 500 customers, 1 manager
    ├── src/
    │   ├── server.js         connects to MongoDB, starts Express
    │   ├── app.js            routes + serves the frontend at /app/
    │   ├── auth.js           JWT + role check
    │   ├── models/           User, Restaurant, Driver, Customer, Order, Counter
    │   ├── services/assignment.js   the assignment engine
    │   └── routes/           auth, customer, driver, manager
    └── test/api.test.js
```

## Where does it run?

Three pieces, all on your computer for development:

| Piece | What | Where it runs |
|---|---|---|
| **MongoDB** (database) | stores users, drivers, orders | **Option A:** MongoDB Atlas (free cloud, no install) · **Option B:** MongoDB Community installed locally · **Option C:** Docker (`docker compose up -d`) |
| **Backend** (Node.js) | API + assignment engine + serves the web pages | your terminal → `http://127.0.0.1:8000` |
| **Frontend** | the HTML pages | served by the backend itself at `http://127.0.0.1:8000/` (nothing extra to run) |

## Run it (step by step)

1. Install **Node.js 18+** from https://nodejs.org
2. Get a MongoDB (pick one):
   - **Atlas (easiest):** create a free cluster at https://www.mongodb.com/atlas → *Database Access* → add a user → *Network Access* → allow your IP → *Connect → Drivers* → copy the connection string.
   - **Docker:** `docker compose up -d` (from this folder) → URI is `mongodb://127.0.0.1:27017/delivery_assignment`
   - **Local install:** install MongoDB Community Server and start it → same URI as above.
3. In a terminal:

```bash
cd backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
# open .env and set MONGODB_URI (Atlas string, or leave the local one) and JWT_SECRET
npm run seed                # fills MongoDB with demo data
npm start                   # http://127.0.0.1:8000
```

4. Open **http://127.0.0.1:8000/** and sign in:

| Role | Username | Password |
|---|---|---|
| Manager | `manager1` | `Manager@123` |
| Driver | `driver01` … `driver20` | `Driver@123` |
| Customer | `customer001` … `customer500` | `Customer@123` |

`npm run seed:reset` wipes everything and reseeds. You can browse the data with
**MongoDB Compass** (free GUI) or the Atlas web UI.

## Collections in MongoDB

`users` (role: customer/driver/manager) · `restaurants` · `drivers` (status available/busy) ·
`customers` · `orders` (status pending/assigned/delivered/cancelled) · `counters` (order numbers #1, #2…)

## How assignment works (same rules as before)

- Orders with the same `road_area` go to **one** driver.
- A driver who has a batch is **busy** and gets nothing new until all are delivered.
- No free driver → order stays `pending` (that *is* the waiting queue); it is retried
  automatically when a driver frees up or a new order arrives.
- **One order never goes to two drivers:** every claim is an atomic MongoDB
  update ("only if still available / still pending"), so concurrent requests can't both win.
  This works on a normal standalone MongoDB — no replica set needed.

## Tests

```bash
cd backend
npm test        # needs MongoDB running; uses MONGODB_TEST_URI and WIPES that database
```

## Putting it online (optional)

Use Atlas for the database, and host the `backend` folder on Render / Railway / Fly.io
(start command `npm start`; set env vars `MONGODB_URI`, `JWT_SECRET`, `PORT`).
The frontend is served by the same app, so one deploy is enough.

## Security notes (before real use)

- Demo accounts share passwords — give each user their own.
- Set a long random `JWT_SECRET`; restrict `cors()` in `src/app.js` to your site's origin.
- Never commit `.env`; in Atlas, don't leave network access open to `0.0.0.0/0` for real data.
