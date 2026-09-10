const axios = require('axios');

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
    if (accessToken && Date.now() < tokenExpiresAt) {
        return accessToken;
    }

    try {
        const response = await axios.post(`${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
            params: {
                refresh_token: process.env.ZOHO_REFRESH_TOKEN,
                client_id: process.env.ZOHO_CLIENT_ID,
                client_secret: process.env.ZOHO_CLIENT_SECRET,
                grant_type: 'refresh_token'
            }
        });

        accessToken = response.data.access_token;
        if (!accessToken) {
            console.error("Zoho Auth Error:", response.data);
            throw new Error("No access token returned");
        }
        tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;
        
        console.log("Successfully refreshed Zoho access token");
        return accessToken;
    } catch (error) {
        console.error("Failed to get Zoho access token:", error.response?.data || error.message);
        throw error;
    }
}

module.exports = {
    getAccessToken
};
