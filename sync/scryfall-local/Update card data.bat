@echo off
rem Refreshes the card data from Scryfall (only files that changed), then
rem downloads images for any new cards. Restart the card search afterward.
cd /d "%~dp0"
title Updating card data from Scryfall
python update_scryfall.py
python download_images.py
echo.
echo Done. If the card search is open, close its window and start it again.
pause
