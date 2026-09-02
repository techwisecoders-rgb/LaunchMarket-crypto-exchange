@echo off
curl.exe -s --max-time 15 -X POST "http://localhost:3001/api/v1/auth/register" -H "Content-Type: application/json" --data-raw "{\"email\":\"test1@example.com\",\"password\":\"Test1234!aaa\"}" -o "C:\Users\perum\OneDrive\Desktop\sidra\register-resp.txt" -w "HTTP_CODE_%{http_code}\n"
type "C:\Users\perum\OneDrive\Desktop\sidra\register-resp.txt"

