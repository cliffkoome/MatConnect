require('dotenv').config();
const axios = require('axios');

const options = {
  apiKey: process.env.AFRICAS_TALKING_API_KEY,
  username: process.env.AFRICAS_TALKING_USERNAME,
};

const sendSms = async (phoneNumber, message) => {
  const { apiKey, username } = options;

  if (!apiKey || !username) {
    console.log("Africa's Talking credentials not set. Skipping SMS.");
    return Promise.resolve({ status: 'skipped' });
  }

  try {
    const data = new URLSearchParams({
      username: username,
      to: phoneNumber,
      message: message,
    }).toString();

    const response = await axios.post(
      'https://api.sandbox.africastalking.com/version1/messaging',
      data,
      {
        headers: {
          'Accept': 'application/json',
          'apiKey': apiKey,
        },
      }
    );

    console.log('SMS sent successfully:', response.data);
    return response.data;
  } catch (error) {
    const errorMessage = error.response
      ? JSON.stringify(error.response.data)
      : error.toString();
    console.error(`Error sending SMS: ${errorMessage}`);
    throw error;
  }
};

module.exports = { sendSms };
