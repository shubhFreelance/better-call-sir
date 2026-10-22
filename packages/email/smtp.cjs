const nodemailer = require("nodemailer");
const invalid = () =>
  Object.assign(Error("EMAIL_CONFIGURATION"), { definite: true });
function config() {
  const user = (process.env.SMTP_USER || "").trim().toLowerCase();
  const from = (process.env.SMTP_FROM || user).trim().toLowerCase();
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = (process.env.SMTP_SECURE || "true") === "true";
  if (
    (process.env.SMTP_HOST || "smtp.gmail.com") !== "smtp.gmail.com" ||
    !["true", "false"].includes(process.env.SMTP_SECURE || "true") ||
    !((port === 465 && secure) || (port === 587 && !secure)) ||
    !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(user) ||
    from !== user ||
    !process.env.SMTP_PASSWORD?.replace(/\s/g, "")
  )
    throw invalid();
  return {
    host: "smtp.gmail.com",
    port,
    secure,
    requireTLS: true,
    auth: { user, pass: process.env.SMTP_PASSWORD.replace(/\s/g, "") },
    tls: {
      servername: "smtp.gmail.com",
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
    connectionTimeout: 8000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
function sender() {
  return config().auth.user;
}
async function send(payload, id) {
  const options = config();
  if (payload.from !== options.auth.user) throw invalid();
  const transport = nodemailer.createTransport(options);
  try {
    const info = await transport.sendMail({
      from: { name: "Better Call Sir", address: payload.from },
      to: { address: payload.to },
      subject: payload.subject,
      text: payload.text,
      envelope: { from: payload.from, to: [payload.to] },
      messageId: `<bcs-email-${id}@${payload.from.split("@")[1]}>`,
    });
    if (
      !info.accepted?.some(
        (address) => String(address).toLowerCase() === payload.to.toLowerCase(),
      )
    )
      throw Object.assign(Error("PROVIDER_REJECTED"), { definite: true });
    // SMTP has no receipt UUID; this is the local correlation ID, not proof of inbox delivery.
    return id;
  } catch (error) {
    if (error.definite) throw error;
    throw Object.assign(
      Error(
        error.code === "EAUTH"
          ? "EMAIL_CONFIGURATION"
          : error.responseCode >= 400 && error.responseCode < 600
            ? "PROVIDER_REJECTED"
            : "PROVIDER_UNCERTAIN",
      ),
      {
        definite:
          error.code === "EAUTH" ||
          (error.responseCode >= 400 && error.responseCode < 600),
      },
    );
  } finally {
    transport.close();
  }
}
module.exports = { sender, send };
