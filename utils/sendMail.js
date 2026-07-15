import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const ZEPTO_API_URL = process.env.ZEPTO_API_URL;
const ZEPTO_API_KEY = process.env.ZEPTO_API_KEY;

export const sendMail = async ({ subject, to, html, name }) => {
  try {
    const payload = {
      bounce_address: "bounce@bounce.mazix.co.in",
      from: {
        address: "noreply@mazix.co.in",
      },
      to: [
        {
          email_address: {
            address: to,
            name: name,
          },
        },
      ],
      subject: subject,
      htmlbody: html,
    };

    const { data } = await axios.post(ZEPTO_API_URL, payload, {
      headers: {
        Authorization: ZEPTO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 30000,
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.log(JSON.stringify(error.response?.data, null, 2));
    // console.error("ZeptoMail Error:", error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};
