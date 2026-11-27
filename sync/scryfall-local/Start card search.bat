@echo off
rem Starts the local card search and opens it in your browser.
rem Close this window to stop it.
cd /d "%~dp0"
title Card Search (local Scryfall data)
python scryfall_local.py
if errorlevel 1 pause
