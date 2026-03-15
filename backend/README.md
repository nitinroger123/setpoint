# Setpoint Backend

FastAPI backend for the Setpoint volleyball tournament management app.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

## API Endpoints

- `GET /api/players` - List all players
- `POST /api/players` - Create a player
- `GET /api/players/{id}` - Get player details
- `GET /api/players/{id}/history` - Get player game history
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create a session
- `GET /api/sessions/{id}` - Get session with results
- `POST /api/games` - Record game results

## Import Historical Data

```bash
python scripts/import_sheets.py
```
