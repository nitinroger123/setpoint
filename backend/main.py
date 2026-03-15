from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import players, sessions, games, series

app = FastAPI(title="Setpoint API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://setpoint-alpha.vercel.app", "https://setpoint-production-e951.up.railway.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(players.router, prefix="/api/players", tags=["players"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(games.router, prefix="/api/games", tags=["games"])
app.include_router(series.router, prefix="/api/series", tags=["series"])

@app.get("/")
def root():
    return {"status": "ok", "app": "Setpoint API"}
