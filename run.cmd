@echo off
set PROFILE=%1
if "%PROFILE%"=="" set PROFILE=local
mvn spring-boot:run -Dspring.profiles.active=%PROFILE%
