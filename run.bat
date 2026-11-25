@echo off
setlocal EnableExtensions

cd /d "%~dp0backend" || (
    echo [ERROR] Could not find the backend directory.
    pause
    exit /b 1
)

where python >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PY_CMD=python"
) else (
    where py >nul 2>nul
    if %ERRORLEVEL%==0 (
        set "PY_CMD=py -3"
    ) else (
        echo [ERROR] Python 3.11+ is required but was not found on PATH.
        echo Install Python from https://www.python.org/downloads/ and try again.
        pause
        exit /b 1
    )
)

if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment...
    %PY_CMD% -m venv .venv || (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

set "VENV_PY=.venv\Scripts\python.exe"

"%VENV_PY%" -c "import fastapi, uvicorn, sqlalchemy, alembic, reportlab, bcrypt, jwt" >nul 2>nul
if not %ERRORLEVEL%==0 (
    echo Installing Python dependencies ^(first run only^)...
    "%VENV_PY%" -m pip install --upgrade pip
    "%VENV_PY%" -m pip install -r requirements.txt || (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

set "DATABASE_URL=sqlite:///./dev.db"
set "UPLOAD_DIR=./uploads"
set "COOKIE_SECURE=false"
set "CORS_ORIGINS=http://localhost:8000,http://127.0.0.1:8000"

echo Running database migrations...
"%VENV_PY%" -m alembic upgrade head || (
    echo [ERROR] Database migration failed.
    pause
    exit /b 1
)

echo Seeding demo data ^(skips if already seeded^)...
"%VENV_PY%" -m app.seed || (
    echo [ERROR] Seeding failed.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   College ERP is starting at http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo   Demo Admin:   ADMIN01 / Admin@2026
echo   Demo Faculty: FACCS01 / Fac@9499
echo   Demo Student: 1SI24CS026 / Kav@8239
echo   Press Ctrl+C to stop the server.
echo ============================================================
echo.

start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"
"%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

pause
