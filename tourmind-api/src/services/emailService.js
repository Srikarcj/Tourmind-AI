import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "../config/env.js";

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const smtpReady = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

const smtpTransporter = smtpReady
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    })
  : null;

const escapeHtml = value =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const statusColor = status => {
  if (status === "confirmed") return "#22c55e";
  if (status === "completed") return "#16a34a";
  if (status === "cancelled") return "#ef4444";
  if (status === "reviewed") return "#f59e0b";
  return "#eab308";
};

const statusCopyMap = {
  reviewed: {
    subject: "Booking Under Review",
    subtitle: "Your booking is currently being reviewed by the operations team."
  },
  confirmed: {
    subject: "Booking Confirmed",
    subtitle: "Your reservation has been confirmed."
  },
  completed: {
    subject: "Booking Completed",
    subtitle: "Your booking has been marked as completed."
  },
  cancelled: {
    subject: "Booking Cancelled",
    subtitle: "Your reservation request has been cancelled."
  }
};

const bookingDetailsTable = booking => `
  <table style="width:100%;border-collapse:collapse;margin-top:16px;background:#ffffff;border-radius:10px;overflow:hidden;">
    <tbody>
      ${[
        ["Booking ID", booking.id],
        ["Service", booking.serviceName],
        ["Type", booking.serviceType],
        ["Location", booking.serviceLocation],
        ["Dates", `${booking.startDate} to ${booking.endDate}`],
        ["Guests", booking.guests],
        ["Status", booking.status]
      ]
        .map(
          ([label, value]) => `
            <tr>
              <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;width:35%;">${escapeHtml(label)}</td>
              <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#111827;">${escapeHtml(value)}</td>
            </tr>
          `
        )
        .join("")}
    </tbody>
  </table>
`;

const makeTemplate = ({ title, subtitle, body, booking }) => `
  <div style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="padding:20px;background:linear-gradient(135deg,#0D1B2A,#2A9D8F);color:#ffffff;">
        <h1 style="margin:0;font-size:22px;">${escapeHtml(title)}</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.95;">${escapeHtml(subtitle)}</p>
      </div>
      <div style="padding:20px;">
        <p style="margin:0 0 14px;color:#374151;line-height:1.6;">${escapeHtml(body)}</p>
        ${bookingDetailsTable(booking)}
        <p style="margin:16px 0 0;color:#111827;">
          Support Contact: <strong>${escapeHtml(env.ADMIN_EMAIL)}</strong>
        </p>
      </div>
      <div style="padding:14px 20px;background:#f9fafb;color:#6b7280;font-size:12px;">
        This is an automated message from TourMind AI reservation system.
      </div>
    </div>
  </div>
`;

const sendWithResend = async ({ to, subject, html, text }) => {
  if (!resendClient) {
    return false;
  }

  await resendClient.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text
  });

  return true;
};

const sendWithSmtp = async ({ to, subject, html, text }) => {
  if (!smtpTransporter) {
    return false;
  }

  await smtpTransporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text
  });

  return true;
};

export const sendEmail = async ({ to, subject, html, text }) => {
  const recipients = Array.isArray(to) ? to : [to];

  if (recipients.length === 0) {
    return { delivered: false, provider: "none" };
  }

  if (await sendWithResend({ to: recipients, subject, html, text })) {
    return { delivered: true, provider: "resend" };
  }

  if (await sendWithSmtp({ to: recipients, subject, html, text })) {
    return { delivered: true, provider: "smtp" };
  }

  console.warn("Email provider not configured. Skipping email delivery.", { subject, to: recipients });
  return { delivered: false, provider: "none" };
};

export const sendBookingCreatedNotifications = async ({ booking, adminEmail }) => {
  const userHtml = makeTemplate({
    title: "Booking Request Received",
    subtitle: "Your reservation enquiry is now pending review.",
    body: "We have received your booking request. We will notify you once your reservation is confirmed.",
    booking
  });

  await sendEmail({
    to: booking.userEmail,
    subject: "Booking Request Received",
    html: userHtml,
    text: `Booking ${booking.id} is pending. We will notify you once confirmed.`
  });

  const adminHtml = makeTemplate({
    title: "New Booking Request",
    subtitle: "A new reservation enquiry requires review.",
    body: `User ${booking.userEmail} has requested a new booking.`,
    booking
  });

  await sendEmail({
    to: adminEmail,
    subject: "New Booking Request",
    html: adminHtml,
    text: `New booking request from ${booking.userEmail}. Booking ID: ${booking.id}.`
  });
};

export const sendBookingStatusNotification = async ({ booking }) => {
  const copy = statusCopyMap[booking.status] || {
    subject: "Booking Status Updated",
    subtitle: "Your booking status has changed."
  };

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
        <div style="padding:20px;background:#0D1B2A;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;">${escapeHtml(copy.subject)}</h1>
          <p style="margin:8px 0 0;font-size:14px;opacity:0.95;">${escapeHtml(copy.subtitle)}</p>
        </div>
        <div style="padding:20px;">
          <p style="margin:0 0 14px;color:#374151;">Your booking status has changed to
            <strong style="color:${statusColor(booking.status)};"> ${escapeHtml(booking.status.toUpperCase())}</strong>.
          </p>
          ${bookingDetailsTable(booking)}
          <p style="margin:16px 0 0;color:#111827;">Support Contact: <strong>${escapeHtml(env.ADMIN_EMAIL)}</strong></p>
        </div>
      </div>
    </div>
  `;

  await sendEmail({
    to: booking.userEmail,
    subject: copy.subject,
    html,
    text: `Booking ${booking.id} is now ${booking.status}.`
  });
};

export const sendTripItineraryExportEmail = async ({ to, location, itinerary }) => {
  const subject = `Trip Itinerary Export - ${location}`;
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px;">
      <div style="max-width:700px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
        <div style="padding:18px;background:#0D1B2A;color:#fff;">
          <h2 style="margin:0;">Trip Itinerary Export</h2>
          <p style="margin:8px 0 0;opacity:0.92;">Location: ${escapeHtml(location)}</p>
        </div>
        <div style="padding:20px;">
          <p style="margin-top:0;color:#374151;">${escapeHtml(itinerary.summary || "Your itinerary export")}</p>
          ${(itinerary.days || [])
            .map(
              day => `
                <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:10px;">
                  <p style="margin:0;font-weight:700;">Day ${escapeHtml(day.day)}: ${escapeHtml(day.title)}</p>
                  <p style="margin:8px 0 0;color:#4b5563;">Morning: ${escapeHtml(day?.timeSlots?.morning || "-")}</p>
                  <p style="margin:4px 0 0;color:#4b5563;">Afternoon: ${escapeHtml(day?.timeSlots?.afternoon || "-")}</p>
                  <p style="margin:4px 0 0;color:#4b5563;">Evening: ${escapeHtml(day?.timeSlots?.evening || "-")}</p>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    html,
    text: `${itinerary.summary || "Trip itinerary"}`
  });
};

