// ============================================================
//  COLECTIVO RESERVAS — Servidor principal
//  Base de datos: Supabase (PostgreSQL)
// ============================================================

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Leer .env ─────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  });
}
loadEnv();

const SUPABASE_URL     = process.env.SUPABASE_URL     || '';
const SUPABASE_KEY     = process.env.SUPABASE_KEY     || '';
const MP_ACCESS_TOKEN  = process.env.MP_ACCESS_TOKEN  || '';
const MP_PRODUCCION    = process.env.MP_PRODUCCION    === 'true';
const PRECIO_ASIENTO   = parseInt(process.env.PRECIO_ASIENTO || '3300');
const BASE_URL         = process.env.BASE_URL         || `http://localhost:${PORT}`;

// ── Supabase ──────────────────────────────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase conectado');
} else {
  console.error('❌ SUPABASE_URL y SUPABASE_KEY son obligatorios. Completá el archivo .env');
  console.error('   Seguí las instrucciones en SETUP.md');
}

// ── MercadoPago ───────────────────────────────────────────────
let mpClient = null, Preference = null;
if (MP_ACCESS_TOKEN && MP_ACCESS_TOKEN !== 'TU_ACCESS_TOKEN_ACA') {
  try {
    const mp = require('mercadopago');
    mpClient   = new mp.MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    Preference = mp.Preference;
    console.log(`✅ MercadoPago [${MP_PRODUCCION ? 'PRODUCCIÓN 💰' : 'prueba 🧪'}]`);
  } catch (e) {
    console.warn('⚠️  Error MercadoPago:', e.message);
  }
} else {
  console.log('ℹ️  Modo DEMO — sin MercadoPago real');
}

// ── Inicializar viajes si no existen ──────────────────────────
async function initViajes() {
  if (!supabase) return;
  const { count } = await supabase
    .from('viajes').select('*', { count: 'exact', head: true });
  if (count > 0) return;

  const horarios = ['07:30', '12:30', '18:00'];
  const viajes   = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const fecha = d.toISOString().split('T')[0];
    for (const hora of horarios) {
      viajes.push({ fecha, hora, origen: 'Patio Olmos', destino: 'Campus Siglo 21', activo: true });
    }
  }
  await supabase.from('viajes').insert(viajes);
  console.log('✅ Viajes de los próximos 14 días cargados en Supabase');
}

// ── Middlewares ───────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GET /api/viajes ───────────────────────────────────────────
app.get('/api/viajes', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });

  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const { data: viajes, error } = await supabase
    .from('viajes')
    .select('*')
    .eq('activo', true)
    .gte('fecha', ayer)
    .order('fecha').order('hora')
    .limit(42);

  if (error) return res.status(500).json({ error: error.message });

  // Contar ocupados por viaje
  const ids = viajes.map(v => v.id);
  const { data: reservas } = await supabase
    .from('reservas')
    .select('viaje_id')
    .in('viaje_id', ids)
    .neq('estado', 'cancelada');

  const conteo = {};
  (reservas || []).forEach(r => {
    conteo[r.viaje_id] = (conteo[r.viaje_id] || 0) + 1;
  });

  res.json(viajes.map(v => ({ ...v, disponibles: 28 - (conteo[v.id] || 0) })));
});

// ── GET /api/viajes/:id/asientos ──────────────────────────────
app.get('/api/viajes/:id/asientos', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });

  const id = parseInt(req.params.id);
  const { data: viaje } = await supabase.from('viajes').select('*').eq('id', id).single();
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' });

  const { data: reservas } = await supabase
    .from('reservas').select('asiento')
    .eq('viaje_id', id).neq('estado', 'cancelada');

  res.json({
    viaje,
    ocupados: (reservas || []).map(r => r.asiento),
    total: 28,
    precio: PRECIO_ASIENTO
  });
});

// ── POST /api/reservas ────────────────────────────────────────
app.post('/api/reservas', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });

  const { viaje_id, asiento, nombre, email, telefono } = req.body;
  if (!viaje_id || !asiento || !nombre || !email)
    return res.status(400).json({ error: 'Completá todos los campos' });
  if (asiento < 1 || asiento > 28)
    return res.status(400).json({ error: 'Asiento inválido' });

  const id = parseInt(viaje_id);

  // Verificar viaje
  const { data: viaje } = await supabase.from('viajes').select('*').eq('id', id).single();
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' });

  // Verificar disponibilidad
  const { data: ocupado } = await supabase.from('reservas')
    .select('id').eq('viaje_id', id).eq('asiento', asiento).neq('estado', 'cancelada').maybeSingle();
  if (ocupado) return res.status(409).json({ error: 'Ese asiento ya fue reservado. Elegí otro.' });

  // Crear reserva
  const { data: reserva, error: errReserva } = await supabase.from('reservas')
    .insert({ viaje_id: id, asiento, nombre: nombre.trim(), email: email.trim(),
      telefono: telefono || null, estado: 'pendiente' })
    .select().single();

  if (errReserva) return res.status(500).json({ error: 'Error al crear reserva: ' + errReserva.message });

  // ── Con MercadoPago ──────────────────────────────────────────
  if (mpClient && Preference) {
    try {
      const pref      = new Preference(mpClient);
      const fechaLabel = new Date(viaje.fecha + 'T12:00:00').toLocaleDateString('es-AR',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      const prefData = await pref.create({ body: {
        items: [{ id: `reserva-${reserva.id}`,
          title: `Asiento ${asiento} — ${viaje.hora}`,
          description: `${viaje.origen} → ${viaje.destino} | ${fechaLabel}`,
          quantity: 1, unit_price: PRECIO_ASIENTO, currency_id: 'ARS' }],
        payer: { name: nombre.split(' ')[0], surname: nombre.split(' ').slice(1).join(' '), email },
        back_urls: {
          success: `${BASE_URL}/success?reserva_id=${reserva.id}`,
          failure: `${BASE_URL}/failure?reserva_id=${reserva.id}`,
          pending: `${BASE_URL}/pending?reserva_id=${reserva.id}`
        },
        auto_return: 'approved',
        external_reference: reserva.id.toString(),
        expires: true,
        expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      }});

      await supabase.from('reservas')
        .update({ mp_preference_id: prefData.id }).eq('id', reserva.id);

      const url = MP_PRODUCCION ? prefData.init_point : prefData.sandbox_init_point;
      return res.json({ ok: true, reserva_id: reserva.id, mp_url: url });
    } catch (err) {
      console.error('Error MP:', err.message);
      await supabase.from('reservas').update({ estado: 'cancelada' }).eq('id', reserva.id);
      return res.status(500).json({ error: 'Error al conectar con MercadoPago. Intentá de nuevo.' });
    }
  }

  // ── Modo demo ─────────────────────────────────────────────────
  await supabase.from('reservas').update({ estado: 'pagada' }).eq('id', reserva.id);
  return res.json({ ok: true, reserva_id: reserva.id, mp_url: null, modo_demo: true });
});

// ── Redirects MP ──────────────────────────────────────────────
app.get('/success', async (req, res) => {
  const { reserva_id, payment_id } = req.query;
  if (reserva_id && supabase) {
    await supabase.from('reservas')
      .update({ estado: 'pagada', mp_payment_id: payment_id || 'ok' })
      .eq('id', parseInt(reserva_id));
  }
  res.sendFile(path.join(__dirname, 'public', 'resultado.html'));
});

app.get('/failure', async (req, res) => {
  const { reserva_id } = req.query;
  if (reserva_id && supabase)
    await supabase.from('reservas').update({ estado: 'cancelada' }).eq('id', parseInt(reserva_id));
  res.sendFile(path.join(__dirname, 'public', 'resultado.html'));
});

app.get('/pending', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'resultado.html'));
});

app.post('/api/webhook', async (req, res) => {
  if (req.body?.type === 'payment')
    console.log('Webhook MP, payment_id:', req.body?.data?.id);
  res.sendStatus(200);
});

// ── Admin ─────────────────────────────────────────────────────
app.get('/api/admin/reservas', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });
  const { data, error } = await supabase
    .from('reservas')
    .select('*, viajes(fecha, hora, origen, destino)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  res.json(data.map(r => ({
    ...r,
    fecha:   r.viajes?.fecha,
    hora:    r.viajes?.hora,
    origen:  r.viajes?.origen,
    destino: r.viajes?.destino,
    viajes:  undefined
  })));
});

// ── Iniciar ───────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('');
  console.log('🚌 =============================================');
  console.log('   COLECTIVO RESERVAS — Servidor iniciado!');
  console.log('🚌 =============================================');
  console.log(`   App:    http://localhost:${PORT}`);
  console.log(`   Admin:  http://localhost:${PORT}/admin.html`);
  console.log('');
  await initViajes();
});
