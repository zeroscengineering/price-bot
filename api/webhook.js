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
      p.pcn?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.refrigerant?.toLowerCase().includes(q)
    )
    .slice(0, 10);
}

// สีตามแบรนด์
function brandColor(brand) {
  if (!brand) return '#4b5563';
  const b = brand.toLowerCase();
  if (b.includes('gmcc'))     return '#16a34a';
  if (b.includes('emerson') || b.includes('copeland')) return '#1a56db';
  if (b.includes('panasonic')) return '#1e3a8a';
  return '#7c3aed';
}

// สร้าง Flex Bubble แต่ละชิ้น
function makeBubble(p) {
  const color     = brandColor(p.brand);
  const price     = Number(p.price).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const priceVat  = Number(p.price_vat).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const brand     = p.brand || p.category || '';
  const ref       = p.refrigerant ? ` · ${p.refrigerant}` : '';

  // specs rows
  const rows = [];
  if (p.btu)     rows.push({ label: 'BTU/Hr.', value: Number(p.btu).toLocaleString('th-TH') });
  if (p.hp)      rows.push({ label: 'แรงม้า',  value: p.hp + ' HP' });
  if (p.watt)    rows.push({ label: 'Watt',    value: p.watt + ' W' });
  if (p.cc)      rows.push({ label: 'ปริมาตร', value: p.cc + ' CC' });
  if (p.voltage) rows.push({ label: 'ไฟฟ้า',   value: p.voltage });
  if (p.pcn)     rows.push({ label: 'PCN',     value: p.pcn });

  const specContents = rows.map(r => ({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: r.label, size: 'xs', color: '#9ca3af', flex: 3 },
      { type: 'text', text: r.value, size: 'xs', color: '#374151', flex: 5, align: 'end', weight: 'bold' }
    ]
  }));

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      backgroundColor: color, paddingAll: '14px',
      contents: [
        { type: 'text', text: brand + ref, size: 'xs', color: '#ffffff', opacity: 0.85 },
        { type: 'text', text: p.model || p.name, size: 'lg', color: '#ffffff', weight: 'bold', wrap: true }
      ]
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'none',
      contents: [
        // ชื่อสินค้า
        { type: 'text', text: p.name || p.model, size: 'xxs', color: '#6b7280', wrap: true, margin: 'none' },
        { type: 'separator', margin: 'md' },
        // Specs
        ...specContents,
        { type: 'separator', margin: 'md' },
        // ราคา
        {
          type: 'box', layout: 'horizontal', margin: 'md',
          contents: [
            { type: 'text', text: 'ราคา (ไม่รวม VAT)', size: 'xs', color: '#6b7280', flex: 5 },
            { type: 'text', text: '฿' + price, size: 'sm', color: '#111827', weight: 'bold', flex: 4, align: 'end' }
          ]
        },
        {
          type: 'box', layout: 'horizontal', margin: 'xs',
          contents: [
            { type: 'text', text: 'รวม VAT 7%', size: 'xs', color: '#6b7280', flex: 5 },
            { type: 'text', text: '฿' + priceVat, size: 'md', color: color, weight: 'bold', flex: 4, align: 'end' }
          ]
        }
      ]
    }
  };
}

// Flex Message กรณีไม่พบ
function notFoundFlex(text) {
  return {
    type: 'flex',
    altText: `ไม่พบสินค้า "${text}"`,
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
        contents: [
          { type: 'text', text: '🔍', size: 'xxl', align: 'center' },
          { type: 'text', text: `ไม่พบ "${text}"`, weight: 'bold', size: 'md', align: 'center', wrap: true },
          { type: 'text', text: 'ลองพิมพ์ชื่อรุ่น เช่น', size: 'sm', color: '#9ca3af', align: 'center', margin: 'md' },
          {
            type: 'box', layout: 'vertical', margin: 'sm', spacing: 'sm',
            contents: ['FL1257-SR','ZR24K3','ZE36KUE','9JD420DAA22','AL4088-SZA'].map(ex => ({
              type: 'box', layout: 'horizontal', backgroundColor: '#f3f4f6', cornerRadius: '6px', paddingAll: '8px',
              contents: [{ type: 'text', text: ex, size: 'sm', color: '#374151', align: 'center' }]
            }))
          }
        ]
      }
    }
  };
}

// Flex carousel สำหรับผลลัพธ์
function resultFlex(text, results) {
  const bubbles = results.map(makeBubble);
  return {
    type: 'flex',
    altText: `พบ ${results.length} รายการสำหรับ "${text}"`,
    contents: bubbles.length === 1
      ? bubbles[0]
      : { type: 'carousel', contents: bubbles }
  };
}

// ส่งข้อความกลับ LINE
function replyLine(token, messages) {
  const body = JSON.stringify({ replyToken: token, messages });
  return new Promise(function(resolve, reject) {
    const req = https.request({
      hostname: 'api.line.me',
      path: '/v2/bot/message/reply',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN,
        'Content-Length': Buffer.byteLength(body)
      }
    }, function(res) { res.on('data', function(){}); res.on('end', resolve); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// อ่าน raw body
function readBody(req) {
  return new Promise(function(resolve, reject) {
    const chunks = [];
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

  const rawBody = await readBody(req);

  const secret = process.env.LINE_CHANNEL_SECRET;
  const sig    = req.headers['x-line-signature'];
  if (secret && sig) {
    const hash = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64');
    if (hash !== sig) return res.status(401).send('Invalid signature');
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch(e) { return res.status(400).send('Bad JSON'); }

  for (const event of (payload.events || [])) {
    if (event.type !== 'message' || !event.message || event.message.type !== 'text') continue;
    const text    = event.message.text.trim();
    const results = search(text);
    const flex    = results.length === 0 ? notFoundFlex(text) : resultFlex(text, results);
    await replyLine(event.replyToken, [flex]);
  }

  return res.status(200).json({ ok: true });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
