/**
 * Email Utility using Nodemailer
 */

const nodemailer = require('nodemailer');
const logger = require('./logger');
const AppConfig = require('../models/AppConfig');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

/**
 * Send email
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    // Check if email sending is enabled in admin panel
    const config = await AppConfig.getConfig();
    if (!config.featureFlags?.enableEmailSending) {
      logger.info(`Email sending is disabled in admin panel. Skipping email to ${to}`);
      return { success: false, error: 'Email sending is disabled' };
    }

    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'bibbly <noreply@bibbly.app>',
      to,
      subject,
      html,
      text
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send verification email
 */
const sendVerificationEmail = async (email, token, name) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; }
        .logo { font-size: 32px; font-weight: bold; color: #FF6B6B; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #FF6B6B; color: white; text-decoration: none; border-radius: 25px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">bibbly</div>
        </div>
        <div class="content">
          <h2>Hey ${name}! 👋</h2>
          <p>Welcome to bibbly - where you can finally talk to people you know but never had the courage to text!</p>
          <p>Please verify your email address to get started:</p>
          <center>
            <a href="${verificationUrl}" class="button">Verify Email</a>
          </center>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          <p>This link expires in 24 hours.</p>
        </div>
        <div class="footer">
          <p>If you didn't create an account, please ignore this email.</p>
          <p>© ${new Date().getFullYear()} bibbly. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify your bibbly account ✉️',
    html,
    text: `Hey ${name}! Welcome to bibbly. Please verify your email: ${verificationUrl}`
  });
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (email, token, name) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; }
        .logo { font-size: 32px; font-weight: bold; color: #FF6B6B; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #FF6B6B; color: white; text-decoration: none; border-radius: 25px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">bibbly</div>
        </div>
        <div class="content">
          <h2>Password Reset Request</h2>
          <p>Hey ${name},</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <center>
            <a href="${resetUrl}" class="button">Reset Password</a>
          </center>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          <p>This link expires in 1 hour.</p>
          <p><strong>If you didn't request this, please ignore this email or contact support if you're concerned.</strong></p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} bibbly. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset your bibbly password 🔐',
    html,
    text: `Hey ${name}! Reset your password: ${resetUrl}. This link expires in 1 hour.`
  });
};

/**
 * Send welcome email after verification
 */
const sendWelcomeEmail = async (email, name, username) => {
  const profileUrl = `${process.env.APP_URL}/${username}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; }
        .logo { font-size: 32px; font-weight: bold; color: #FF6B6B; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #FF6B6B; color: white; text-decoration: none; border-radius: 25px; margin: 20px 0; }
        .tip { background: #fff; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #FF6B6B; }
        .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">bibbly</div>
        </div>
        <div class="content">
          <h2>You're all set, ${name}! 🎉</h2>
          <p>Your bibbly account is now verified and ready to go.</p>
          
          <div class="tip">
            <strong>💡 Pro tip:</strong> Share your profile link on your social media to let people know they can message you!
            <br><br>
            Your link: <a href="${profileUrl}">${profileUrl}</a>
          </div>
          
          <div class="tip">
            <strong>🎭 Stay anonymous:</strong> When you message someone through their link, you can stay anonymous until you're ready to reveal yourself.
          </div>
          
          <center>
            <a href="${profileUrl}" class="button">View My Profile</a>
          </center>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} bibbly. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Welcome to bibbly! Your account is ready 🚀',
    html,
    text: `Welcome to bibbly, ${name}! Your account is verified. Share your profile: ${profileUrl}`
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail
};

