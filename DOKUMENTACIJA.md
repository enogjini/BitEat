# SISTEMA POS - DOKUMENTACIJA DETAJUAR

## 📋 PËRMBLEDHJE E PROJEKTIT

Ky projekt është një sistem menaxhimi të restorantit i ndërtuar me **React** (frontend) dhe **Express.js + PostgreSQL** (backend). Sistemi lejon kamarierot të krijojnë porosi, menaxherit të shikojnë statistika, dhe administratorëve të kontrollin e plotë të sistemit.

---

## 🏗️ ARKITEKTURA E PROJEKTIT

### Frontend (React)
- **Lokacioni**: `c:\Users\Eno\Desktop\db\f\src`
- **Framework**: React 18+ me Tailwind CSS
- **Struktura Komponentesh**: 5 komponente modulare

### Backend (Node.js + Express)
- **Lokacioni**: `c:\Users\Eno\Desktop\db\test.js`
- **Database**: PostgreSQL 
- **Port**: 5000

### Database (PostgreSQL)
- **Emri**: `restaurant`
- **Tabela Kryesore**: porosite, articleujt_porosise, pagesat, pije_inventar, tavolinat, punonjesit

---

## 👥 RRASTET E PËRDORIMIT

Sistemi mbështet **3 lloje përdoruesish**:

### 1️⃣ **KAMARIER** (Garçon)
**Rol**: Krijim i porosive dhe përmbledhje pagese

**Aksionet**:
- Login me punonjes_id dhe password
- Shikoni tavolinat e caktuara
- Krijoni porosi të reja (POS Page)
- Mbyllni tavolinat dhe regjistroni pagesat
- Menaxhoni rezervimet

**Interface**: 
- Login Page → Header → POSPage → DashboardPage (Tavolinat e Mia)

---

### 2️⃣ **MENAXHER** (Manager)
**Rol**: Shikoni statistika dhe menaxhoni inventarin

**Aksionet**:
- Login me emri dhe password
- Shikoni xhiro ditore
- Shikoni produktet më të shitura
- Menaxhoni inventarin e pijeve
- Shikoni historikun e porosive
- Shikoni statistika detajuar

**Interface**: 
- Login Page → Header → DashboardPage (5 tabs: xhiro, produktet, inventar, porosite, statistika)

---

### 3️⃣ **ADMIN** (Administrator)
**Rol**: Kontrolli i plotë i sistemit

**Aksionet**:
- Akses të plotë në të gjitha funksionalitetet
- Mund të shikojë të gjithë porosite
- Mund të menaxhojë inventarin
- Mund të shikojë statistikat kompleksë

**Interface**: Same as Manager + Full System Control

---

## 📱 KOMPONENTE FRONTEND

### 1. **LoginPage.js** (~110 linja)
```
FUNKSIONALITETI:
├─ Zgjidhni llojin e përdoruesit (Admin / Menaxher / Kamarier)
├─ Nëse Admin/Menaxher: emri + password
├─ Nëse Kamarier: punonjes_id + password
├─ POST to /api/login
└─ Ruaj perdoruesi në state
```

---

### 2. **Header.js** (~50 linja)
```
FUNKSIONALITETI:
├─ Shfaq emrin dhe llojin e përdoruesit
├─ Navigation buttons (POS / Dashboard / Rezervime)
├─ Role-based visibility
│  ├─ Kamarier: POS, Dashboard, Rezervime
│  ├─ Menaxher/Admin: Dashboard, Rezervime
├─ Logout button
└─ Highlight current page
```

---

### 3. **POSPage.js** (~140 linja)
```
FUNKSIONALITETI:
├─ Shfaq kategorite e produkteve
├─ Shfaq artikujt sipas kategorisë
├─ Shitje në shporte (cart):
│  ├─ Shto artikull
│  ├─ Rrit/zvogëlo sasi
│  ├─ Hiq artikull
├─ Zgjidhni tavolinën
├─ POST /api/porosite
│  ├─ tavoline_id
│  ├─ punonjes_id
│  └─ artikujt (array me artikull_id, sasia)
└─ Success: rifresko, zgjidhja, rivendosje shporte
```

---

### 4. **DashboardPage.js** (~700 linja)
```
FUNKSIONALITETI:

A. PER KAMARIER (Tavolinat e Mia):
├─ Shfaq tavolinat me porosi të hapura
├─ Shfaq numrin e porosive të hapura 
├─ Kliko "Shiko Detaje" → Modal me artikujt
├─ Kliko "Mbyll" → handleCloseOrder()
│  ├─ Filtra porosite: tavoline_id + E Hapur
│  ├─ Llogarit total nga të gjitha porosite
│  ├─ Hap payment modal me shuma e llogaritur
│  └─ Nuk lejon ndryshim të shumës
└─ handleSavePayment()
   ├─ POST /api/pagesat (regjistro pagesa)
   ├─ PATCH /api/porosite/:id/statusi (mbyll porosi)
   ├─ GET /api/porosite (rifresko listën)
   └─ Shfaq success message

B. PER MENAXHER/ADMIN (5 Tabs):

TAB 1: XHIRO
├─ Shfaq xhiro ditore totale
├─ Numri i porosive
└─ Totali i produkteve të shitura

TAB 2: PRODUKTET
├─ Top produktet më të shitura SOT
├─ Top produktet më të shitura GJITHË KOHËS
├─ Tabela me: emri, shitur, xhiro totale
└─ Filtro sipas periudhës

TAB 3: INVENTARI
├─ Status stoku: PA STOK / KRITIK / I ULËT / NORMAL
├─ Shfaq secilin produkt:
│  ├─ Emri pijes
│  ├─ Stoku aktual
│  ├─ Stoku minimal
│  ├─ Çmimi për njësi
│  └─ Vlera totale stoku
├─ Knapp "Shto" për të zmadhuar stokun
└─ Prompt për sasinë

TAB 4: POROSITE
├─ Historiku i të gjitha porosive
├─ Kliko "Shiko Detaje" për artikujt
├─ Modal me: Porosi #ID, Tavolina, Artikujt, Total
└─ Filtro sipas statusit

TAB 5: STATISTIKA
├─ A) Top 10 ditët më fitimprurëse
│  ├─ Data
│  ├─ Dita e javës
│  ├─ Xhiro totale
│  └─ Numri porosive
├─ B) Fluksi porosive sipas orëve
│  ├─ Orë
│  ├─ Numri porosive
│  └─ Status aktiviteti (RUSH / QETË)
├─ C) Top kamarierë
│  ├─ Emri
│  ├─ Xhiro totale
│  ├─ Numri porosive
│  └─ Performance rating
├─ D) Money Peak Moments
│  ├─ Data & Ora
│  ├─ Periudha ditore
│  ├─ Xhiro
│  └─ Top produkti
├─ E) Trendet (30 ditë)
│  ├─ Data
│  ├─ Xhiro ditore
│  ├─ Trend ↑↓
│  └─ % Ndryshim
└─ F) Performance Detajuar
   ├─ Kamarier
   ├─ Ditë pune
   ├─ Totali porosive
   ├─ Xhiro 7 ditë
   └─ Xhiro 30 ditë
```

---

### 5. **RezervimePage.js** (~170 linja)
```
FUNKSIONALITETI:
├─ GET /api/rezervimet (shfaq listën)
├─ Kliko "KRIJO" për form të ri
├─ Forma:
│  ├─ Emri i klientit
│  ├─ Numri personave
│  ├─ Data (min sot)
│  ├─ Ora
│  ├─ Tavolina (opsionale)
│  ├─ Numri telefoni
│  └─ Shënim
├─ POST /api/rezervimet
├─ Lista me statusin:
│  ├─ E konfirmuar (green)
│  ├─ E pritshme (yellow)
│  └─ E anuluar (red)
└─ Buton "Anulo" për rezervimet e konfirmuara
```

---

## 🔄 FLUKSI I PAGESES (PAYMENT FLOW)

### 📊 **Sekuenca e Detaljuar**:

```
1. KAMARIER KLIKON "MBYLL" (Tabela e Tij)
   │
   ├─ handleCloseOrder(tavolineId) PRANON
   │  ├─ Filtra porosite: INT(tavoline_id) === INT(tavolineId) && 'E Hapur'
   │  ├─ NËSE zero porosi → alert "Nuk ka porosi!"
   │  ├─ FOR EACH porosi:
   │  │  └─ GET /api/porosite/:id → shfaq artikujt
   │  │     └─ Llogarit: SUM(artikuj.totali)
   │  ├─ Gjithë totalet → shuma final
   │  └─ setShowPaymentForm({ tavolineId, porosite: [id1, id2, ...] })
   │
   ├─ PAYMENT MODAL HAPE
   │  ├─ "Shuma": [DISABLED] = pre-filled total
   │  ├─ "Metoda Pagese": Cash / Kartë / Transferim
   │  ├─ Shfaq: "Totali për pagese: XXL"
   │  └─ Buton: KONFIRMO / ANULO
   │
   ├─ KAMARIER KLIKON "KONFIRMO"
   │  │
   │  ├── HAPI 1: POST /api/pagesat
   │  │   ├─ porosi_id: porosite[0]
   │  │   ├─ shuma: XXX.XX
   │  │   ├─ metoda_pageses: "Cash"
   │  │   ├─ ora_pageses: NOW()
   │  │   └─ ✅ TABELA PAGESAT REGJISTROHET
   │  │      (INSERT into pagesat)
   │  │
   │  ├── HAPI 2: FOR EACH porosiId in porosite
   │  │   │
   │  │   ├─ PATCH /api/porosite/:id/statusi
   │  │   │  ├─ statusi_porosise: 'E Mbyllur'
   │  │   │  └─ ✅ TABELA POROSITE PËRDITËSOHET
   │  │   │     (UPDATE porosite SET statusi = 'E Mbyllur')
   │  │   │
   │  │   └─ Repeat për të gjitha porosite
   │  │
   │  ├── HAPI 3: GET /api/porosite (Rifresko)
   │  │   └─ Shfaq listën e përditësuar
   │  │
   │  └── HAPI 4: Cleanup UI
   │      ├─ setShowPaymentForm(null)
   │      ├─ setPaymentData({ shuma: '', metoda: 'Cash' })
   │      ├─ setDetajet(null)
   │      └─ alert("✅ SUKSES!...")
   │
   └─ FIN: Tabela mbyllet, porosite mbusin
   
✅ TË DYJA TABELAT PËRDITËSOHEN:
   ├─ pagesat → Pagesa regjistrohet
   └─ porosite → Statusi = E Mbyllur
```

---

## 🗄️ STRUKTURA E DATABASE

### TABELA: `porosite`
```sql
porosi_id (PK)
tavoline_id (FK)
punonjes_id (FK)
statusi_porosise ('E Hapur', 'E Mbyllur', 'Anuluar')
ora_porosise (TIMESTAMP)
```

### TABELA: `articleujt_porosise`
```sql
artikull_porosie_id (PK)
porosi_id (FK) → porosite
artikull_id (FK) → artikujt_menu
sasia (INTEGER)
```

### TABELA: `pagesat`
```sql
pagese_id (PK)
porosi_id (FK) → porosite
shuma (DECIMAL)
metoda_pageses ('Cash', 'Kartë', 'Transferim')
ora_pageses (TIMESTAMP)
```

### TABELA: `artikujt_menu`
```sql
artikull_id (PK)
emri (VARCHAR)
cmimi (DECIMAL)
kategori_id (FK)
```

### TABELA: `pije_inventar`
```sql
inventar_id (PK)
emri_pijes (VARCHAR)
stoku_aktual (INTEGER)
stoku_minimal (INTEGER)
njesia (VARCHAR)
cmimi_per_njesi (DECIMAL)
vlera_totale_stoku (DECIMAL)
statusi_stokut ('NORMAL', 'ULËT', 'KRITIK', 'PA STOK')
```

### TABELA: `tavolinat`
```sql
tavoline_id (PK)
numri_tavolines (VARCHAR)
kapaciteti (INTEGER)
vendndodhja (VARCHAR) - Lokacioni
gjendja (VARCHAR) - Lire/E zene
```

**RRADHITJE TAVOLINASH**: `ORDER BY CAST(numri_tavolines AS INTEGER)`
- Tavolinat rradhiten sipas numrit: 1, 2, 3...

---

## 🔌 API ENDPOINTS

### AUTENTIFIKIMI
```
POST /api/login
├─ Body: { emri_perdoruesit, password, lloji, punonjes_id }
└─ Response: { success, user }
```

### POROSITE
```
GET /api/porosite
├─ Query: ?punonjes_id=X&statusi=E%20Hapur (opsionale)
└─ Response: Array[porosi]

GET /api/porosite/:id
├─ Response: { porosi, artikujt }
└─ Shfaq detajet e porosisë

POST /api/porosite
├─ Body: { tavoline_id, punonjes_id, artikujt }
├─ artikujt: [{ artikull_id, sasia }, ...]
└─ Response: { success, porosi_id }

PATCH /api/porosite/:id/statusi
├─ Body: { statusi_porosise }
└─ Response: { success }
```

### PAGESAT
```
POST /api/pagesat ⭐ KRYESOR
├─ Body: { porosi_id, shuma, metoda_pageses, ora_pageses }
└─ Response: { success, pagese_id }

GET /api/pagesat
├─ Response: Array[pagesa] LIMIT 100
└─ Historiku i pagesave

GET /api/pagesat/:id
├─ Response: pagesa
└─ Detajet e pageses
```

### INVENTARI
```
GET /api/inventar
└─ Response: Array[pije_inventar]

PATCH /api/inventar/pije/:id
├─ Body: { sasia }
└─ Zmadhon stokun
```

### STATISTIKAT
```
GET /api/statistika/xhiro-ditore
GET /api/statistika/produktet-me-te-shitura
GET /api/statistika/dita-me-fitim
GET /api/statistika/fluksi-porosive-ora
GET /api/statistika/kamarieri-me-i-mire
GET /api/statistika/money-peak
GET /api/statistika/xhiro-trendet
GET /api/statistika/performance-kamarieret
```

### TAVOLINAT
```
GET /api/tavolinat
└─ Të gjitha tavolinat

GET /api/tavolinat/status
├─ Response: Array[tavolina] me statusi
├─ ORDER BY CAST(numri_tavolines AS INTEGER)
└─ Rradhitje sipas numrit: 1, 2, 3...
```

### REZERVIMET
```
GET /api/rezervimet
└─ Të gjitha rezervimet

POST /api/rezervimet
├─ Body: { emri_klientit, numri_personave, data_rezervimit, ora_rezervimit, ... }
└─ Response: { success }

PATCH /api/rezervimet/:id/statusi
├─ Body: { statusi }
└─ Ndrysho statusin
```

---

## 💾 FLUKSI I TË DHËNAVE

### Kur Krijohet Porosi:
```
1. User (Kamarier) klikon "RUAJ" në POSPage
2. Frontend: POST /api/porosite
3. Backend: 
   ├─ BEGIN TRANSACTION
   ├─ INSERT INTO porosite (tavoline_id, punonjes_id, statusi='E Hapur')
   ├─ INSERT INTO artikujt_porosise (porosi_id, artikull_id, sasia) x N
   └─ COMMIT
4. Database: Porosi + artikujt shtehen
5. Frontend: Success alert, rifresko shporte
```

### Kur Mbyllet Tabela (Pagesa):
```
1. User (Kamarier) klikon "KONFIRMO" në payment modal
2. Frontend: 
   ├─ POST /api/pagesat → lagra pagesa
   ├─ PATCH /api/porosite/:id/statusi → ndrysho në "E Mbyllur" (x N)
   └─ GET /api/porosite → rifresko listën
3. Database:
   ├─ INSERT INTO pagesat (...) [porosite → pagesat]
   └─ UPDATE porosite SET statusi='E Mbyllur' (x N)
4. Frontend: Success message
```

---

## 🎨 TEKNOLOGJI PËRDORUR

### Frontend
- **React 18** - UI Framework
- **Tailwind CSS** - Styling
- **lucide-react** - Icons
- **Fetch API** - HTTP requests

### Backend
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **node-pg** - Database driver
- **CORS** - Cross-origin support

### Authentication
- **Simple JWT-like approach** - emri + password, lloji per filtrim

---

## 🔐 SIGURNIA

⚠️ **SHIM**: Sistemi aktual NUK ka enkriptim të passwordit. Rekomandohet:
- Hashim i passwordit (bcrypt)
- JWT tokens për sessions
- HTTPS në production

---

## 📈 PERFORMANCE

### Optimizime të Zbatuara:
- ✅ Rradhitje të tabelave sipas numrit (INT cast)
- ✅ LEFT JOIN për të shfaqur tabela të lira
- ✅ LIMIT 100 në pagesat
- ✅ Query caching nëpërmjet state management

### Zbutjet e Mundshme:
- Indeksat në foreign keys
- Pagination për lista të mëdha
- Caching të statistikave

---

## 🚀 STARTUP

### Backend
```bash
cd c:\Users\Eno\Desktop\db
node test.js
# Server running on http://localhost:5000
```

### Frontend
```bash
cd c:\Users\Eno\Desktop\db\f
npm start
# App running on http://localhost:3000
```

### Database
```bash
psql -U postgres -d restaurant
# Siguro që tabelat janë të krijuara
```

---

## ✅ FILLUSAT E TESTIMIT

### 1. Test Login
- [ ] Login si Kamarier
- [ ] Login si Menaxher
- [ ] Login si Admin

### 2. Test Porosi
- [ ] Krijo porosi
- [ ] Shto artikuj
- [ ] Shike detaje

### 3. Test Pagesa (KRYESOR)
- [ ] Kliko "Mbyll"
- [ ] Kontrollo: Modal hape me total të duhur
- [ ] Kliko "KONFIRMO"
- [ ] Shiko në DB:
  - `SELECT * FROM pagesat` - Pagesa duhet të shfaqet
  - `SELECT * FROM porosite WHERE porosi_id=X` - Statusi='E Mbyllur'

### 4. Test Statistika
- [ ] Kliko TAB "xhiro"
- [ ] Shfaq xhiro ditore
- [ ] Kliko TAB "statistika"
- [ ] Shfaq grafikë

---

## 🐛 DEBUGGING

### Console Logs
```javascript
// handleSavePayment ka logs:
console.log('📝 Regjistro pagesa...')
console.log('✅ Pagesa u ruajt:', pagese_id)
console.log('📝 Përditëso statusin e porosive...')
console.log('✅ Porosi X u mbyll')
console.log('🔄 Rifresko listen e porosive...')
```

### Network Tab (Browser)
- [ ] Shiko POST /api/pagesat response
- [ ] Shiko PATCH /api/porosite/:id/statusi response
- [ ] Shiko GET /api/porosite response

### Database
```sql
-- Shiko pagesat
SELECT * FROM pagesat ORDER BY ora_pageses DESC LIMIT 10;

-- Shiko porosite e mbyllura
SELECT * FROM porosite WHERE statusi_porosise = 'E Mbyllur' LIMIT 10;

-- Shiko lidhjen
SELECT p.*, pg.shuma FROM porosite p 
LEFT JOIN pagesat pg ON p.porosi_id = pg.porosi_id 
WHERE p.porosi_id = 123;
```

---

## 📞 KONTAKTI / SUPORT

Nëse ka probleme:
1. Shiko console logs (DevTools → Console)
2. Shiko Network tab (DevTools → Network)
3. Kontrollo database (pgAdmin / Command Line)
4. Shiko server logs (Backend terminal)

---

**Dokumentim përfundoi më: 25 Shkurt 2026**
**Versioni: 1.0**
