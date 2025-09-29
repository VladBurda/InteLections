!!!Wersja robocza!!!

InteLections
============

InteLections – system zarządzania mikrolekcjami z testami dla uczniów i nauczycieli.  
Projekt jest w trakcie realizacji w ramach pracy dyplomowej na kierunku Informatyka – Programowanie.  
Obecnie zaimplementowana została część interfejsu użytkownika (frontend).

------------------------------------------------------
Funkcjonalności dostępne w obecnej wersji
------------------------------------------------------
- Widoki interfejsu: Home Page, Discover Page, My Products, Profile, Groups & Classes.
- Podstawowa nawigacja pomiędzy stronami.
- Komponenty kursów (Course Cards).
- Prosty układ strony z sidebar i AppShell.

------------------------------------------------------
Technologie
------------------------------------------------------
Frontend: React + TypeScript, Vite, Tailwind CSS  
Menadżer pakietów: npm (Node.js)  

------------------------------------------------------
Wymagania
------------------------------------------------------
- Node.js v18+  
- npm (instalowany razem z Node.js)  

------------------------------------------------------
Instrukcja uruchomienia interfejsu
------------------------------------------------------
1. Otwórz terminal i przejdź do katalogu InteLections projektu:
   cd InteLections

2. Zainstaluj zależności:
   npm install

3. Uruchom aplikację w trybie developerskim:
   npm run dev

4. Po uruchomieniu aplikacja będzie dostępna pod adresem:
   http://localhost:5173

------------------------------------------------------
Struktura projektu (aktualna część frontendowa)
------------------------------------------------------
InteLections/
│── src/                # pliki źródłowe interfejsu
│   ├── pages/          # widoki (Home, Discover, My Products, Profile)
│   ├── components/     # komponenty wielokrotnego użytku (CourseCard, Sidebar itp.)
│   └── layouts/        # układy stron (AppShell)
│
│── public/             # pliki statyczne
│── package.json        # konfiguracja npm
│── vite.config.ts      # konfiguracja Vite
│── README.txt          # niniejszy plik

------------------------------------------------------
Informacje dodatkowe
------------------------------------------------------
Projekt jest rozwijany etapami – obecnie gotowa jest część interfejsu.  
Backend (Flask/Python) będzie implementowany w kolejnych etapach.  

Autor: Vladyslav Burda  
Wyższa Szkoła Informatyki i Zarządzania w Rzeszowie (WSIiZ)
