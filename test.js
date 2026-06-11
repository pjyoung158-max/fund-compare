const axios = require('axios');
const fs = require('fs');

axios.get('https://apis.data.go.kr/1160100/service/GetVariableInsuranceInfoService/getFundInfo', {
  params: {
    serviceKey: '2fc1df67a5c9efdb221465015fca3db1bd7d007d1019a17e80131e3f16161cbf',
    resultType: 'json',
    pageNo: 1,
    numOfRows: 9999,
  }
}).then(r => {
  const items = r.data.response.body.items.item;
  const unique = [...new Set(items.map(f => f.fndNm))];
  fs.writeFileSync('fundnames.txt', unique.join('\n'), 'utf8');
  console.log(`총 ${unique.length}개 저장완료 → fundnames.txt`);
}).catch(e => console.log(e.message));