# 🚌 SETUP COMPLETO — Colectivo Reservas
# Tiempo estimado: 45 minutos la primera vez

## ═══════════════════════════════════════════════
## PASO 1 — Crear la base de datos en Supabase
## (Gratis, datos nunca se pierden)
## ═══════════════════════════════════════════════

1. Entrá a https://supabase.com y creá una cuenta gratis
   (podés entrar con Google)

2. Hacé clic en "New Project"
   - Name: colectivo-reservas
   - Database password: anotá la contraseña en un lugar seguro
   - Region: South America (São Paulo) — el más cercano a Argentina
   - Hacé clic en "Create new project" y esperá 1 minuto

3. Una vez creado, en el panel izquierdo hacé clic en
   el ícono de SQL (dice "SQL Editor")

4. Pegá y ejecutá este código SQL completo:

─────────────────────────────────────────────────────
CREATE TABLE viajes (
  id        BIGSERIAL PRIMARY KEY,
  fecha     TEXT NOT NULL,
  hora      TEXT NOT NULL,
  origen    TEXT DEFAULT 'Patio Olmos',
  destino   TEXT DEFAULT 'Campus Siglo 21',
  activo    BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reservas (
  id               BIGSERIAL PRIMARY KEY,
  viaje_id         BIGINT REFERENCES viajes(id),
  asiento          INTEGER NOT NULL,
  nombre           TEXT NOT NULL,
  email            TEXT NOT NULL,
  telefono         TEXT,
  estado           TEXT DEFAULT 'pendiente',
  mp_preference_id TEXT,
  mp_payment_id    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(viaje_id, asiento)
);

-- Permite que la app lea y escriba
ALTER TABLE viajes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON viajes  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON reservas FOR ALL USING (true) WITH CHECK (true);
─────────────────────────────────────────────────────

5. Hacé clic en "Run" (el botón verde). Tiene que decir "Success"

6. Ahora buscá tus credenciales:
   - En el panel izquierdo andá a Settings → API
   - Copiá "Project URL" → ese es tu SUPABASE_URL
   - Copiá "anon public" bajo "Project API keys" → ese es tu SUPABASE_KEY



## ═══════════════════════════════════════════════
## PASO 2 — Elegir dónde hostearlo
## ═══════════════════════════════════════════════

OPCIÓN A — VPS propio (RECOMENDADO — $4 a $6 USD/mes)
  Lo bueno: vos tenés control total, no depende de nadie,
  nunca se reinicia solo, podés alojar varios clientes
  en el mismo servidor.

  Proveedores recomendados:
  - Hostinger VPS: desde $4 USD/mes — panel en español
    https://www.hostinger.com/vps-hosting
  - Contabo: desde $4 USD/mes — muy buena relación precio/calidad
    https://contabo.com
  - DigitalOcean: desde $4 USD/mes — muy confiable
    https://digitalocean.com

  Elegí el plan más barato de cualquiera de los tres.
  Con 1GB de RAM alcanza perfectamente para varios clientes.

OPCIÓN B — Railway pago ($5 USD/mes)
  Más simple de configurar pero menos control.
  No tiene el problema de los reinicios en el plan pago.


## ═══════════════════════════════════════════════
## PASO 3 — Instalar la app en el VPS
## ═══════════════════════════════════════════════

Una vez que tenés el VPS, te van a dar acceso SSH.
Abrís una terminal (o usás el panel web que te dan)
y ejecutás estos comandos uno por uno:

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 (mantiene la app siempre activa)
sudo npm install -g pm2

# Subir los archivos de la app al VPS
# (podés usar FileZilla con SFTP, o clonar desde un repo)

# Entrar a la carpeta
cd colectivo-app

# Instalar dependencias
npm install

# Crear el archivo .env con tus datos reales
nano .env
# (completás SUPABASE_URL, SUPABASE_KEY, MP_ACCESS_TOKEN, BASE_URL)
# Guardás con Ctrl+O, Enter, Ctrl+X

# Arrancar la app con PM2
pm2 start server.js --name "colectivo"

# Hacer que se inicie automáticamente si el servidor se reinicia
pm2 startup
pm2 save

# Ver que esté corriendo
pm2 status


## ═══════════════════════════════════════════════
## PASO 4 — Dominio propio (opcional pero recomendado)
## ═══════════════════════════════════════════════

1. Comprá el dominio en:
   - NIC.ar: dominios .com.ar — ~$1.500/año
     https://nic.ar
   - Namecheap: dominios .com — ~$10 USD/año
     https://namecheap.com

2. En el panel de tu dominio, creá un registro DNS tipo A:
   - Nombre: @ (o "reservas" si querés subdomain)
   - Valor: la IP de tu VPS

3. En el .env cambiá BASE_URL por tu dominio:
   BASE_URL=https://reservas.tuempresa.com.ar

4. Reiniciá la app:
   pm2 restart colectivo


## ═══════════════════════════════════════════════
## COMANDOS PM2 ÚTILES (para el día a día)
## ═══════════════════════════════════════════════

pm2 status              → ver si la app está corriendo
pm2 logs colectivo      → ver errores en tiempo real
pm2 restart colectivo   → reiniciar después de cambios
pm2 stop colectivo      → detener la app


## ═══════════════════════════════════════════════
## PARA CADA CLIENTE NUEVO
## ═══════════════════════════════════════════════

En el mismo VPS podés correr varias apps en puertos distintos:
- Cliente 1: puerto 3000
- Cliente 2: puerto 3001
- Cliente 3: puerto 3002
etc.

Cada uno tiene su propio .env con su token de MP y su Supabase.
Un solo VPS de $4 USD/mes aguanta fácil 10 clientes.
