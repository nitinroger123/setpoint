# Setpoint Java Backend

Spring Boot + jOOQ + PostgreSQL (Supabase)

## Setup

### 1. Copy env file
```
cp .env.example .env
```
Fill in values from Supabase dashboard. The DB URL is under:
**Settings > Database > Connection string > URI** — prefix it with `jdbc:` so it becomes:
`jdbc:postgresql://db.xxxx.supabase.co:5432/postgres`

### 2. Generate jOOQ classes from your schema
```
mvn jooq-codegen:generate
```
This reads your live Supabase schema and generates type-safe Java classes into `src/generated/java/`. Re-run whenever you change the DB schema.

### 3. Run
```
mvn spring-boot:run
```
Server starts on port 8080.

## Project structure

```
src/main/java/com/setpoint/
├── SetpointApplication.java     # entry point
├── auth/
│   └── DirectorAuthInterceptor.java  # X-Director-Pin header check
├── config/
│   └── WebConfig.java           # CORS + interceptor registration
├── controllers/
│   └── SessionController.java   # example — add more here
└── dto/
    └── SessionDto.java          # API response shapes (add more here)

src/generated/java/com/setpoint/generated/
└── tables/                      # auto-generated — do not edit
```
