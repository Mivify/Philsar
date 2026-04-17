@echo off
echo Setting up your Git Repository...
git init

echo.
echo Adding files...
git add .

echo.
echo Committing codebase...
git commit -m "Initial commit of the PHILSAR AI Information System"

echo.
echo Connecting to GitHub repository...
git branch -M main
git remote add origin https://github.com/Mivify/Philsar.git

echo.
echo Pushing code to GitHub! 
echo (Note: A browser window or popup may appear asking you to log into GitHub to authorize this push)
git push -u origin main

echo.
echo Code upload complete!
pause
