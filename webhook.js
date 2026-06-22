const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ปิด Vercel body parser — ต้องการ raw body สำหรับ LINE signature
module.exports.config = { api: { bodyParser: false } };

// โหลด products.json
let _products = null;
function getProducts() {
  if (!_products) {
    _products = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'products.json'), 'utf-8')
    );
  }
  return _products;
}

// ค้นหาสินค้า
function search(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return getProducts()
    .filter(p =>
      p.model?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      p.pcn?.toLowerCase().includes(q)
    )
    .slice(0, 5);
}

// จัดรูปแบบสินค้า
function fmt(p) {
  const price    = Number(p.price).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const priceVat = Number(p.price_vat).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  return [`📦 ${p.model || ''}`, `หมวด: ${p.category}`,
    `ราคา: ฿${price}`, `รวม VAT: ฿${priceVat}`,
    p.pcn ? `PCN: ${p.pcn}` : ''
  ].filter(Boolean).join('\n');
}

// ส่งข้อความกลับ LINE
function replyLine(token, messages) {
  const body = JSON.stringify({ replyToken: token, messages });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.line.me',
      path: '/v2/bot/message/reply',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// อ่าน raw body จาก stream
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// handler หลัก
module.exports = async function handler(req, res) {
  // ทดสอบ GET
  if (req.method === 'GET') {
    return res.status(200).send('LINE Bot Webhook is running ✅');
  }
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const rawBody = await readBody(req);

  // ตรวจ signature
  const secret = process.env.LINE_CHANNEL_SECRET;
  const sig = req.headers['x-line-signature'];
  if (secret && sig) {
    const hash = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64');
    if (hash !== sig) return res.status(401).send('Invalid signature');
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return res.status(400).send('Bad JSON'); }

  for (const event of (payload.events || [])) {
    if (event.type !== 'message' || event.message?.type !== 'text') continue;
    const text = event.message.text.trim();
    const results = search(text);

    const messages = results.length === 0
      ? [{ type: 'text', text: `❌ ไม่พบ "${text}"\n\nลองพิมพ์เช่น:\n• EK-032F\n• WFS-1001\n• ZR24K3\n• 9JD420` }]
      : [{ type: 'text', text:
          `🔍 พบ ${results.length} รายการ "${text}":\n\n` +
          results.map(fmt).join('\n\n─────────────\n\n') +
          `\n\n📊 ${process.env.WEB_URL || 'https://your-github.github.io/price-bot'}`
        }];

    await replyLine(event.replyToken, messages);
  }

  return res.status(200).json({ ok: true });
};
