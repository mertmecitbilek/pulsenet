# PulseNet 🚀

> **Açık kaynaklı, Zabbix esinli sistem ve ağ izleme platformu.**
> FastAPI + Next.js + PostgreSQL + Docker mimarisiyle sıfırdan inşa edildi.

Tek bir arayüzden üç farklı şeyi izler:

1. **Ev/ofis ağındaki cihazlar** — modem, yazıcı, NAS, telefon ayakta mı? (ping / TCP port)
2. **Web siteleri ve servisler** — siten cevap veriyor mu, kaç ms'de? (HTTP + ping)
3. **Sunucu donanımı** — CPU, RAM, disk, ağ trafiği; kendi belirlediğin eşik aşılınca alarm (agent)

Bir sorun çıktığında arayüzde anında bildirim alırsın, sorun düzelince de "geri geldi" bildirimi gelir.

---

## ✨ Özellikler

| Özellik | Detay |
|---|---|
| **Servis Kontrolleri** | Agent gerektirmeyen ping, HTTP ve TCP port kontrolleri. Yanıt süresi ve 24 saatlik uptime takibi |
| **Canlı Metrikler** | WebSocket ile anlık CPU, RAM, Disk, Uptime ve ağ trafiği |
| **Geçmiş Grafikler** | 1s / 6s / 24s / 7g zaman aralıkları; uzun aralıklar sunucuda ortalanır |
| **Alarm Motoru** | Host bazlı CPU/RAM/Disk eşikleri, host offline alarmı, servis kontrolü alarmı |
| **Bildirimler** | Anlık ekran uyarısı, zil menüsü ve okunmamış sayacı, isteğe bağlı masaüstü bildirimi |
| **Acknowledge** | Alarmı üstlenme, not bırakma, kim ne zaman üstlendi kaydı |
| **Cihaz Şablonları** | Ev cihazı / Web sitesi / Sunucu şablonlarıyla tek adımda ekleme |
| **Tek Kullanıcılı** | İlk hesap açıldıktan sonra kayıt otomatik kapanır — kendi kurulumunuz size ait kalır |
| **Docker-First** | Tek komutla (`docker compose up --build`) tam ortam |

---

## 🏗️ Mimari

```
┌──────────────────────────────────────────────────────────────┐
│                       Docker Network                         │
│                                                              │
│  ┌──────────┐   REST + WS    ┌──────────────────────────┐    │
│  │ Frontend │ ─────────────► │        Backend           │    │
│  │ Next.js  │                │   FastAPI + Uvicorn      │    │
│  │  :3000   │ ◄───bildirim── │         :8000            │    │
│  └──────────┘                │                          │    │
│                              │  ┌────────────────────┐  │    │
│  ┌──────────┐  POST /metrics │  │ Arka plan görevler │  │    │
│  │  Agent   │ ─────────────► │  │ • host watcher     │  │    │
│  │  psutil  │   X-Agent-Key  │  │ • check scheduler  │  │    │
│  └──────────┘                │  │ • data pruner      │  │    │
│                              │  └────────────────────┘  │    │
│                              └───────────┬──────────────┘    │
│                                          │ SQLAlchemy        │
│   ping / HTTP / TCP                      ▼                   │
│   ◄─────────────────────────────  ┌──────────────┐           │
│   (modem, yazıcı, web sitesi)     │  PostgreSQL  │           │
│                                   │    :5432     │           │
│                                   └──────────────┘           │
└──────────────────────────────────────────────────────────────┘
```

Servis kontrollerini **backend'in kendisi** çalıştırır; izlenen cihaza hiçbir şey kurulmaz.
Donanım metrikleri için ilgili sunucuya **agent** kurulur.

---

## 🚀 Hızlı Başlangıç

### Gereksinimler
- Docker ≥ 24, Docker Compose v2

### 1. Ortam değişkenlerini hazırla

```bash
cp .env.example .env
openssl rand -base64 36   # SECRET_KEY için üret, .env'e yaz
openssl rand -base64 24   # AGENT_API_KEY için üret, .env'e yaz
```

> `.env` gerçek sırları tutar ve `.gitignore` ile dışarıda bırakılmıştır — asla commit etmeyin.

### 2. Başlat

```bash
docker compose up --build
```

İlk build ~3-5 dakika sürer. Sonraki başlatmalar cache sayesinde çok daha hızlıdır.

### 3. Eriş

| Servis | URL |
|---|---|
| **Dashboard** | http://localhost:3000 |
| **API Docs** (Swagger) | http://localhost:8000/docs |
| **Health** | http://localhost:8000/health |

### 4. İlk hesap — kurulum tek kullanıcılıdır

`http://localhost:3000/register` adresinden kayıt olun.

- İlk kayıt olan kullanıcı **sahip (admin)** olur.
- Bu hesap açıldığı anda **kayıt otomatik olarak kapanır**. Uygulamaya erişebilen başka biri
  kendine hesap açamaz; kayıt sayfası "Registration closed" der ve API `403` döner.
- Yani kurulum tamamen size aittir. Ek hesap istemiyorsanız yapmanız gereken başka bir şey yok.

**Birden fazla kullanıcı istiyorsanız:** `.env` içinde `ALLOW_MULTIPLE_USERS=true` yapın.
Bu durumda sonradan kayıt olanlar **viewer** (salt okunur) olur: her şeyi görebilir ama
cihaz/kontrol ekleyemez, silemez, eşik değiştiremez.

**Parolanızı unutursanız:** kayıt kapalı olduğu için yeni hesap açamazsınız. Sahip hesabını silip
yeniden kaydolun:

```bash
docker compose exec db psql -U pulsenet -d pulsenet -c "DELETE FROM users;"
```

> Bu yalnızca kullanıcıyı siler; cihazlar, metrikler ve alarmlar korunur.

---

## 📡 Kullanım

### Senaryo 1 — Evdeki cihazlar (modem, yazıcı, NAS)

`Devices → Add Device → Home device`

| Alan | Örnek |
|---|---|
| Name | Modem |
| IP address | Cihazın yerel IP'si |

Ping kontrolü otomatik oluşur (60 sn aralık, 5 hatada alarm). Yazıcı/telefon gibi uyku moduna geçen
cihazlar için bu tolerans bilinçli olarak yüksek tutulmuştur.

**İpuçları**
- Modemden her cihaza **sabit IP (DHCP rezervasyonu)** verin; IP değişirse kontrol başka cihaza bakar.
- Yazıcılarda ping yerine TCP **9100** (raw print) veya **631** (IPP) portu genelde daha güvenilir sonuç verir.
- Cihaz sayfasındaki **Add check** ile aynı cihaza ek kontroller (TCP port, HTTP) ekleyebilirsiniz.

### Senaryo 2 — Web sitesi

`Devices → Add Device → Website`

| Alan | Örnek |
|---|---|
| Name | Kişisel sitem |
| URL | `https://example.com` |

HTTP + ping kontrolleri birlikte oluşur. HTTP kontrolünde varsayılan olarak 2xx/3xx başarılı sayılır;
istenirse tam bir durum kodu (ör. `200`) beklenebilir.

### Senaryo 3 — Sunucu donanımı ve kendi eşiğin

1. `Devices → Add Device → Server` ile sunucuyu ekleyin (ping + port kontrolü oluşur).
2. Sunucuya **agent**'ı kurun (aşağıya bakın) — CPU/RAM/Disk/ağ metrikleri akmaya başlar.
3. Cihaz sayfasında **Settings** ile CPU, RAM ve Disk eşiklerini kendinize göre ayarlayın.
4. Eşik aşıldığında alarm açılır ve arayüzde bildirim gelir. Değer normale dönünce alarm kendiliğinden kapanır.

> Eşiği 10 puandan fazla aşan değerler `critical`, diğerleri `warning` olarak işaretlenir.

---

## 🤖 Agent Kurulumu (uzak sunucu)

Agent yalnızca donanım metrikleri için gereklidir. Ayakta olup olmadığını görmek için agent'a gerek yoktur.

### Seçenek A — Doğrudan (gerçek host metrikleri için önerilir)

```bash
cd pulsenet/agent
pip install -r requirements.txt

AGENT_BACKEND_URL=http://<pulsenet-sunucusu>:8000 \
AGENT_API_KEY=<.env dosyanızdaki değer> \
python -m agent.main
```

Kalıcı çalışması için systemd servisi:

```ini
# /etc/systemd/system/pulsenet-agent.service
[Unit]
Description=PulseNet Agent
After=network.target

[Service]
WorkingDirectory=/opt/pulsenet/agent
Environment=AGENT_BACKEND_URL=http://<pulsenet-sunucusu>:8000
Environment=AGENT_API_KEY=<anahtar>
ExecStart=/usr/bin/python3 -m agent.main
Restart=always

[Install]
WantedBy=multi-user.target
```

### Seçenek B — Docker

```bash
cd pulsenet/agent
docker build -t pulsenet-agent .
docker run -d --restart unless-stopped --name pulsenet-agent \
  -e AGENT_BACKEND_URL=http://<pulsenet-sunucusu>:8000 \
  -e AGENT_API_KEY=<anahtar> \
  --hostname "$(hostname)" \
  pulsenet-agent
```

> **Dikkat:** Container içindeki psutil, host'un değil **container'ın** metriklerini okur.
> Linux'ta gerçek host değerleri için `--pid host -v /proc:/host/proc:ro` gerekir; en temizi Seçenek A'dır.

Agent ilk çalıştığında kendini `hostname` ile kaydeder. Aynı isimle tekrar başlarsa yeni kayıt açmaz,
mevcut kaydın IP'sini günceller. Belirli bir host kaydına bağlamak için `AGENT_HOST_ID` verilebilir.

---

## ⚙️ Konfigürasyon

`.env` dosyasındaki değişkenler:

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `SECRET_KEY` | _(zorunlu)_ | JWT imza anahtarı. Production'da varsayılansa uygulama başlamaz |
| `AGENT_API_KEY` | _(zorunlu)_ | Agent → backend `X-Agent-Key` sırrı |
| `ENVIRONMENT` | `development` | `development` \| `production` |
| `CORS_ORIGINS` | `http://localhost:3000` | Virgülle ayrılmış izinli tarayıcı origin'leri |
| `ALLOW_MULTIPLE_USERS` | `false` | `false` = ilk hesaptan sonra kayıt kapalı (tek kullanıcılı). `true` = ek viewer hesaplarına izin verir |
| `ALERT_CPU_THRESHOLD` | `90` | **Yeni** host'lar için varsayılan CPU eşiği (%) |
| `ALERT_MEMORY_THRESHOLD` | `85` | Yeni host'lar için varsayılan RAM eşiği (%) |
| `ALERT_DISK_THRESHOLD` | `80` | Yeni host'lar için varsayılan Disk eşiği (%) |
| `AGENT_COLLECT_INTERVAL` | `10` | Agent metrik toplama aralığı (sn) |
| `AGENT_HOST_ID` | _(boş)_ | Boş bırakılırsa agent kendini kaydeder |
| `DATA_RETENTION_DAYS` | `14` | Bu süreden eski metrik/sonuç/kapanmış alarm silinir (`0` = kapalı) |

Eşikler host bazlıdır: `ALERT_*` değerleri yalnızca yeni eklenen host'un başlangıç değerini belirler,
sonrasında her cihaz için arayüzden ayrı ayrı değiştirilir.

---

## 🔌 API Referansı

### Auth
```
POST   /api/auth/register       → Kayıt (ilk kullanıcı admin olur)
POST   /api/auth/login          → JWT al
GET    /api/auth/me             → Mevcut kullanıcı
```

### Hosts
```
GET    /api/hosts/              → Tüm cihazlar                     [JWT]
POST   /api/hosts/              → Cihaz ekle              [admin veya agent]
GET    /api/hosts/{id}          → Cihaz detayı                     [JWT]
PATCH  /api/hosts/{id}          → Güncelle (eşikler dahil)       [admin]
DELETE /api/hosts/{id}          → Sil (metrik/alarm/kontrol CASCADE) [admin]
```

### Metrics
```
POST   /api/metrics/            → Metrik kaydet             [X-Agent-Key]
GET    /api/metrics/summary     → Her host'un son metriği           [JWT]
GET    /api/metrics/{id}?since_hours=6  → Geçmiş (>1s ortalanır)   [JWT]
GET    /api/metrics/{id}/latest → Son metrik                        [JWT]
```

### Service Checks
```
GET    /api/checks/?host_id=    → Kontroller (durum, yanıt, uptime) [JWT]
POST   /api/checks/             → Kontrol ekle                    [admin]
PATCH  /api/checks/{id}         → Güncelle / duraklat             [admin]
DELETE /api/checks/{id}         → Sil                             [admin]
POST   /api/checks/{id}/run     → Hemen çalıştır                  [admin]
GET    /api/checks/{id}/results → Son sonuçlar                     [JWT]
```

### Alerts
```
GET    /api/alerts/             → Son alarmlar (host adıyla)        [JWT]
GET    /api/alerts/count/open   → Açık alarm sayısı                 [JWT]
GET    /api/alerts/{host_id}    → Host'un alarmları                 [JWT]
PATCH  /api/alerts/{id}/acknowledge → Üstlen + not                  [JWT]
```

### WebSocket
```
WS /ws/metrics/{host_id}
```
Bağlantı açıldıktan sonra **ilk mesaj olarak JWT gönderilir** (URL'de değil).
Geçersizse bağlantı `4401` ile kapanır. Yalnızca yeni metrik geldiğinde push yapılır.

---

## 🗃️ Veri Modeli

| Tablo | İçerik |
|---|---|
| `hosts` | İzlenen cihaz: ad, adres (IP veya hostname), durum, `last_seen_at`, host bazlı eşikler |
| `metrics` | Zaman serisi: CPU, RAM (%/MB), disk (%/GB), uptime, ağ bayt delta |
| `checks` | Servis kontrolü: tip, hedef, port, aralık, timeout, `fail_threshold`, durum |
| `check_results` | Her kontrol çalışmasının sonucu (başarı, yanıt süresi, hata) |
| `alerts` | `cpu` \| `memory` \| `disk` \| `host_down` \| `check_down`; açık/kapalı, acknowledge alanları |
| `users` | E-posta, bcrypt parola hash'i, rol |

Şema değişiklikleri **Alembic** ile yönetilir; container açılışında `alembic upgrade head` çalışır.

### Arka plan görevleri

| Görev | Sıklık | İş |
|---|---|---|
| `host_status_watcher` | 10 sn | 30 sn veri gelmeyen host'u offline yapar, `host_down` alarmı açar, bayat kaynak alarmlarını kapatır |
| `check_scheduler` | 5 sn | Zamanı gelen servis kontrollerini paralel çalıştırır (en fazla 20 eşzamanlı) |
| `data_pruner` | 1 saat | Saklama süresini aşan metrik, kontrol sonucu ve kapanmış alarmları siler |

---

## 🔒 Güvenlik

| Konu | Durum |
|---|---|
| **Sırlar** | `.env` git'e girmez. Gerçek değerler yalnızca yereldedir; `.env.example` sadece şablondur |
| **Varsayılan sır koruması** | `ENVIRONMENT=production` iken varsayılan `SECRET_KEY`/`AGENT_API_KEY` ile uygulama **başlamayı reddeder** |
| **Kimlik doğrulama** | JWT (HS256, 24 saat), parolalar bcrypt ile saklanır |
| **Kaba kuvvet koruması** | Aynı IP'den 15 dakikada 10 başarısız girişten sonra `429`. Var olmayan e-postada da aynı süre harcanır (hesap sayımı engellenir) |
| **Kayıt kontrolü** | İlk hesaptan sonra `/register` kapanır (`403`). Varsayılan kurulum tek kullanıcılıdır |
| **Yetkilendirme** | Cihaz/kontrol ekleme, düzenleme, silme yalnızca admin; viewer salt okunur |
| **Girdi doğrulama** | Host adresleri ve kontrol hedefleri IP/hostname biçimine göre doğrulanır; `-f`, boşluk, `;` gibi değerler reddedilir |
| **WebSocket** | JWT ilk mesajda gider, URL'de değil — sunucu loglarına token düşmez |
| **Veritabanı** | PostgreSQL yalnızca `127.0.0.1`'e bağlanır |
| **Komut enjeksiyonu** | Ping hedefleri hostname/IP biçimine göre doğrulanır; kabuk kullanılmaz (`create_subprocess_exec`) |
| **SQL enjeksiyonu** | Tüm sorgular SQLAlchemy ORM üzerinden parametrelidir |

### Üretime almadan önce

- **HTTPS yok.** Ters proxy (Nginx / Caddy / Traefik) arkasına alın; JWT düz HTTP üzerinden taşınmamalıdır.
- `/docs` ve `/redoc` kimlik doğrulaması istemez (uç noktaların kendisi korunur). Kapatmak için `FastAPI(docs_url=None)`.
- HTTP kontrolleri backend'in ağından yapılır; iç ağa istek atılabileceği için (SSRF) yalnızca admin oluşturabilir.
- Kaba kuvvet sayacı bellektedir: süreç yeniden başlayınca sıfırlanır, çok replikalı kurulumda paylaşılmaz.

---

## 🛠️ Geliştirme

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev

# Agent
cd agent && pip install -r requirements.txt && python -m agent.main
```

Yeni migration:

```bash
docker compose exec backend python -m alembic revision -m "açıklama"
docker compose exec backend python -m alembic upgrade head
```

---

## ⚠️ Bilinen Sınırlar

- **macOS + Docker Desktop:** Yerel ağdaki cihazlara erişmek için
  *Sistem Ayarları → Gizlilik ve Güvenlik → Yerel Ağ* altında Docker Desktop'a izin verilmelidir.
  İzin yoksa ping/TCP kontrolleri "No route to host" ile başarısız olur.
- **7/24 izleme:** PulseNet yalnızca çalıştığı makine açıkken izler. Sürekli izleme için
  hep açık bir cihazda (Raspberry Pi, sunucu) çalıştırılmalıdır.
- **Bildirimler tarayıcı tarafındadır.** Sekme kapalıyken bildirim gelmez;
  e-posta/Telegram entegrasyonu henüz yoktur.
- **Uzak ağlar:** Servis kontrolleri backend'in bulunduğu ağdan yapılır. Başka bir evin/ofisin
  yerel cihazlarını izlemek için oraya bir "proxy" bileşeni gerekir (Zabbix Proxy muadili) — henüz yok.
- **Otomatik test yoktur.**
- Roller admin/viewer ile sınırlıdır; kullanıcı bazlı cihaz izolasyonu (çok kiracılı yapı) yoktur.
- **Parola sıfırlama akışı yoktur** (e-posta gönderimi gerektirir); yukarıdaki veritabanı komutu kullanılır.
- JWT iptal listesi yoktur: çıkış yapmak token'ı istemciden siler, token süresi (24 saat) dolana kadar teknik olarak geçerli kalır.

---

## 📋 Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Backend | Python 3.12, FastAPI, Uvicorn |
| ORM / Migration | SQLAlchemy 2.x (async) + asyncpg, Alembic |
| Veritabanı | PostgreSQL 16 |
| Auth | python-jose (JWT), passlib + bcrypt |
| Agent | psutil, httpx |
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Stil / Grafik | TailwindCSS v3, Recharts, Lucide React |
| Altyapı | Docker + Docker Compose v2 |

---

## 📄 Lisans

MIT License — Açık kaynak, ücretsiz kullanım.
