require("dotenv").config();
const AfricasTalking = require("africastalking");

const credentials = {
  apiKey: process.env.AFRICAS_TALKING_API_KEY,
  username: process.env.AFRICAS_TALKING_USERNAME,
};

// Check for credentials early and initialize the SDK.
let sms;
if (credentials.apiKey && credentials.username) {
  const at = AfricasTalking(credentials);
  sms = at.SMS;
} else {
  console.warn(
    "Africa's Talking credentials not set. SMS service is disabled.",
  );
}

const sendSms = async (phoneNumber, message) => {
  // If the SDK was not initialized, skip sending.
  if (!sms) {
    console.log("Skipping SMS: Africa's Talking service is not configured.");
    return { status: "skipped" };
  }

  try {
    const response = await sms.send({
      to: [phoneNumber], // The SDK expects an array of numbers
      message: message,
    });

    console.log("SMS sent successfully:", response);
    return response;
  } catch (error) {
    // The SDK provides a more structured error object
    console.error(`Error sending SMS: ${error.toString()}`);
    throw error;
  }
};

module.exports = { sendSms };
