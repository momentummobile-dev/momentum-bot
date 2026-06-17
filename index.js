require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const app = express();
app.use(express.json());

async function getInventario() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'Sheet1!A:F',
  });
  const [, ...rows] = res.data.values || [];
  return rows.map(r => ({
    producto: r[0] || '', precio: r[1] || '',
    color: r[2] || '', bateria: r[3] || '',
    estado: r[4] || '', categoria: r[5] || ''
  }));
}

const conversaciones = {};

app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== 'text') return;

    const from = msg.from;
    const texto = msg.text.body;

    const inventario = await getInventario();
    const inventarioTexto = inventario.map(p =>
      p.producto + ' | Color: ' + p.color + ' | Bateria: ' + p.bateria + ' | Estado: ' + p.estado + ' | Precio: ' + p.precio + ' | Categoria: ' + p.categoria
    ).join('\n');

    if (!conversaciones[from]) conversaciones[from] = [];
    conversaciones[from].push({ role: 'user', content: texto });
    if (conversaciones[from].length > 12) conversaciones[from] = conversaciones[from].slice(-12);

    const claudeRes = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: 'Eres el asistente virtual de *Momentum Mobile*, tienda premium de tecnología Apple ubicada en Centro Comercial Monterrey, Local 031, Medellin, Colombia. Tu nombre es Momentum.\n\nHablas en espanol colombiano, amable, breve y profesional.\n\nINVENTARIO ACTUAL:\n' + inventarioTexto + '\n\nPUEDES AYUDAR CON:\n- PRECIOS Y DISPONIBILIDAD: Usa solo el inventario. Describe color, bateria y estado del equipo.\n- CREDITOS: 3 meses sin intereses, 6 meses sin intereses, 12 meses con interes minimo.\n- SOPORTE TECNICO: Garantia de 12 meses cubre defectos de fabrica.\n- DEVOLUCIONES: 30 dias con caja y factura original.\n- UBICACION: CC Monterrey Local 031. Lun-Sab 10am-8pm, Dom 11am-7pm.\n- CONTACTO: WhatsApp +57 323 921 4421\n\nREGLAS:\n- Maximo 3 parrafos cortos.\n- Si el cliente quiere comprar, pide su nombre y di que un
