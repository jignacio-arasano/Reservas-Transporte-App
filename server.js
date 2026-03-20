// ============================================================
//  COLECTIVO RESERVAS — Servidor principal
// ============================================================

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const idx = t.indexOf('=');
    if (idx === -1) return;
    process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
  });
}
loadEnv();

const SUPABASE_URL    = process.env.SUPABASE_URL    || '';
const SUPABASE_KEY    = process.env.SUPABASE_KEY    || '';
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_PRODUCCION   = process.env.MP_PRODUCCION   === 'true';
const PRECIO_ASIENTO  = parseInt(process.env.PRECIO_ASIENTO || '3300');
const BASE_URL        = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || 'admin123';
const RESEND_API_KEY  = process.env.RESEND_API_KEY  || '';
const EMAIL_FROM      = process.env.EMAIL_FROM      || 'reservas@tudominio.com';
const NOMBRE_SERVICIO = process.env.NOMBRE_SERVICIO || 'Reservas Transporte Pablo';
const TOTAL_ASIENTOS  = 30;

// Horarios por defecto
const HORARIOS_IDA    = ['07:50', '09:10', '09:50'];
const HORARIOS_VUELTA = ['11:00', '12:00', '13:00'];

// ── Supabase ──────────────────────────────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase conectado');
} else {
  console.error('❌ SUPABASE_URL y SUPABASE_KEY son obligatorios.');
}

// ── MercadoPago ───────────────────────────────────────────────
let mpClient = null, Preference = null;
if (MP_ACCESS_TOKEN && MP_ACCESS_TOKEN !== 'TU_ACCESS_TOKEN_ACA') {
  try {
    const mp = require('mercadopago');
    mpClient   = new mp.MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    Preference = mp.Preference;
    console.log(`✅ MercadoPago [${MP_PRODUCCION ? 'PRODUCCIÓN 💰' : 'prueba 🧪'}]`);
  } catch (e) { console.warn('⚠️  Error MercadoPago:', e.message); }
} else {
  console.log('ℹ️  Modo DEMO — sin MercadoPago real');
}

// ── Email ─────────────────────────────────────────────────────
async function enviarEmailConfirmacion({ nombre, email, asiento, fecha, hora, tipo, reservaId }) {
  if (!RESEND_API_KEY) return;
  const fechaFmt = new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const origen  = tipo === 'ida' ? 'Patio Olmos'   : 'Campus Siglo 21';
  const destino = tipo === 'ida' ? 'Campus Siglo 21' : 'Patio Olmos';
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: email,
        subject: `✅ Reserva confirmada — Asiento ${asiento} | ${NOMBRE_SERVICIO}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#f4f6f9;padding:24px;border-radius:12px">
            <div style="background:#080c14;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
              <h1 style="color:#f0a500;margin:0;font-size:1.4rem">🚌 ${NOMBRE_SERVICIO}</h1>
            </div>
            <div style="background:white;border-radius:10px;padding:24px">
              <h2 style="color:#1e2a3a;margin-top:0">¡Reserva confirmada, ${nombre.split(' ')[0]}!</h2>
              <table style="width:100%;border-collapse:collapse">
                <tr style="border-bottom:1px solid #f0f0f0">
                  <td style="padding:10px 0;color:#6b7a8d">Tipo</td>
                  <td style="padding:10px 0;font-weight:600;text-align:right">${tipo === 'ida' ? '🟢 Ida' : '🔵 Vuelta'}</td>
                </tr>
                <tr style="border-bottom:1px solid #f0f0f0">
                  <td style="padding:10px 0;color:#6b7a8d">Ruta</td>
                  <td style="padding:10px 0;font-weight:600;text-align:right">${origen} → ${destino}</td>
                </tr>
                <tr style="border-bottom:1px solid #f0f0f0">
                  <td style="padding:10px 0;color:#6b7a8d">Fecha</td>
                  <td style="padding:10px 0;font-weight:600;text-align:right;text-transform:capitalize">${fechaFmt}</td>
                </tr>
                <tr style="border-bottom:1px solid #f0f0f0">
                  <td style="padding:10px 0;color:#6b7a8d">Horario</td>
                  <td style="padding:10px 0;font-weight:600;text-align:right">${hora}hs</td>
                </tr>
                <tr style="border-bottom:1px solid #f0f0f0">
                  <td style="padding:10px 0;color:#6b7a8d">Asiento</td>
                  <td style="padding:10px 0;font-weight:600;text-align:right">Nº ${asiento}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7a8d">Código</td>
                  <td style="padding:10px 0;font-weight:700;text-align:right;color:#f0a500">#${reservaId}</td>
                </tr>
              </table>
              <div style="background:#f0f9f4;border:1px solid #a0e0b0;border-radius:8px;padding:14px;margin-top:20px;text-align:center">
                <p style="margin:0;color:#1a5c2e;font-size:.9rem">Mostrá el código <strong>#${reservaId}</strong> al subir</p>
              </div>
            </div>
          </div>`
      })
    });
    console.log(`📧 Email enviado a ${email}`);
  } catch (e) { console.warn('⚠️  Error email:', e.message); }
}

// ── Helpers de fecha ──────────────────────────────────────────
function esLunesAViernes(fecha) {
  const d = new Date(fecha + 'T12:00:00');
  const dow = d.getDay(); // 0=dom, 6=sab
  return dow >= 1 && dow <= 5;
}

function proximoLunesAViernes(desde, diasAdelante) {
  const fechas = [];
  const cursor = new Date(desde);
  while (fechas.length < diasAdelante * 2) { // margen extra
    const f = cursor.toISOString().split('T')[0];
    if (esLunesAViernes(f)) fechas.push(f);
    cursor.setDate(cursor.getDate() + 1);
    if (fechas.length >= diasAdelante) break;
  }
  return fechas;
}

// ── Init y Cron de viajes ─────────────────────────────────────
async function agregarViajesNuevos() {
  if (!supabase) return;

  const { data } = await supabase
    .from('viajes').select('fecha').order('fecha', { ascending: false }).limit(1);
  const ultimaFecha = data?.[0]?.fecha;
  if (!ultimaFecha) return;

  const hoy    = new Date();
  const limite = new Date();
  limite.setDate(hoy.getDate() + 14);

  const ultima = new Date(ultimaFecha + 'T12:00:00');
  if (ultima >= limite) return;

  const nuevos = [];
  const cursor = new Date(ultima);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= limite) {
    const fecha = cursor.toISOString().split('T')[0];
    if (esLunesAViernes(fecha)) {
      for (const hora of HORARIOS_IDA)
        nuevos.push({ fecha, hora, tipo: 'ida', origen: 'Patio Olmos', destino: 'Campus Siglo 21', activo: true });
      for (const hora of HORARIOS_VUELTA)
        nuevos.push({ fecha, hora, tipo: 'vuelta', origen: 'Campus Siglo 21', destino: 'Patio Olmos', activo: true });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (nuevos.length > 0) {
    await supabase.from('viajes').insert(nuevos);
    console.log(`✅ Viajes nuevos agregados hasta ${nuevos[nuevos.length-1].fecha}`);
  }
}

async function initViajes() {
  if (!supabase) return;
  const { count } = await supabase.from('viajes').select('*', { count: 'exact', head: true });

  if (count === 0) {
    const viajes = [];
    let diasAgregados = 0;
    const cursor = new Date();

    while (diasAgregados < 14) {
      const fecha = cursor.toISOString().split('T')[0];
      if (esLunesAViernes(fecha)) {
        for (const hora of HORARIOS_IDA)
          viajes.push({ fecha, hora, tipo: 'ida', origen: 'Patio Olmos', destino: 'Campus Siglo 21', activo: true });
        for (const hora of HORARIOS_VUELTA)
          viajes.push({ fecha, hora, tipo: 'vuelta', origen: 'Campus Siglo 21', destino: 'Patio Olmos', activo: true });
        diasAgregados++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    await supabase.from('viajes').insert(viajes);
    console.log('✅ Viajes iniciales cargados (14 días hábiles)');
  }

  setInterval(agregarViajesNuevos, 6 * 60 * 60 * 1000);
  await agregarViajesNuevos();
}

// ── Middlewares ───────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authAdmin(req, res, next) {
  if (req.headers['x-admin-token'] === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

// ── POST /api/admin/login ─────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD)
    return res.json({ ok: true, token: ADMIN_PASSWORD });
  return res.status(401).json({ error: 'Contraseña incorrecta' });
});

// ── GET /api/viajes ───────────────────────────────────────────
app.get('/api/viajes', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });

  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const { data: viajes, error } = await supabase
    .from('viajes').select('*').eq('activo', true)
    .gte('fecha', ayer).order('fecha').order('hora').limit(120);

  if (error) return res.status(500).json({ error: error.message });

  const ids = viajes.map(v => v.id);
  const { data: reservas } = await supabase
    .from('reservas').select('viaje_id').in('viaje_id', ids).neq('estado', 'cancelada');

  const conteo = {};
  (reservas || []).forEach(r => { conteo[r.viaje_id] = (conteo[r.viaje_id] || 0) + 1; });

  res.json(viajes.map(v => ({ ...v, disponibles: TOTAL_ASIENTOS - (conteo[v.id] || 0) })));
});

// ── GET /api/viajes/:id/asientos ──────────────────────────────
app.get('/api/viajes/:id/asientos', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });

  const id = parseInt(req.params.id);
  const { data: viaje } = await supabase.from('viajes').select('*').eq('id', id).single();
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' });

  const { data: reservas } = await supabase
    .from('reservas').select('asiento').eq('viaje_id', id).neq('estado', 'cancelada');

  res.json({ viaje, ocupados: (reservas || []).map(r => r.asiento), total: TOTAL_ASIENTOS, precio: PRECIO_ASIENTO });
});

// ── POST /api/reservas ────────────────────────────────────────
app.post('/api/reservas', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase no configurado' });

  const { viaje_id, asiento, nombre, email, telefono } = req.body;
  if (!viaje_id || !asiento || !nombre || !email)
    return res.status(400).json({ error: 'Completá todos los campos' });
  if (asiento < 1 || asiento > TOTAL_ASIENTOS)
    return res.status(400).json({ error: 'Asiento inválido' });

  const id = parseInt(viaje_id);
  const { data: viaje } = await supabase.from('viajes').select('*').eq('id', id).single();
  if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado' });

  const { data: ocupado } = await supabase.from('reservas')
    .select('id').eq('viaje_id', id).eq('asiento', asiento).neq('estado', 'cancelada').maybeSingle();
  if (ocupado) return res.status(409).json({ error: 'Ese asiento ya fue reservado. Elegí otro.' });

  const { data: reserva, error: errR } = await supabase.from('reservas')
    .insert({ viaje_id: id, asiento, nombre: nombre.trim(), email: email.trim(),
      telefono: telefono || null, estado: 'pendiente' })
    .select().single();
  if (errR) return res.status(500).json({ error: 'Error al crear reserva' });

  if (mpClient && Preference) {
    try {
      const pref = new Preference(mpClient);
      const fechaLabel = new Date(viaje.fecha + 'T12:00:00').toLocaleDateString('es-AR',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const prefData = await pref.create({ body: {
        items: [{ id: `reserva-${reserva.id}`,
          title: `Asiento ${asiento} — ${viaje.tipo === 'ida' ? 'Ida' : 'Vuelta'} ${viaje.hora}`,
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

      await supabase.from('reservas').update({ mp_preference_id: prefData.id }).eq('id', reserva.id);
      const url = MP_PRODUCCION ? prefData.init_point : prefData.sandbox_init_point;
      return res.json({ ok: true, reserva_id: reserva.id, mp_url: url });
    } catch (err) {
      console.error('Error MP:', err.message);
      await supabase.from('reservas').update({ estado: 'cancelada' }).eq('id', reserva.id);
      return res.status(500).json({ error: 'Error al conectar con MercadoPago.' });
    }
  }

  await supabase.from('reservas').update({ estado: 'pagada' }).eq('id', reserva.id);
  await enviarEmailConfirmacion({ nombre, email, asiento, fecha: viaje.fecha,
    hora: viaje.hora, tipo: viaje.tipo, reservaId: reserva.id });
  return res.json({ ok: true, reserva_id: reserva.id, mp_url: null, modo_demo: true });
});

// ── Redirects MP ──────────────────────────────────────────────
app.get('/success', async (req, res) => {
  const { reserva_id, payment_id } = req.query;
  if (reserva_id && supabase) {
    await supabase.from('reservas')
      .update({ estado: 'pagada', mp_payment_id: payment_id || 'ok' })
      .eq('id', parseInt(reserva_id));
    const { data: r } = await supabase.from('reservas')
      .select('*, viajes(fecha, hora, tipo)').eq('id', parseInt(reserva_id)).single();
    if (r) await enviarEmailConfirmacion({ nombre: r.nombre, email: r.email,
      asiento: r.asiento, fecha: r.viajes?.fecha, hora: r.viajes?.hora,
      tipo: r.viajes?.tipo, reservaId: r.id });
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

app.post('/api/webhook', (req, res) => {
  if (req.body?.type === 'payment') console.log('Webhook MP:', req.body?.data?.id);
  res.sendStatus(200);
});

// ── Admin: reservas ───────────────────────────────────────────
app.get('/api/admin/reservas', authAdmin, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Sin Supabase' });
  const { data, error } = await supabase.from('reservas')
    .select('*, viajes(fecha, hora, tipo, origen, destino)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(r => ({ ...r, fecha: r.viajes?.fecha, hora: r.viajes?.hora,
    tipo: r.viajes?.tipo, origen: r.viajes?.origen, destino: r.viajes?.destino, viajes: undefined })));
});

// ── Admin: cancelar reserva ───────────────────────────────────
app.post('/api/admin/cancelar/:id', authAdmin, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Sin Supabase' });
  const { error } = await supabase.from('reservas').update({ estado: 'cancelada' }).eq('id', parseInt(req.params.id));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Admin: listar viajes futuros ──────────────────────────────
app.get('/api/admin/viajes', authAdmin, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Sin Supabase' });
  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.from('viajes').select('*')
    .eq('activo', true).gte('fecha', hoy).order('fecha').order('hora').limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Admin: editar horario de un viaje ─────────────────────────
app.put('/api/admin/viajes/:id', authAdmin, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Sin Supabase' });
  const { hora } = req.body;
  if (!hora) return res.status(400).json({ error: 'Falta la hora' });
  const { error } = await supabase.from('viajes').update({ hora }).eq('id', parseInt(req.params.id));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Admin: agregar viaje extra ────────────────────────────────
app.post('/api/admin/viajes', authAdmin, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Sin Supabase' });
  const { fecha, hora, tipo } = req.body;
  if (!fecha || !hora || !tipo) return res.status(400).json({ error: 'Faltan datos' });
  const origen  = tipo === 'ida' ? 'Patio Olmos'    : 'Campus Siglo 21';
  const destino = tipo === 'ida' ? 'Campus Siglo 21' : 'Patio Olmos';
  const { data, error } = await supabase.from('viajes')
    .insert({ fecha, hora, tipo, origen, destino, activo: true }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, viaje: data });
});

// ── Admin: eliminar viaje ─────────────────────────────────────
app.delete('/api/admin/viajes/:id', authAdmin, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Sin Supabase' });
  // Solo se puede borrar si no tiene reservas pagadas
  const { data: reservas } = await supabase.from('reservas')
    .select('id').eq('viaje_id', parseInt(req.params.id)).eq('estado', 'pagada');
  if (reservas?.length > 0)
    return res.status(409).json({ error: `No se puede eliminar: tiene ${reservas.length} reserva(s) pagada(s)` });
  const { error } = await supabase.from('viajes').update({ activo: false }).eq('id', parseInt(req.params.id));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
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
