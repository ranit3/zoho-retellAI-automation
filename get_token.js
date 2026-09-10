require('dotenv').config();

const axios = require('axios');
const { getAccessToken } = require('./services/zohoAuth');

async function test() {
  try {
    const token = await getAccessToken();
    const res = await axios.get('https://www.zohoapis.in/crm/v3/Leads?per_page=1', {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`
      }
    });
    console.log(res.status, res.data);
  } catch(e) {
    console.log("Zoho token error", e.response?.status, e.response?.data || e.message);
  }
}
test();
