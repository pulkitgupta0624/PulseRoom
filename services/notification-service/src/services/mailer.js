const nodemailer = require('nodemailer');
const config = require('../config');

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: false,
  auth: config.smtpUser
    ? {
        user: config.smtpUser,
        pass: config.smtpPass
      }
    : undefined
});

const sendEmail = async ({ to, subject, html, attachments }) =>
  transporter.sendMail({
    from: config.mailFrom,
    to,
    subject,
    html,
    attachments
  });

module.exports = {
  sendEmail
};
