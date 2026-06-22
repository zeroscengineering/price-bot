const crypto = require('crypto');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

/* ─────────────────────────────────────────
   COMPARE CONFIG (Google Sheets)
   ───────────────────────────────────────── */
const SHEET_ID   = process.env.SHEET_ID   || '11iKq4ktHv_c6udgr1WYkSsIiB8qUBD-0wCbwmKKOB4A';
const SHEET_NAME = process.env.SHEET_NAME || 'compare';

// ดึงข้อมูลจาก Google Sheets REST API (sheet ต้องเปิด public)
function fetchSheetRows() {
  return new Promise(function(resolve, reject) {
    var apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return reject(new Error('GOOGLE_API_KEY not set'));
    var range  = encodeURIComponent(SHEET_NAME + '!A1:X');
    var url    = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID +
                 '/values/' + range + '?key=' + apiKey;
    https.get(url, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(data).values || []); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ค้นหาในคอลัมน์ I–W (index 8–22) ทุกแถว
function searchCompareAll(rows, keyword) {
  var q = keyword.toLowerCase();
  var results = [];
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    for (var c = 8; c <= 22; c++) {
      var cell = (row[c] || '').toString();
      if (cell.toLowerCase().indexOf(q) >= 0) {
        results.push({
          model:          row[0] || '-',
          capTube:        row[1] || '-',
          matchedKeyword: cell,
          specLink:       row[23] || ''
        });
        break; // ป้องกันซ้ำต่อแถว
      }
    }
  }
  return results;
}

// สร้าง Flex Bubble แบบ Liquid Glass
function buildCompareBubble(r) {
  var bodyContents = [
    { type: 'text', text: 'ผลการเทียบรุ่น', weight: 'bold', size: 'lg',
      color: '#006064', align: 'center', margin: 'sm' },
    // รุ่นที่ค้นหา
    { type: 'box', layout: 'vertical', margin: 'lg',
      backgroundColor: '#FFFFFF', cornerRadius: 'lg', paddingAll: '15px',
      borderColor: '#E2E8F0', borderWidth: 'light',
      contents: [
        { type: 'text', text: 'รุ่นที่ค้นหา', size: 'xs', color: '#0F4C81', weight: 'bold' },
        { type: 'text', text: r.matchedKeyword, size: 'sm', color: '#2D3748', wrap: true, margin: 'xs' }
      ]
    },
    // รุ่นเทียบ
    { type: 'box', layout: 'vertical', margin: 'md',
      backgroundColor: '#FFFFFF', cornerRadius: 'lg', paddingAll: '15px',
      borderColor: '#E2E8F0', borderWidth: 'light',
      contents: [
        { type: 'text', text: 'รุ่นเทียบ', size: 'xs', color: '#718096' },
        { type: 'text', text: r.model, size: 'md', color: '#3182CE',
          wrap: true, weight: 'bold', margin: 'xs' }
      ]
    },
    // ขนาดแคปทิ้วป์
    { type: 'box', layout: 'vertical', margin: 'md',
      backgroundColor: '#FFFFFF', cornerRadius: 'lg', paddingAll: '15px',
      borderColor: '#E2E8F0', borderWidth: 'light',
      contents: [
        { type: 'text', text: 'ขนาดแคปทิ้วป์-บีทียู', size: 'xs', color: '#718096' },
        { type: 'text', text: r.capTube, size: 'sm', color: '#2D3748',
          wrap: true, weight: 'bold', margin: 'xs' }
      ]
    }
  ];

  // ปุ่ม Spec (ถ้ามี link)
  if (r.specLink) {
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'xl',
      contents: [{
        type: 'box', layout: 'horizontal', spacing: 'md',
        paddingAll: '14px', cornerRadius: 'xxl',
        background: { type: 'linearGradient', angle: '135deg',
                      startColor: '#FFFFFFE6', endColor: '#7DD3FC80' },
        borderColor: '#FFFFFF', borderWidth: 'bold',
        justifyContent: 'center', alignItems: 'center',
        action: { type: 'uri', label: 'ดูข้อมูล Spec', uri: r.specLink },
        contents: [
          { type: 'text', text: '📖', flex: 0, size: 'md' },
          { type: 'text', text: 'ดูข้อมูล Spec', color: '#0284C7',
            weight: 'bold', size: 'sm', flex: 0 }
        ]
      }]
    });
  }

  return {
    type: 'bubble', size: 'mega',
    styles: { body: { backgroundColor: '#F0F8FF' } },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: bodyContents }
  };
}

// สร้าง array ของ Flex messages (max 5, ละ 12 การ์ด)
function buildCompareMessages(results) {
  var limited = results.slice(0, 60);
  var messages = [];
  for (var i = 0; i < limited.length; i += 12) {
    var chunk   = limited.slice(i, i + 12);
    var bubbles = chunk.map(buildCompareBubble);
    messages.push({
      type: 'flex',
      altText: 'ผลการค้นหารุ่นเทียบ (' + results.length + ' รายการ)',
      contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles }
    });
  }
  return messages;
}

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
  var q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return getProducts().filter(function(p) {
    return (p.model && p.model.toLowerCase().indexOf(q) >= 0) ||
           (p.name  && p.name.toLowerCase().indexOf(q)  >= 0) ||
           (p.pcn   && p.pcn.toLowerCase().indexOf(q)   >= 0) ||
           (p.category && p.category.toLowerCase().indexOf(q) >= 0) ||
           (p.refrigerant && p.refrigerant.toLowerCase().indexOf(q) >= 0);
  }).slice(0, 10);
}

// สีตามแบรนด์
function brandColor(brand) {
  if (!brand) return '#4b5563';
  var b = brand.toLowerCase();
  if (b.indexOf('gmcc') >= 0)    return '#16a34a';
  if (b.indexOf('emerson') >= 0 || b.indexOf('copeland') >= 0) return '#1a56db';
  if (b.indexOf('panasonic') >= 0) return '#1e3a8a';
  return '#7c3aed';
}

// format ตัวเลข
function fmtNum(n) {
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// สร้าง Flex Bubble
function makeBubble(p) {
  var color    = brandColor(p.brand);
  var brand    = p.brand || p.category || 'สินค้า';
  var ref      = p.refrigerant ? ' - ' + p.refrigerant : '';
  var title    = (p.model || p.name || '').substring(0, 40);
  var subtitle = (p.name  || p.model || '').substring(0, 60);
  var price    = fmtNum(p.price);
  var priceVat = fmtNum(p.price_vat);

  // สร้าง spec rows
  var specRows = [];
  if (p.btu)     specRows.push(['BTU/Hr.', Number(p.btu).toLocaleString('th-TH')]);
  if (p.hp)      specRows.push(['แรงม้า', p.hp + ' HP']);
  if (p.watt)    specRows.push(['Watt', p.watt + ' W']);
  if (p.cc)      specRows.push(['ปริมาตร', p.cc + ' CC']);
  if (p.voltage) specRows.push(['ไฟฟ้า', String(p.voltage)]);
  if (p.pcn)     specRows.push(['รหัส', String(p.pcn).substring(0, 20)]);

  var specContents = specRows.map(function(r) {
    return {
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: r[0], size: 'xs', color: '#888888', flex: 4 },
        { type: 'text', text: r[1], size: 'xs', color: '#333333', flex: 5, align: 'end', weight: 'bold' }
      ]
    };
  });

  var bodyContents = [
    { type: 'text', text: subtitle, size: 'xxs', color: '#888888', wrap: true }
  ];

  if (specContents.length > 0) {
    bodyContents.push({ type: 'separator', margin: 'md' });
    for (var i = 0; i < specContents.length; i++) {
      bodyContents.push(specContents[i]);
    }
  }

  bodyContents.push({ type: 'separator', margin: 'md' });
  if (p.list_price) {
    bodyContents.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: 'ราคาตั้ง', size: 'xs', color: '#aaaaaa', flex: 6 },
        { type: 'text', text: 'B' + fmtNum(p.list_price), size: 'xs', color: '#aaaaaa',
          decoration: 'line-through', flex: 4, align: 'end' }
      ]
    });
  }
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: 'ราคา (ยังไม่รวม VAT)', size: 'xs', color: '#888888', flex: 6 },
      { type: 'text', text: 'B' + price, size: 'sm', color: '#222222', weight: 'bold', flex: 4, align: 'end' }
    ]
  });
  bodyContents.push({
    type: 'box', layout: 'horizontal', margin: 'xs',
    contents: [
      { type: 'text', text: 'รวม VAT 7%', size: 'xs', color: '#888888', flex: 6 },
      { type: 'text', text: 'B' + priceVat, size: 'md', color: color, weight: 'bold', flex: 4, align: 'end' }
    ]
  });

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      paddingAll: '14px',
      backgroundColor: color,
      contents: [
        { type: 'text', text: brand + ref, size: 'xs', color: '#ffffffcc' },
        { type: 'text', text: title, size: 'lg', color: '#ffffff', weight: 'bold', wrap: true }
      ]
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '14px',
      contents: bodyContents
    }
  };
}

// Flex กรณีไม่พบ
function notFoundFlex(text) {
  var q = text.substring(0, 30);
  return {
    type: 'flex',
    altText: 'ไม่พบสินค้า ' + q,
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
        contents: [
          { type: 'text', text: 'ไม่พบ "' + q + '"', weight: 'bold', size: 'md', align: 'center', wrap: true },
          { type: 'text', text: 'ลองพิมพ์เช่น', size: 'sm', color: '#888888', align: 'center' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'FL1257-SR', size: 'sm', align: 'center', color: '#1a56db' },
          { type: 'text', text: 'ZR24K3', size: 'sm', align: 'center', color: '#1a56db', margin: 'sm' },
          { type: 'text', text: 'ZE36KUE', size: 'sm', align: 'center', color: '#1a56db', margin: 'sm' },
          { type: 'text', text: '9JD420DAA22', size: 'sm', align: 'center', color: '#1a56db', margin: 'sm' },
          { type: 'text', text: 'AL4088-SZA', size: 'sm', align: 'center', color: '#1a56db', margin: 'sm' }
        ]
      }
    }
  };
}

// Flex carousel หรือ bubble เดี่ยว
function resultFlex(text, results) {
  var bubbles = results.map(makeBubble);
  var contents = bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles };
  return {
    type: 'flex',
    altText: 'พบ ' + results.length + ' รายการ: ' + text.substring(0, 20),
    contents: contents
  };
}

// ส่ง message กลับ LINE และ log response
function replyLine(token, messages) {
  var body = JSON.stringify({ replyToken: token, messages: messages });
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
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        if (res.statusCode !== 200) {
          console.error('LINE API error', res.statusCode, data);
        }
        resolve(data);
      });
    });
    req.on('error', function(e) { console.error('Request error:', e); reject(e); });
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
    return res.status(200).send('LINE Bot Webhook is running OK');
  }
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  var rawBody = await readBody(req);

  var secret = process.env.LINE_CHANNEL_SECRET;
  var sig    = req.headers['x-line-signature'];
  if (secret && sig) {
    var hash = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64');
    if (hash !== sig) return res.status(401).send('Invalid signature');
  }

  var payload;
  try { payload = JSON.parse(rawBody); }
  catch(e) { return res.status(400).send('Bad JSON'); }

  for (var i = 0; i < (payload.events || []).length; i++) {
    var event = payload.events[i];
    if (event.type !== 'message' || !event.message || event.message.type !== 'text') continue;

    var text = event.message.text.trim();

    // ── ฟีเจอร์ เทียบ- ──────────────────────────────
    if (text.toLowerCase().startsWith('เทียบ-')) {
      var keyword = text.replace(/^เทียบ-/i, '').trim();
      if (!keyword) continue;
      try {
        var rows       = await fetchSheetRows();
        var cmpResults = searchCompareAll(rows, keyword);
        if (cmpResults.length === 0) {
          await replyLine(event.replyToken, [{ type: 'text', text: 'ไม่พบรุ่นเทียบสำหรับ "' + keyword + '"' }]);
        } else {
          await replyLine(event.replyToken, buildCompareMessages(cmpResults));
        }
      } catch(err) {
        console.error('Compare error:', err);
        await replyLine(event.replyToken, [{ type: 'text', text: 'เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่' }]);
      }
      continue;
    }

    // ── ฟีเจอร์ ราคาสินค้า ──────────────────────────
    if (!text.toLowerCase().startsWith('ราคา-')) continue;
    var query   = text.replace(/^ราคา-/i, '').trim();
    if (!query) continue;
    var results = search(query);
    try {
      var flex = results.length === 0 ? notFoundFlex(query) : resultFlex(query, results);
      await replyLine(event.replyToken, [flex]);
    } catch(err) {
      console.error('Flex error, fallback to text:', err);
      var fallback = results.length === 0
        ? 'ไม่พบสินค้า "' + query + '"'
        : 'พบ ' + results.length + ' รายการ: ' + results.map(function(p){ return p.model; }).join(', ');
      await replyLine(event.replyToken, [{ type: 'text', text: fallback }]);
    }
  }

  return res.status(200).json({ ok: true });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
