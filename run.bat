@echo off
echo =======================================================
echo          STARTING PHILSAR INFORMATION SYSTEM
echo =======================================================
echo.
echo Make sure your XAMPP/MySQL database is running!
echo.

echo Starting the Backend Server in a new window...
cd "%~dp0backend"
start "PHILSAR Backend" cmd /k "npx nodemon server.js"

echo Starting the Frontend Server in a new window...
cd "%~dp0frontend"
start "PHILSAR Frontend" cmd /k "npm run dev"

echo.
echo Both servers have been launched! 
echo You can now go to http://localhost:5173 in your browser.
echo You may close this current terminal window.
pause
