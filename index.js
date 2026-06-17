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
  const rows = res.data.values || [];
  rows.shift();
  return rows.map(function(r) {
    return {
      producto: r[0] || '',
      precio: r[1] || '',
      color: r[2] || '',
      bateria: r[3] || '',
      estado: r[4] || '',
      categoria: r[5] || ''
    };
  });
}

const conversaciones = {};

app.get('/webhook', function(req, res) {
  if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', async function(req, res) {
  res.sendStatus(200);
  try {
    const value = req.body.entry[0].changes[0].value;
    const msg = value.messages[0];
    if (!msg || msg.type !== 'text') return;

    const from = msg.from;
    const texto = msg.text.body;

    const inventario = await getInventario();
    let inventarioTexto = '';
    for (let i = 0; i < inventario.length; i++) {
      const p = inventario[i];
      inventarioTexto += p.producto + ' | Color: ' + p.color + ' | Bateria: ' + p.bateria + ' | Estado: ' + p.estado + ' | Precio: ' + p.precio + '\n';
    }

    if (!conversaciones[from]) {
      conversaciones[from] = [];
    }
    conversaciones[from].push({ role: 'user', content: texto });
    if (conversaciones[from].length > 10) {
      conversaciones[from] = conversaciones[from].slice(-10);
    }

    const claudeRes = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: 'Eres el asistente de Momentum Mobile, tienda de tecnologia Apple en CC Monterrey Local 031, Medellin. Responde en espanol, breve y amable. INVENTARIO: ' + inventarioTexto + ' REGLAS: Usa solo el inventario para precios. Si quiere comprar pide su nombre. Si no puedes ayudar escribe: ESCALAR_AGENTE',
        messages: conversaciones[from],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        }
      }
    );

    let respuesta = claudeRes.data.content[0].text;
    conversaciones[from].push({ role: 'assistant', content: respuesta });

    if (respuesta.indexOf('ESCALAR_AGENTE') !== -1) {
      respuesta = 'Te conecto con un asesor de Momentum Mobile ahora mismo. Un momento por favor!';
      const resumen = conversaciones[from].slice(-4).map(function(m) {
        return (m.role === 'user' ? 'Cliente: ' : 'Bot: ') + m.content;
      }).join('\n');
      await enviarMensaje(process.env.AGENTE_TEL, 'CLIENTE NECESITA ASESOR\nNumero: ' + from + '\n\n' + resumen);
    }

    await enviarMensaje(from, respuesta);

  } catch (err) {
    console.error('Error: ' + (err.message || 'unknown'));
  }
});

async function enviarMensaje(to, texto) {
  await axios.post(
    'https://graph.facebook.com/v18.0/' + process.env.WHATSAPP_PHONE_ID + '/messages',
    {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: texto }
    },
    {
      headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN }
    }
  );
}

app.listen(process.env.PORT || 3000, function() {
  console.log('Momentum Bot activo');
});
