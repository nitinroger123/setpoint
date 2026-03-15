# Setpoint

Volleyball tournament management app for players and tournament directors.

## Stack
- **Backend:** Python + FastAPI
- **Frontend:** React + TypeScript (Vite)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel (frontend) + Railway (backend)

---

## Launching the App Locally

### Prerequisites
- Python 3.12+
- Node.js 18+
- A Supabase project (see setup below)

---

### 1. Supabase Setup (first time only)

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/migrations/001_initial_schema.sql`
3. Go to **Settings → Data API** and grab:
   - **Project URL** → `SUPABASE_URL`
   - **Publishable key** (anon JWT) → `SUPABASE_ANON_KEY`
   - **Secret key** (service_role JWT) → `SUPABASE_SERVICE_KEY`

---

### 2. Backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate        # Mac/Linux
# .venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Open .env and fill in:
#   SUPABASE_URL
#   SUPABASE_SERVICE_KEY
#   SUPABASE_ANON_KEY
#   GOOGLE_CREDENTIALS_PATH   (path to your Google OAuth credentials.json)
#   GOOGLE_TOKEN_PATH         (path to your Google OAuth token — see Google Auth below)
#   SHEETS_SPREADSHEET_ID     (your Google Sheet ID)

# Start the API server
uvicorn main:app --reload
# API runs at http://localhost:8000
# Auto-generated docs at http://localhost:8000/docs
```

---

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Open .env.local and fill in:
#   VITE_SUPABASE_URL        (same as SUPABASE_URL)
#   VITE_SUPABASE_ANON_KEY   (same as SUPABASE_ANON_KEY)
#   VITE_API_URL=http://localhost:8000

# Start the dev server
npm run dev
# App runs at http://localhost:5173
```

---

### 4. Google Auth (first time only)

The backend needs a Google OAuth token to access Google Sheets. Run this once to generate it:

```bash
cd backend
source .venv/bin/activate
python3 -c "
from google_auth_oauthlib.flow import InstalledAppFlow
SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
flow = InstalledAppFlow.from_client_secrets_file('/path/to/credentials.json', SCOPES)
creds = flow.run_local_server(port=0)
open('/path/to/setpoint_token.json', 'w').write(creds.to_json())
"
```

A browser window will open — sign in with your Google account and approve access. Update `GOOGLE_TOKEN_PATH` in `.env` to point to the generated token file.

---

### 5. Import Historical Data (first time only)

Once the backend `.env` is configured, run this once to import all sessions from Google Sheets into Supabase:

```bash
cd backend
source .venv/bin/activate
GOOGLE_TOKEN_PATH=/path/to/setpoint_token.json python3 scripts/import_sheets.py
```

---

### Running Both Together

Open two terminal tabs:

| Tab | Command |
|-----|---------|
| Backend | `cd backend && source .venv/bin/activate && uvicorn main:app --reload` |
| Frontend | `cd frontend && npm run dev` |

Then open **http://localhost:5173**
