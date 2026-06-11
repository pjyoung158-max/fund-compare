/**
 * fetch-data.js
 * 공공데이터 API에서 변액보험 전체 데이터를 받아서 JSON 파일로 저장
 * 실행: node fetch-data.js
 * 매월 1회 실행하면 됩니다
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVICE_KEY = '2fc1df67a5c9efdb221465015fca3db1bd7d007d1019a17e80131e3f16161cbf';
const API_URL = 'https://apis.data.go.kr/1160100/service/GetVariableInsuranceInfoService/getFundInfo';
const OUTPUT_FILE = path.join(__dirname, 'data', 'funds.json');

function guessType(fndNm) {
  const nm = fndNm || '';
  if (nm.includes('MMF') || nm.includes('달러MMF')) return 'MMF';
  if (nm.includes('ELS') || nm.includes('주가지수ELS') || nm.includes('달러ELS')) return 'ELS형';
  if (nm.includes('TDF') || nm.includes('은퇴맞춤') || nm.includes('라이프사이클')) return 'TDF형';
  if (nm.includes('채권') || nm.includes('국채') || nm.includes('공사채') || nm.includes('하이일드')) return '채권형';
  if (nm.includes('혼합') || nm.includes('자산배분') || nm.includes('밸런스') || nm.includes('균형') || nm.includes('MVP') || nm.includes('OCIO') || nm.includes('EMP')) return '혼합형';
  if (nm.includes('주식') || nm.includes('인덱스') || nm.includes('ETF') || nm.includes('성장') || nm.includes('배당') || nm.includes('가치') || nm.includes('재간접') || nm.includes('글로벌') || nm.includes('미국') || nm.includes('나스닥') || nm.includes('중국') || nm.includes('일본') || nm.includes('유럽') || nm.includes('아시아') || nm.includes('이머징') || nm.includes('브릭스') || nm.includes('코리아')) return '주식형';
  return '기타';
}

function formatDate(d) {
  if (!d || d.length !== 8) return d || '-';
  return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`;
}

async function main() {
  console.log('🚀 변액보험 데이터 수집 시작...');
  console.log('⏱  약 1~2분 소요됩니다\n');

  // data 폴더 생성
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
  }

  // 1단계: 전체 건수 확인
  console.log('📡 전체 건수 확인 중...');
  const first = await axios.get(API_URL, {
    params: { serviceKey: SERVICE_KEY, resultType: 'json', pageNo: 1, numOfRows: 1 }
  });
  const total = parseInt(first.data?.response?.body?.totalCount) || 0;
  console.log(`📊 총 ${total.toLocaleString()}개 레코드 발견\n`);

  // 2단계: 전체 데이터 수집
  console.log('📥 전체 데이터 수집 중...');
  const full = await axios.get(API_URL, {
    params: { serviceKey: SERVICE_KEY, resultType: 'json', pageNo: 1, numOfRows: total },
    timeout: 120000
  });

  const items = full.data?.response?.body?.items?.item || [];
  const list = Array.isArray(items) ? items : [items];
  console.log(`✅ ${list.length.toLocaleString()}개 레코드 수집 완료\n`);

  // 3단계: 펀드코드별 최신 날짜만 남기기
  console.log('🔧 중복 제거 중 (펀드코드별 최신 날짜)...');
  const latestByCode = {};
  list.forEach(f => {
    const code = f.fndCd;
    if (!code) return;
    if (!latestByCode[code] || f.basDt > latestByCode[code].basDt) {
      latestByCode[code] = f;
    }
  });
  console.log(`✅ 중복 제거 후 ${Object.keys(latestByCode).length.toLocaleString()}개 펀드\n`);

  // 4단계: 보험사별 그룹핑
  console.log('📁 보험사별 그룹핑 중...');
  const grouped = {};
  const allFundsList = [];

  Object.values(latestByCode).forEach(f => {
    const key = f.cmpyNm || '기타';
    if (!grouped[key]) grouped[key] = [];
    const fund = {
      fndNm: f.fndNm || '-',
      fndCd: f.fndCd || '-',
      fndType: guessType(f.fndNm),
      basprc: parseFloat(f.basprc) || 0,
      nPptAmt: Math.round((parseFloat(f.nPptAmt) || 0) / 100000000),
      basDt: formatDate(f.basDt),
      cmpyNm: f.cmpyNm || '-',
    };
    grouped[key].push(fund);
    allFundsList.push(fund);
  });

  const insurers = Object.entries(grouped)
    .map(([name, funds]) => ({
      name,
      fundCount: funds.length,
      totalAum: funds.reduce((s, f) => s + f.nPptAmt, 0),
      basDt: funds[0]?.basDt || '',
    }))
    .sort((a, b) => b.totalAum - a.totalAum);

  console.log(`✅ ${insurers.length}개 보험사, ${allFundsList.length}개 펀드\n`);

  // 5단계: JSON 파일로 저장
  console.log('💾 JSON 파일 저장 중...');
  const output = {
    updatedAt: new Date().toISOString(),
    insurers,
    grouped,
    allFundsList,
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output), 'utf8');
  const size = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);
  console.log(`✅ 저장 완료: ${OUTPUT_FILE} (${size}MB)\n`);
  console.log('🎉 완료! 이제 node server.js 로 서버를 시작하면 빠르게 로딩됩니다.');
}

main().catch(e => {
  console.error('❌ 오류:', e.message);
  process.exit(1);
});
