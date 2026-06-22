const crypto = require('crypto');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

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

// จัดรูปแบบข้อความสินค้า
function fmt(p) {
  const price    = Number(p.price).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const priceVat = Number(p.price_vat).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  return [
    '📦 ' + (p.model || p.name),
    'หมวด: ' + p.category,
    'ราคา: ฿' + price,
    'รวม VAT: ฿' + priceVat,
    p.pcn ? 'PCN: ' + p.pcn : ''
  ].filter(Boolean).join('\n');
}

// ส่งข้อความกลับ LINE
function replyLine(token, messages) {
  const body = JSON.stringify({ replyToken: token, messages: messages });
  return new Promise(function(resolve, reject) {
    var req = https.request({
      hostname: 'api.line.me',
      path: '/v2/bot/message/reply',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN,
        'Content-Length': Buffer.byteLength(body)
      }
    }, function(res) {
      res.on('data', function() {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// อ่าน raw body
function readBody(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(c) { chunks.push(c); });
    req.on('end', function() { resolve(Buffer.concat(chunks).toString('utf-8')); });
    req.on('error', reject);
  });
}

// handler หลัก
async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('LINE Bot Webhook is running ✅');
  }
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  var rawBody = await readBody(req);

  // ตรวจ signature
  var secret = process.env.LINE_CHANNEL_SECRET;
  var sig = req.headers['x-line-signature'];
  if (secret && sig) {
    var hash = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64');
    if (hash !== sig) return res.status(401).send('Invalid signature');
  }

  var payload;
  try { payload = JSON.parse(rawBody); }
  catch(e) { return res.status(400).send('Bad JSON'); }

  var events = payload.events || [];
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    if (event.type !== 'message' || !event.message || event.message.type !== 'text') continue;
    var text = event.message.text.trim();
    var results = search(text);

    var messages;
    if (results.length === 0) {
      messages = [{ type: 'text', text: '❌ ไม่พบ "' + text + '"\n\nลองพิมพ์เช่น:\n• EK-032F\n• WFS-1001\n• ZR24K3\n• 9JD420' }];
    } else {
      var webUrl = process.env.WEB_URL || 'https://your-github.github.io/price-bot';
      messages = [{ type: 'text', text:
        '🔍 พบ ' + results.length + ' รายการ "' + text + '":\n\n' +
        results.map(fmt).join('\n\n─────────────\n\n') +
        '\n\n📊 ' + webUrl
      }];
    }
    await replyLine(event.replyToken, messages);
  }

  return res.status(200).json({ ok: true });
}

// ปิด Vercel body parser — ต้องกำหนดก่อน export
handler.config = { api: { bodyParser: false } };

module.exports = handler;
