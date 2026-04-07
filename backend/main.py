from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import players, sessions, games, series, director, auth, me

app = FastAPI(title="Setpoint API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://setpoint-alpha.vercel.app", "https://setpoint-production-a3f5.up.railway.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(players.router, prefix="/api/players", tags=["players"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(games.router, prefix="/api/games", tags=["games"])
app.include_router(series.router, prefix="/api/series", tags=["series"])
app.include_router(director.router, prefix="/api/director", tags=["director"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(me.router, prefix="/api/me", tags=["me"])

@app.get("/")
def root():
    return {"status": "ok", "app": "Setpoint API"}
