// Line Bot Webhook - Vercel Serverless Function
// Deploy: push to GitHub → Vercel auto-deploys

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load products from JSON (bundled with deploy)
let products = null;
function getProducts() {
  if (!products) {
    const filePath = path.join(process.cwd(), 'products.json');
    products = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return products;
}

// Search products by query string
function searchProducts(query) {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return [];
  const data = getProducts();
  return data.filter(p =>
    p.model?.toLowerCase().includes(q) ||
    p.name?.toLowerCase().includes(q) ||
    p.pcn?.toLowerCase().includes(q)
  ).slice(0, 5); // max 5 results
}

// Format a single product for LINE reply
function formatProduct(p) {
  const price = p.price?.toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const priceVat = p.price_vat?.toLocaleString('th-TH', { minimumFractionDigits: 2 });
  return [
    `📦 ${p.model || p.name}`,
    `หมวด: ${p.category}`,
    `ราคา: ฿${price}`,
    `รวม VAT: ฿${priceVat}`,
    p.pcn ? `PCN: ${p.pcn}` : ''
  ].filter(Boolean).join('\n');
}

// Reply to LINE
async function replyToLine(replyToken, messages) {
  const body = JSON.stringify({ replyToken, messages });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.line.me',
      path: '/v2/bot/message/reply',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Verify LINE signature
function verifySignature(body, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return true; // skip in dev
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  return hash === signature;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('LINE Bot Webhook is running ✅');
  }
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Collect raw body for signature check
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf-8');

  const sig = req.headers['x-line-signature'];
  if (sig && !verifySignature(rawBody, sig)) {
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return res.status(400).send('Bad JSON'); }

  const events = payload.events || [];
  for (const event of events) {
    if (event.type !== 'message' || event.message?.type !== 'text') continue;

    const userText = event.message.text.trim();
    const results = searchProducts(userText);

    let replyMessages;
    if (results.length === 0) {
      replyMessages = [{
        type: 'text',
        text: `❌ ไม่พบสินค้า "${userText}"\n\nลองพิมพ์ชื่อรุ่นหรือ Model เช่น:\n• EK-032F\n• WFS-1001\n• VPI-020-TPH2`
      }];
    } else {
      const formatted = results.map(formatProduct).join('\n\n─────────────\n\n');
      replyMessages = [{
        type: 'text',
        text: `🔍 พบ ${results.length} รายการสำหรับ "${userText}":\n\n${formatted}\n\n─────────────\n📊 ดูราคาทั้งหมด: ${process.env.WEB_URL || 'https://your-account.github.io/price-bot'}`
      }];
    }

    await replyToLine(event.replyToken, replyMessages);
  }

  res.status(200).json({ ok: true });
}
