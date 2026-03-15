# Setpoint

Volleyball tournament management app for players and tournament directors.

## Stack
- **Backend:** Python + FastAPI
- **Frontend:** React + TypeScript (Vite)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel (frontend) + Railway (backend)

## Getting Started

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in .env with your Supabase credentials
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
