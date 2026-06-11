const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const SERVICE_KEY = '2fc1df67a5c9efdb221465015fca3db1bd7d007d1019a17e80131e3f16161cbf';
const API_URL = 'https://apis.data.go.kr/1160100/service/GetVariableInsuranceInfoService/getFundInfo';
const DATA_FILE = path.join(__dirname, 'data', 'funds.json');

let cache = null;

function loadFromFile() {
  if (!fs.existsSync(DATA_FILE)) return null;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    console.log(`📂 파일에서 로딩: ${data.insurers.length}개 보험사, ${data.allFundsList.length}개 펀드 (업데이트: ${data.updatedAt})`);
    return data;
  } catch(e) {
    console.error('파일 읽기 오류:', e.message);
    return null;
  }
}

function getData() {
  if (!cache) {
    cache = loadFromFile();
    if (!cache) {
      console.error('❌ data/funds.json 파일이 없어요! 먼저 node fetch-data.js 를 실행해주세요.');
      return null;
    }
  }
  return cache;
}

function formatDate(d) {
  if (!d || d.length !== 8) return d || '-';
  return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`;
}

function getStartDate(months) {
  const now = new Date();
  now.setMonth(now.getMonth() - months);
  return now.toISOString().slice(0,10).replace(/-/g,'');
}

// 서버 시작 시 파일 미리 로딩
cache = loadFromFile();
if (!cache) {
  console.log('⚠️  data/funds.json 없음 → 먼저 node fetch-data.js 실행 필요');
}

app.get('/api/insurers', (req, res) => {
  const data = getData();
  if (!data) return res.status(503).json({ success: false, error: 'node fetch-data.js 를 먼저 실행해주세요' });
  res.json({ success: true, data: data.insurers });
});

app.get('/api/funds', (req, res) => {
  const { insurer } = req.query;
  if (!insurer) return res.status(400).json({ success: false, error: 'insurer 필요' });
  const data = getData();
  if (!data) return res.status(503).json({ success: false, error: 'node fetch-data.js 를 먼저 실행해주세요' });
  const funds = data.grouped[insurer];
  if (!funds) return res.status(404).json({ success: false, error: '보험사 없음' });
  res.json({ success: true, data: funds });
});

app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.json({ success: true, data: [] });
  const data = getData();
  if (!data) return res.status(503).json({ success: false, error: 'node fetch-data.js 를 먼저 실행해주세요' });
  const results = data.allFundsList
    .filter(f => (f.fndNm||'').includes(q))
    .slice(0, 30);
  res.json({ success: true, data: results });
});

// 펀드 히스토리는 실시간 API 호출
app.get('/api/fund-history', async (req, res) => {
  const { fndCd } = req.query;
  if (!fndCd) return res.status(400).json({ success: false, error: 'fndCd 필요' });
  try {
    const end = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const r = await axios.get(API_URL, {
      params: { serviceKey: SERVICE_KEY, resultType: 'json', fndCd, beginBasDt: '20000101', endBasDt: end, numOfRows: 9999, pageNo: 1 },
      timeout: 30000
    });
    const items = r.data?.response?.body?.items?.item || [];
    const list = Array.isArray(items) ? items : [items];
    const history = list
      .filter(f => f.basDt && f.basprc)
      .map(f => ({ date: formatDate(f.basDt), rawDate: f.basDt, basprc: parseFloat(f.basprc) || 0, nPptAmt: Math.round((parseFloat(f.nPptAmt) || 0) / 100000000) }))
      .sort((a, b) => a.rawDate.localeCompare(b.rawDate));

    const now = history[history.length - 1];
    const returns = {};
    const periods = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '2Y': 24, '3Y': 36, '5Y': 60 };
    if (now) {
      for (const [label, m] of Object.entries(periods)) {
        const startDt = getStartDate(m);
        const past = history.filter(h => h.rawDate <= startDt).pop() || history[0];
        if (past && past.basprc > 0) returns[label] = +((now.basprc - past.basprc) / past.basprc * 100).toFixed(2);
      }
    }
    res.json({ success: true, data: history, returns });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.listen(3000, () => {
  console.log('\n🚀 서버 시작: http://localhost:3000');
  if (cache) {
    console.log(`✅ 데이터 준비 완료: ${cache.insurers.length}개 보험사, ${cache.allFundsList.length}개 펀드`);
  }
});
